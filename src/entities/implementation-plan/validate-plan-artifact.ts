import * as fs from "fs";
import * as path from "path";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import {
  emptyTableCellsDiagnostic,
  isMarkdownTableSeparatorRow,
  parseMarkdownTableBlocks,
  splitMarkdownTableRow
} from "../../shared/markdown/table";
import { CANONICAL_PHASE_HEADING_SYNTAX } from "./contract-messages";
import { parsePlan } from "./parse-plan";
import { validatePlanStructure } from "./validate-plan";

const REQUIRED_TOP_LEVEL_SECTIONS = ["Approval Summary", "Generation Bundle", "Phase Overview"];
const APPROVAL_SUMMARY_HEADERS = ["Area", "Decision"];
const APPROVAL_SUMMARY_AREAS = ["Approval scope", "Out of scope", "Sequencing risk", "Validation"];
const GENERATION_BUNDLE_HEADERS = ["Area", "Required", "Plan"];
const PHASE_OVERVIEW_HEADERS = ["Phase", "Goal", "Main work items", "Required checks"];
const BLOCKED_PLACEHOLDERS = [
  { pattern: /\bTBD\b/i, label: "TBD" },
  { pattern: /\bTODO\b/i, label: "TODO" },
  { pattern: /\bunknown\b/i, label: "unknown" },
  { pattern: /\bclarify later\b/i, label: "clarify later" },
  { pattern: /\bto be decided\b/i, label: "to be decided" }
];

function bodyAfterFrontmatter(content: string): { body: string; hasFrontmatter: boolean } {
  const frontmatterMatch = content.match(/^\s*---[\s\S]*?---\s*/);
  if (!frontmatterMatch) {
    return { body: content, hasFrontmatter: false };
  }
  return { body: content.slice(frontmatterMatch[0].length), hasFrontmatter: true };
}

function topLevelHeadingName(line: string): string | null {
  const match = line.match(/^#\s+(.+?)\s*$/);
  return match?.[1]?.trim() ?? null;
}

function secondLevelHeadingName(line: string): string | null {
  const match = line.match(/^##\s+(.+?)\s*$/);
  return match?.[1]?.trim() ?? null;
}

function sectionLines(lines: string[], sectionName: string): string[] {
  const startIndex = lines.findIndex(line => secondLevelHeadingName(line)?.toLowerCase() === sectionName.toLowerCase());
  if (startIndex === -1) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+/.test(line));
  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function validateTableShape(sectionName: string, lines: string[], headers: string[], issues: string[]): string[][] {
  const blocks = parseMarkdownTableBlocks(sectionLines(lines, sectionName));
  if (blocks.length === 0) {
    issues.push(`Section \`## ${sectionName}\` must contain a markdown table.`);
    return [];
  }
  if (blocks.length !== 1) {
    issues.push(`Section \`## ${sectionName}\` must contain exactly one markdown table, found ${blocks.length}.`);
  }

  const tableLines = sectionLines(lines, sectionName);
  const block = blocks[0];
  if (!block) return [];

  const headerCells = splitMarkdownTableRow(tableLines[block.start]);
  if (headerCells.length !== headers.length || headerCells.some((header, index) => header !== headers[index])) {
    issues.push(`${sectionName} columns must be exactly: ${headers.join(", ")}.`);
  }

  const separatorIndex = block.start + 1;
  if (separatorIndex > block.end || !isMarkdownTableSeparatorRow(splitMarkdownTableRow(tableLines[separatorIndex]))) {
    issues.push(`${sectionName} must include a separator row immediately after the header.`);
  }

  const rows: string[][] = [];
  for (let rowIndex = separatorIndex + 1; rowIndex <= block.end; rowIndex++) {
    const cells = splitMarkdownTableRow(tableLines[rowIndex]);
    if (isMarkdownTableSeparatorRow(cells)) {
      issues.push(`${sectionName} row ${rowIndex + 1} contains an unexpected separator.`);
      continue;
    }
    if (cells.length !== headers.length) {
      issues.push(`${sectionName} row ${rowIndex + 1} must have exactly ${headers.length} cells.`);
      continue;
    }
    const emptyCellsIssue = emptyTableCellsDiagnostic(sectionName, { rowNumber: rowIndex + 1, cells }, headers);
    if (emptyCellsIssue) {
      issues.push(emptyCellsIssue);
    }
    rows.push(cells);
  }
  return rows;
}

function validateApprovalSummary(lines: string[], issues: string[]): void {
  const rows = validateTableShape("Approval Summary", lines, APPROVAL_SUMMARY_HEADERS, issues);
  const actualAreas = rows.map(row => row[0]);
  for (const area of actualAreas) {
    if (!APPROVAL_SUMMARY_AREAS.includes(area)) {
      issues.push(`Approval Summary area \`${area}\` is not allowed.`);
    }
  }
  if (actualAreas.length !== APPROVAL_SUMMARY_AREAS.length || actualAreas.some((area, index) => area !== APPROVAL_SUMMARY_AREAS[index])) {
    issues.push(`Approval Summary areas must exactly match this order: ${APPROVAL_SUMMARY_AREAS.map(area => `\`${area}\``).join(", ")}.`);
  }
}

function validateTopLevelStructure(lines: string[], issues: string[]): void {
  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== "Implementation Plan") {
    issues.push("iteration_plan.md must contain exactly one top-level heading: `# Implementation Plan`.");
  }

  const actualSections = lines.map(secondLevelHeadingName).filter((section): section is string => section !== null);
  const allowedFixedSectionPattern = /^(Approval Summary|Generation Bundle|Phase Overview)$/i;
  const phaseSectionPattern = /^Iteration \d+: .+ \[\s*(x|~| |\/)\s*\]$/i;
  for (const section of actualSections) {
    if (allowedFixedSectionPattern.test(section) || phaseSectionPattern.test(section)) {
      continue;
    }

    if (/^Iteration\b/i.test(section)) {
      issues.push(`iteration_plan.md has invalid phase heading syntax: \`## ${section}\`. ${CANONICAL_PHASE_HEADING_SYNTAX}`);
    } else {
      issues.push(`iteration_plan.md contains unexpected section \`## ${section}\`.`);
    }
  }

  const nonPhaseSections = actualSections.filter(section => !/^Iteration \d+:/i.test(section));
  if (
    nonPhaseSections.length !== REQUIRED_TOP_LEVEL_SECTIONS.length ||
    nonPhaseSections.some((section, index) => section !== REQUIRED_TOP_LEVEL_SECTIONS[index])
  ) {
    issues.push(`iteration_plan.md non-phase \`##\` sections must exactly match this order: ${REQUIRED_TOP_LEVEL_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  const phaseStartIndex = actualSections.findIndex(section => /^Iteration \d+:/i.test(section));
  if (phaseStartIndex !== -1 && phaseStartIndex < REQUIRED_TOP_LEVEL_SECTIONS.length) {
    issues.push("iteration_plan.md phase sections must appear after `## Phase Overview`.");
  }
}

function extractDesignDecisionIds(designPath?: string): Set<string> {
  if (!designPath || !fs.existsSync(designPath)) {
    return new Set();
  }

  const content = normalizeLineEndings(fs.readFileSync(designPath, "utf-8"));
  const { body } = bodyAfterFrontmatter(content);
  const lines = body.split("\n");
  const designSectionLines = sectionLines(lines, "Key Design Decisions");
  const blocks = parseMarkdownTableBlocks(designSectionLines);
  const block = blocks[0];
  if (!block) {
    return new Set();
  }

  const decisionIds = new Set<string>();
  for (let rowIndex = block.start + 2; rowIndex <= block.end; rowIndex++) {
    const cells = splitMarkdownTableRow(designSectionLines[rowIndex]);
    const decisionId = cells[0] ?? "";
    if (/^D\d+$/.test(decisionId)) {
      decisionIds.add(decisionId);
    }
  }
  return decisionIds;
}

function validateDesignDecisionTraceability(body: string, designPath: string | undefined, issues: string[]): void {
  const decisionIds = extractDesignDecisionIds(designPath);
  if (decisionIds.size === 0) {
    return;
  }

  for (const decisionId of decisionIds) {
    const regex = new RegExp(`\\b${decisionId}\\b`);
    if (!regex.test(body)) {
      issues.push(`Design decision \`${decisionId}\` is not mapped in the implementation plan.`);
    }
  }
}

function expectedSurfaceBasePath(planPath: string): string {
  const normalized = path.resolve(planPath);
  const marker = `${path.sep}.phasedev${path.sep}changes${path.sep}`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex !== -1) {
    return normalized.slice(0, markerIndex);
  }

  return path.dirname(normalized);
}

export function validatePlanArtifact(filePath: string, prdPath?: string, designPath?: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["iteration_plan.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const lines = body.split("\n");
  const issues: string[] = [];

  if (!hasFrontmatter) {
    issues.push("iteration_plan.md must start with YAML frontmatter.");
  }
  if (/<!--[\s\S]*?-->/.test(content)) {
    issues.push("iteration_plan.md must not contain HTML template comments.");
  }
  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(body)) {
      issues.push(`iteration_plan.md must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  validateTopLevelStructure(lines, issues);
  validateApprovalSummary(lines, issues);
  validateTableShape("Generation Bundle", lines, GENERATION_BUNDLE_HEADERS, issues);
  validateTableShape("Phase Overview", lines, PHASE_OVERVIEW_HEADERS, issues);
  issues.push(...validatePlanStructure(parsePlan(filePath), prdPath, expectedSurfaceBasePath(filePath)));
  validateDesignDecisionTraceability(body, designPath, issues);

  return issues;
}
