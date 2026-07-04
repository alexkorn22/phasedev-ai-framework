import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

const REQUIRED_SECTIONS = ["Test Commands", "Constraints", "Verification Gates", "Manual Checks", "Environment Notes"];
const REQUIRED_COMMAND_KEYS = ["unit", "phase", "full"];
const TABLE_HEADERS = ["Gate", "Command"];
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
  if (startIndex === -1) return [];
  const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+/.test(line));
  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function validateTestCommands(lines: string[], issues: string[]): void {
  const tableLines = sectionLines(lines, "Test Commands").filter(line => line.trim().startsWith("|"));
  if (tableLines.length === 0) {
    issues.push("Section `## Test Commands` must contain a markdown table.");
    return;
  }

  const headerCells = splitMarkdownTableRow(tableLines[0]);
  if (headerCells.length !== TABLE_HEADERS.length || headerCells.some((header, index) => header !== TABLE_HEADERS[index])) {
    issues.push("Test Commands columns must be exactly: Gate, Command.");
  }

  if (tableLines.length < 2 || !isSeparatorRow(splitMarkdownTableRow(tableLines[1]))) {
    issues.push("Test Commands must include a separator row immediately after the header.");
  }

  const parsedRows: Array<{ key: string; value: string }> = [];
  for (const [index, line] of tableLines.slice(2).entries()) {
    const rowNumber = index + 3;
    const cells = splitMarkdownTableRow(line);
    if (cells.length !== TABLE_HEADERS.length) {
      issues.push(`Test Commands row ${rowNumber} must have exactly ${TABLE_HEADERS.length} cells.`);
      continue;
    }
    const key = cells[0].toLowerCase();
    const value = cells[1].replace(/^`(.+)`$/, "$1").trim();
    parsedRows.push({ key, value });
    if (!REQUIRED_COMMAND_KEYS.includes(key)) {
      issues.push(`Test Commands gate \`${cells[0]}\` is not allowed; expected unit, phase, or full.`);
    }
    if (value.length === 0) {
      issues.push(`Test Commands command \`${cells[0]}\` must be non-empty.`);
    }
  }

  const actualKeys = parsedRows.map(row => row.key);
  if (actualKeys.length !== REQUIRED_COMMAND_KEYS.length || actualKeys.some((key, index) => key !== REQUIRED_COMMAND_KEYS[index])) {
    issues.push(`Test Commands must contain exactly these gates in order: ${REQUIRED_COMMAND_KEYS.map(key => `\`${key}\``).join(", ")}.`);
  }

  const seen = new Set<string>();
  for (const row of parsedRows) {
    if (seen.has(row.key)) {
      issues.push(`Test Commands contains duplicate gate \`${row.key}\`.`);
    }
    seen.add(row.key);
  }
}

export function validateRulesArtifact(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["execution_contract.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const lines = body.split("\n");
  const issues: string[] = [];

  if (!hasFrontmatter) {
    issues.push("execution_contract.md must start with YAML frontmatter.");
  }
  if (/<!--[\s\S]*?-->/.test(content)) {
    issues.push("execution_contract.md must not contain HTML template comments.");
  }
  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(body)) {
      issues.push(`execution_contract.md must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== "Rules") {
    issues.push("execution_contract.md must contain exactly one top-level heading: `# Rules`.");
  }

  for (const line of lines) {
    const deepHeading = deepHeadingName(line);
    if (deepHeading) {
      issues.push(`execution_contract.md must not contain headings deeper than \`##\`: \`${line.trim()}\`.`);
    }
  }

  const actualSections = lines.map(headingName).filter((section): section is string => section !== null);
  for (const section of REQUIRED_SECTIONS) {
    if (!actualSections.some(actual => actual.toLowerCase() === section.toLowerCase())) {
      issues.push(`execution_contract.md must contain section \`## ${section}\`.`);
    }
  }
  for (const section of actualSections) {
    if (!REQUIRED_SECTIONS.some(allowed => allowed.toLowerCase() === section.toLowerCase())) {
      issues.push(`execution_contract.md contains unexpected section \`## ${section}\`.`);
    }
  }
  if (
    actualSections.length !== REQUIRED_SECTIONS.length ||
    actualSections.some((section, index) => section !== REQUIRED_SECTIONS[index])
  ) {
    issues.push(`execution_contract.md \`##\` sections must exactly match this order: ${REQUIRED_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  validateTestCommands(lines, issues);
  return issues;
}
