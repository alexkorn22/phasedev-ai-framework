import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { extractRequirementsAndCriteriaFromPrd } from "../prd/traceability";

const REQUIRED_SECTIONS = [
  "PRD Intent Trace",
  "Requirements & Success Criteria Trace",
  "Source Facts",
  "Research Gaps & Blockers"
];

const BLOCKED_PLACEHOLDERS = [
  { pattern: /\bTBD\b/i, label: "TBD" },
  { pattern: /\bTODO\b/i, label: "TODO" },
  { pattern: /\bunknown\b/i, label: "unknown" },
  { pattern: /\bclarify later\b/i, label: "clarify later" },
  { pattern: /\bto be decided\b/i, label: "to be decided" }
];

const TRACE_TABLE_HEADERS = ["ID", "Status", "Evidence", "Gaps/Blockers"];

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let currentCell = "";

  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char === "\\" && trimmed[index + 1] === "|") {
      currentCell += "|";
      index++;
      continue;
    }
    if (char === "|") {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }
    currentCell += char;
  }

  cells.push(currentCell.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function headingName(line: string): string | null {
  const match = line.match(/^##\s+(.+?)\s*$/);
  return match?.[1]?.trim() ?? null;
}

function topLevelHeadingName(line: string): string | null {
  const match = line.match(/^#\s+(.+?)\s*$/);
  return match?.[1]?.trim() ?? null;
}

function deepHeadingName(line: string): string | null {
  const match = line.match(/^#{3,}\s+(.+?)\s*$/);
  return match?.[1]?.trim() ?? null;
}

function sectionLines(lines: string[], sectionName: string): string[] {
  const startIndex = lines.findIndex(line => headingName(line)?.toLowerCase() === sectionName.toLowerCase());
  if (startIndex === -1) {
    return [];
  }

  const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+/.test(line));
  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function validateTraceTable(lines: string[], prdPath: string | undefined, issues: string[]): void {
  const traceLines = sectionLines(lines, "Requirements & Success Criteria Trace");
  const tableLines = traceLines.filter(line => line.trim().startsWith("|"));
  if (tableLines.length === 0) {
    issues.push("Section `## Requirements & Success Criteria Trace` must contain a markdown table.");
    return;
  }

  const headerCells = splitMarkdownTableRow(tableLines[0]);
  if (headerCells.length !== TRACE_TABLE_HEADERS.length || headerCells.some((header, index) => header !== TRACE_TABLE_HEADERS[index])) {
    issues.push("Requirements & Success Criteria Trace columns must be exactly: ID, Status, Evidence, Gaps/Blockers.");
  }

  if (tableLines.length < 2 || !isSeparatorRow(splitMarkdownTableRow(tableLines[1]))) {
    issues.push("Requirements & Success Criteria Trace must include a separator row immediately after the header.");
  }

  const actualIds: string[] = [];
  for (const [index, line] of tableLines.slice(2).entries()) {
    const cells = splitMarkdownTableRow(line);
    const rowNumber = index + 3;
    if (cells.length !== TRACE_TABLE_HEADERS.length) {
      issues.push(`Requirements & Success Criteria Trace row ${rowNumber} must have exactly ${TRACE_TABLE_HEADERS.length} cells.`);
      continue;
    }
    if (cells.some(cell => cell.trim().length === 0)) {
      issues.push(`Requirements & Success Criteria Trace row ${rowNumber} must not contain empty cells.`);
    }
    actualIds.push(cells[0]);
  }

  const duplicateIds = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  for (const id of Array.from(new Set(duplicateIds))) {
    issues.push(`Requirements & Success Criteria Trace contains duplicate ID \`${id}\`.`);
  }

  if (!prdPath) {
    return;
  }

  const { requirements, criteria } = extractRequirementsAndCriteriaFromPrd(prdPath);
  const expectedIds = [...requirements, ...criteria];
  for (const id of expectedIds) {
    if (!actualIds.includes(id)) {
      issues.push(`Requirements & Success Criteria Trace must include PRD ID \`${id}\`.`);
    }
  }
  for (const id of actualIds) {
    if (!expectedIds.includes(id)) {
      issues.push(`Requirements & Success Criteria Trace contains unexpected ID \`${id}\`.`);
    }
  }
}

export function validateResearchFacts(filePath: string, prdPath?: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["research_facts.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = content.split("\n");
  const issues: string[] = [];

  if (/<!--[\s\S]*?-->/.test(content)) {
    issues.push("research_facts.md must not contain HTML template comments.");
  }

  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(content)) {
      issues.push(`research_facts.md must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== "Research Facts") {
    issues.push("research_facts.md must contain exactly one top-level heading: `# Research Facts`.");
  }

  for (const line of lines) {
    const deepHeading = deepHeadingName(line);
    if (deepHeading) {
      issues.push(`research_facts.md must not contain headings deeper than \`##\`: \`${line.trim()}\`.`);
    }
  }

  const actualSections = lines.map(headingName).filter((section): section is string => section !== null);
  for (const section of REQUIRED_SECTIONS) {
    if (!actualSections.some(actual => actual.toLowerCase() === section.toLowerCase())) {
      issues.push(`research_facts.md must contain section \`## ${section}\`.`);
    }
  }

  for (const section of actualSections) {
    if (!REQUIRED_SECTIONS.some(allowed => allowed.toLowerCase() === section.toLowerCase())) {
      issues.push(`research_facts.md contains unexpected section \`## ${section}\`.`);
    }
  }

  const normalizedActualSections = actualSections.map(section => section.toLowerCase());
  const normalizedRequiredSections = REQUIRED_SECTIONS.map(section => section.toLowerCase());
  if (
    normalizedActualSections.length !== normalizedRequiredSections.length ||
    normalizedActualSections.some((section, index) => section !== normalizedRequiredSections[index])
  ) {
    issues.push(`research_facts.md \`##\` sections must exactly match this order: ${REQUIRED_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  // Verify that Source Facts section contains at least one file:line trace reference
  const sourceFactsText = sectionLines(lines, "Source Facts").join("\n");
  const tracePattern = /\b[a-zA-Z0-9_\-\./]+:\d+\b/;
  if (!tracePattern.test(sourceFactsText)) {
    issues.push("Section `## Source Facts` must contain at least one file path with a line number in the format `file:line` (e.g., `src/index.ts:42`).");
  }

  validateTraceTable(lines, prdPath, issues);

  return issues;
}
