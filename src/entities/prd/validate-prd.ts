import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

const REQUIRED_INTENT_FIELDS = [
  "Change type",
  "User or business intent",
  "Generation target",
  "Resolution signal",
  "Decision deadline",
  "Risk envelope"
];

const ALLOWED_CHANGE_TYPES = new Set(["feature", "fix", "refactor", "infra", "experiment"]);

const REQUIRED_SECTIONS = [
  "Intent Card",
  "Approval Summary",
  "Requirements",
  "Scope Boundaries",
  "Success Criteria",
  "Accepted Assumptions",
  "Deferred Decisions"
];

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

function hasNonEmptySectionContent(lines: string[], sectionName: string): boolean {
  return sectionLines(lines, sectionName).some(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith("|---");
  });
}

function parseIntentCardRows(lines: string[]): Array<{ field: string; value: string }> {
  const rows: Array<{ field: string; value: string }> = [];
  for (const line of sectionLines(lines, "Intent Card")) {
    if (!line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells.length < 2 || cells[0].toLowerCase() === "field" || /^-+$/.test(cells[0])) {
      continue;
    }

    rows.push({ field: cells[0], value: cells[1] });
  }

  return rows;
}

function parseIntentCard(lines: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of parseIntentCardRows(lines)) {
    values.set(row.field, row.value);
  }
  return values;
}

function sectionHasListItemId(lines: string[], sectionName: string, prefix: "R" | "SC"): boolean {
  const idPattern = new RegExp(`^[-*]\\s+${prefix}\\d+:\\s*\\S`);
  return sectionLines(lines, sectionName).some(line => idPattern.test(line.trim()));
}

function sectionContainsLabel(lines: string[], sectionName: string, label: "In scope" | "Out of scope"): boolean {
  const labelPattern = new RegExp(`^([-*]\\s+)?${label}:`, "i");
  return sectionLines(lines, sectionName).some(line => labelPattern.test(line.trim()));
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

  const intentRows = parseIntentCardRows(lines);
  const actualIntentFields = intentRows.map(row => row.field);
  for (const field of actualIntentFields) {
    if (!REQUIRED_INTENT_FIELDS.includes(field)) {
      issues.push(`Intent Card field \`${field}\` is not allowed.`);
    }
  }
  if (
    actualIntentFields.length !== REQUIRED_INTENT_FIELDS.length ||
    actualIntentFields.some((field, index) => field !== REQUIRED_INTENT_FIELDS[index])
  ) {
    issues.push(`Intent Card fields must exactly match this order: ${REQUIRED_INTENT_FIELDS.map(field => `\`${field}\``).join(", ")}.`);
  }

  const intentValues = parseIntentCard(lines);
  for (const field of REQUIRED_INTENT_FIELDS) {
    const value = intentValues.get(field);
    if (!value || value.trim().length === 0) {
      issues.push(`Intent Card field \`${field}\` must be present and non-empty.`);
    }
  }

  const changeType = intentValues.get("Change type")?.trim();
  if (changeType && !ALLOWED_CHANGE_TYPES.has(changeType)) {
    issues.push("Intent Card field `Change type` must be one of: feature, fix, refactor, infra, experiment.");
  }

  for (const field of ["User or business intent", "Generation target", "Risk envelope"]) {
    if (intentValues.get(field)?.trim() === "not_applicable") {
      issues.push(`Intent Card field \`${field}\` must not be not_applicable.`);
    }
  }

  for (const section of REQUIRED_SECTIONS.filter(section => section !== "Intent Card")) {
    if (!hasNonEmptySectionContent(lines, section)) {
      issues.push(`Section \`## ${section}\` must not be empty.`);
    }
  }

  if (!sectionHasListItemId(lines, "Requirements", "R")) {
    issues.push("Section `## Requirements` must contain at least one requirement item like `R1: ...`.");
  }

  if (!sectionHasListItemId(lines, "Success Criteria", "SC")) {
    issues.push("Section `## Success Criteria` must contain at least one success criterion item like `SC1: ...`.");
  }

  if (!sectionContainsLabel(lines, "Scope Boundaries", "In scope")) {
    issues.push("Section `## Scope Boundaries` must contain `In scope:`.");
  }

  if (!sectionContainsLabel(lines, "Scope Boundaries", "Out of scope")) {
    issues.push("Section `## Scope Boundaries` must contain `Out of scope:`.");
  }

  return issues;
}
