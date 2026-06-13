import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

const REQUIRED_INTENT_FIELDS = [
  "Change type",
  "Why",
  "Target state",
  "Risk boundaries"
];

const ALLOWED_CHANGE_TYPES = new Set(["feature", "fix", "refactor", "infra", "experiment"]);
const ALLOWED_EVIDENCE_TYPES = new Set(["unit", "phase", "full", "review", "manual", "smoke"]);

const REQUIRED_SECTIONS = [
  "Intent",
  "Requirements",
  "Success Criteria"
];

const REQUIREMENTS_HEADERS = ["ID", "Requirement"];
const SUCCESS_CRITERIA_HEADERS = ["ID", "Verifies", "Criterion", "Evidence"];

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
  if (cells[0] === "") {
    cells.shift();
  }
  if (cells[cells.length - 1] === "") {
    cells.pop();
  }

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

function tableRows(lines: string[], sectionName: string): string[][] {
  const tableLines = sectionLines(lines, sectionName).filter(line => line.trim().startsWith("|"));
  return tableLines.map(splitMarkdownTableRow);
}

function validateTableShape(sectionName: string, rows: string[][], headers: string[], issues: string[]): string[][] {
  if (rows.length === 0) {
    issues.push(`Section \`## ${sectionName}\` must contain a markdown table.`);
    return [];
  }

  const [headerCells = [], separatorCells = []] = rows;
  if (headerCells.length !== headers.length || headerCells.some((header, index) => header !== headers[index])) {
    issues.push(`${sectionName} columns must be exactly: ${headers.join(", ")}.`);
  }

  if (!isSeparatorRow(separatorCells)) {
    issues.push(`${sectionName} must include a separator row immediately after the header.`);
  }

  return rows.slice(2);
}

function parseIntentRows(lines: string[]): Array<{ field: string; value: string }> {
  const rows = tableRows(lines, "Intent");
  const dataRows = validateTableShape("Intent", rows, ["Field", "Value"], []);
  return dataRows.map(cells => ({ field: cells[0] ?? "", value: cells[1] ?? "" }));
}

function validateIntent(lines: string[], issues: string[]): void {
  const rows = tableRows(lines, "Intent");
  const dataRows = validateTableShape("Intent", rows, ["Field", "Value"], issues);
  const actualFields = dataRows.map(cells => cells[0] ?? "");

  for (const field of actualFields) {
    if (!REQUIRED_INTENT_FIELDS.includes(field)) {
      issues.push(`Intent field \`${field}\` is not allowed.`);
    }
  }

  if (actualFields.length !== REQUIRED_INTENT_FIELDS.length || actualFields.some((field, index) => field !== REQUIRED_INTENT_FIELDS[index])) {
    issues.push(`Intent fields must exactly match this order: ${REQUIRED_INTENT_FIELDS.map(field => `\`${field}\``).join(", ")}.`);
  }

  const values = new Map(parseIntentRows(lines).map(row => [row.field, row.value]));
  for (const field of REQUIRED_INTENT_FIELDS) {
    const value = values.get(field);
    if (!value || value.trim().length === 0) {
      issues.push(`Intent field \`${field}\` must be present and non-empty.`);
    }
  }

  const changeType = values.get("Change type")?.trim();
  if (changeType && !ALLOWED_CHANGE_TYPES.has(changeType)) {
    issues.push("Intent field `Change type` must be one of: feature, fix, refactor, infra, experiment.");
  }
}

function validateRequirements(lines: string[], issues: string[]): Set<string> {
  const dataRows = validateTableShape("Requirements", tableRows(lines, "Requirements"), REQUIREMENTS_HEADERS, issues);
  const requirementIds = new Set<string>();

  if (dataRows.length === 0) {
    issues.push("Section `## Requirements` must contain at least one requirement row like `R1`.");
  }

  for (const [index, cells] of dataRows.entries()) {
    const rowNumber = index + 3;
    const id = cells[0] ?? "";
    const requirement = cells[1] ?? "";
    if (!/^R\d+$/.test(id)) {
      issues.push(`Requirements row ${rowNumber} ID must use \`R#\` format.`);
    }
    if (requirement.trim().length === 0) {
      issues.push(`Requirements row ${rowNumber} Requirement must be non-empty.`);
    }
    if (requirementIds.has(id)) {
      issues.push(`Requirements table contains duplicate ID \`${id}\`.`);
    }
    if (id.length > 0) {
      requirementIds.add(id);
    }
  }

  return requirementIds;
}

function parseVerifies(value: string): string[] {
  return value.split(",").map(item => item.trim()).filter(Boolean);
}

function validateSuccessCriteria(lines: string[], requirementIds: Set<string>, issues: string[]): void {
  const dataRows = validateTableShape("Success Criteria", tableRows(lines, "Success Criteria"), SUCCESS_CRITERIA_HEADERS, issues);
  const criteriaIds = new Set<string>();

  if (dataRows.length === 0) {
    issues.push("Section `## Success Criteria` must contain at least one success criterion row like `SC1`.");
  }

  for (const [index, cells] of dataRows.entries()) {
    const rowNumber = index + 3;
    const id = cells[0] ?? "";
    const verifies = cells[1] ?? "";
    const criterion = cells[2] ?? "";
    const evidence = cells[3] ?? "";

    if (!/^SC\d+$/.test(id)) {
      issues.push(`Success Criteria row ${rowNumber} ID must use \`SC#\` format.`);
    }
    if (criteriaIds.has(id)) {
      issues.push(`Success Criteria table contains duplicate ID \`${id}\`.`);
    }
    if (id.length > 0) {
      criteriaIds.add(id);
    }
    if (criterion.trim().length === 0) {
      issues.push(`Success Criteria row ${rowNumber} Criterion must be non-empty.`);
    }
    if (evidence.trim().length === 0) {
      issues.push(`Success Criteria row ${rowNumber} Evidence must be non-empty.`);
    } else if (!ALLOWED_EVIDENCE_TYPES.has(evidence.trim())) {
      issues.push(`Success Criteria row ${rowNumber} Evidence must be one of: unit, phase, full, review, manual, smoke.`);
    }

    const verifiedIds = parseVerifies(verifies);
    if (verifiedIds.length === 0) {
      issues.push(`Success Criteria row ${rowNumber} Verifies must reference at least one R#.`);
    }
    for (const reqId of verifiedIds) {
      if (!/^R\d+$/.test(reqId)) {
        issues.push(`Success Criteria row ${rowNumber} Verifies value \`${reqId}\` must use \`R#\` format.`);
      } else if (!requirementIds.has(reqId)) {
        issues.push(`Success Criteria row ${rowNumber} Verifies references unknown requirement \`${reqId}\`.`);
      }
    }
  }
}

export function validatePrdArtifact(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["prd.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const lines = body.split("\n");
  const issues: string[] = [];

  if (!hasFrontmatter) {
    issues.push("prd.md must start with YAML frontmatter.");
  }

  if (/<!--[\s\S]*?-->/.test(content)) {
    issues.push("prd.md must not contain HTML template comments.");
  }

  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(body)) {
      issues.push(`prd.md must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== "PRD") {
    issues.push("prd.md must contain exactly one top-level heading: `# PRD`.");
  }

  for (const line of lines) {
    const deepHeading = deepHeadingName(line);
    if (deepHeading) {
      issues.push(`prd.md must not contain headings deeper than \`##\`: \`${line.trim()}\`.`);
    }
  }

  const actualSections = lines.map(headingName).filter((section): section is string => section !== null);
  for (const section of REQUIRED_SECTIONS) {
    if (!actualSections.some(actual => actual.toLowerCase() === section.toLowerCase())) {
      issues.push(`prd.md must contain section \`## ${section}\`.`);
    }
  }

  for (const section of actualSections) {
    if (!REQUIRED_SECTIONS.some(allowed => allowed.toLowerCase() === section.toLowerCase())) {
      issues.push(`prd.md contains unexpected section \`## ${section}\`.`);
    }
  }

  const normalizedActualSections = actualSections.map(section => section.toLowerCase());
  const normalizedRequiredSections = REQUIRED_SECTIONS.map(section => section.toLowerCase());
  if (
    normalizedActualSections.length !== normalizedRequiredSections.length ||
    normalizedActualSections.some((section, index) => section !== normalizedRequiredSections[index])
  ) {
    issues.push(`prd.md \`##\` sections must exactly match this order: ${REQUIRED_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  validateIntent(lines, issues);
  const requirementIds = validateRequirements(lines, issues);
  validateSuccessCriteria(lines, requirementIds, issues);

  return issues;
}
