import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import * as fs from "fs";
import * as path from "path";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { bodyAfterFrontmatter, headingName, sectionLines } from "../../shared/markdown/headings";
import { parseMarkdownTableBlocks, splitMarkdownTableRow } from "../../shared/markdown/table";
import { validateArtifactStructure, validateTableShape, type ArtifactStructureSpec, type TableShapeSpec } from "../artifact-structure";
import { CANONICAL_ITERATION_HEADING_SYNTAX } from "./contract-messages";
import { parsePlan } from "./parse-plan";
import { validatePlanStructure } from "./validate-plan";
import { extractRequirementsAndCriteriaFromPrd } from "../prd/traceability";

const REQUIRED_TOP_LEVEL_SECTIONS = ["Approval Summary", "Generation Bundle", "Iteration Overview"];
const APPROVAL_SUMMARY_HEADERS = ["Area", "Decision"];
const APPROVAL_SUMMARY_AREAS = ["Approval scope", "Out of scope", "Sequencing risk", "Validation"];
const GENERATION_BUNDLE_HEADERS = ["Area", "Required", "Plan"];
const ITERATION_OVERVIEW_HEADERS = ["Iteration", "Goal", "Main work items", "Required checks"];

const STRUCTURE_SPEC: ArtifactStructureSpec = {
  artifactName: "iteration_plan.md",
  title: "Implementation Plan",
  frontmatter: "required",
  checkDeepHeadings: false,
  checkHtmlComments: true
};

const APPROVAL_SUMMARY_TABLE: TableShapeSpec = { section: "Approval Summary", headers: APPROVAL_SUMMARY_HEADERS, mode: "blocks", rowChecks: true };
const GENERATION_BUNDLE_TABLE: TableShapeSpec = { section: "Generation Bundle", headers: GENERATION_BUNDLE_HEADERS, mode: "blocks", rowChecks: true };
const ITERATION_OVERVIEW_TABLE: TableShapeSpec = { section: "Iteration Overview", headers: ITERATION_OVERVIEW_HEADERS, mode: "blocks", rowChecks: true };

function validateApprovalSummary(lines: string[], issues: string[]): void {
  const rows = validateTableShape(lines, APPROVAL_SUMMARY_TABLE, issues);
  const actualAreas = rows.map(row => row.cells[0]);
  for (const area of actualAreas) {
    if (!APPROVAL_SUMMARY_AREAS.includes(area)) {
      issues.push(`Approval Summary area \`${area}\` is not allowed.`);
    }
  }
  if (actualAreas.length !== APPROVAL_SUMMARY_AREAS.length || actualAreas.some((area, index) => area !== APPROVAL_SUMMARY_AREAS[index])) {
    issues.push(`Approval Summary areas must exactly match this order: ${APPROVAL_SUMMARY_AREAS.map(area => `\`${area}\``).join(", ")}.`);
  }
}

function validateSectionStructure(lines: string[], issues: string[]): void {
  const actualSections = lines.map(headingName).filter((section): section is string => section !== null);
  const allowedFixedSectionPattern = /^(Approval Summary|Generation Bundle|Iteration Overview)$/i;
  const phaseSectionPattern = /^Iteration \d+: .+ \[\s*(x|~| |\/)\s*\]$/i;
  for (const section of actualSections) {
    if (allowedFixedSectionPattern.test(section) || phaseSectionPattern.test(section)) {
      continue;
    }

    if (/^Iteration\b/i.test(section)) {
      issues.push(`iteration_plan.md has invalid iteration heading syntax: \`## ${section}\`. ${CANONICAL_ITERATION_HEADING_SYNTAX}`);
    } else {
      issues.push(`iteration_plan.md contains unexpected section \`## ${section}\`.`);
    }
  }

  const nonIterationSections = actualSections.filter(section => !/^Iteration \d+:/i.test(section));
  if (
    nonIterationSections.length !== REQUIRED_TOP_LEVEL_SECTIONS.length ||
    nonIterationSections.some((section, index) => section !== REQUIRED_TOP_LEVEL_SECTIONS[index])
  ) {
    issues.push(`iteration_plan.md non-iteration \`##\` sections must exactly match this order: ${REQUIRED_TOP_LEVEL_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  const iterationStartIndex = actualSections.findIndex(section => /^Iteration \d+:/i.test(section));
  if (iterationStartIndex !== -1 && iterationStartIndex < REQUIRED_TOP_LEVEL_SECTIONS.length) {
    issues.push("iteration_plan.md iteration sections must appear after `## Iteration Overview`.");
  }
}

function extractDesignDecisionIds(designPath?: string): Set<string> {
  if (!designPath || !fs.existsSync(designPath)) {
    return new Set();
  }

  const content = normalizeLineEndings(fs.readFileSync(designPath, "utf-8"));
  const { body } = bodyAfterFrontmatter(content);
  const lines = blankFencedCodeLines(body.split("\n"));
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

const TRACE_TOKEN_PATTERN = /\b(?:SC|R|D)\d+\b/g;

function validateTraceReferenceExistence(
  body: string,
  prdPath: string | undefined,
  designPath: string | undefined,
  issues: string[]
): void {
  const knownRequirements = new Set<string>();
  const knownCriteria = new Set<string>();
  const prdAvailable = Boolean(prdPath && fs.existsSync(prdPath));
  if (prdAvailable) {
    const { requirements, criteria } = extractRequirementsAndCriteriaFromPrd(prdPath ?? "");
    for (const id of requirements) {
      knownRequirements.add(id);
    }
    for (const id of criteria) {
      knownCriteria.add(id);
    }
  }
  const knownDecisions = extractDesignDecisionIds(designPath);

  const scannable = blankFencedCodeLines(body.split("\n")).join("\n");
  const reported = new Set<string>();
  for (const token of scannable.match(TRACE_TOKEN_PATTERN) ?? []) {
    if (reported.has(token)) {
      continue;
    }
    if (token.startsWith("SC")) {
      if (prdAvailable && !knownCriteria.has(token)) {
        reported.add(token);
        issues.push(`iteration_plan.md references unknown trace ID \`${token}\`; it is not declared in prd.md.`);
      }
    } else if (token.startsWith("R")) {
      if (prdAvailable && !knownRequirements.has(token)) {
        reported.add(token);
        issues.push(`iteration_plan.md references unknown trace ID \`${token}\`; it is not declared in prd.md.`);
      }
    } else if (knownDecisions.size > 0 && !knownDecisions.has(token)) {
      reported.add(token);
      issues.push(`iteration_plan.md references unknown trace ID \`${token}\`; it is not declared in architecture/design.md Key Design Decisions.`);
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
  const { issues, body, lines } = validateArtifactStructure(content, STRUCTURE_SPEC);

  validateSectionStructure(lines, issues);
  validateApprovalSummary(lines, issues);
  validateTableShape(lines, GENERATION_BUNDLE_TABLE, issues);
  validateTableShape(lines, ITERATION_OVERVIEW_TABLE, issues);
  issues.push(...validatePlanStructure(parsePlan(filePath), prdPath, expectedSurfaceBasePath(filePath)));
  validateDesignDecisionTraceability(body, designPath, issues);
  validateTraceReferenceExistence(body, prdPath, designPath, issues);

  return issues;
}
