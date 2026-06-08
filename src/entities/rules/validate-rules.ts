import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

const REQUIRED_SECTIONS = ["Test Commands"];
const REQUIRED_COMMAND_KEYS = ["unit", "phase", "full"];
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
  const rows = sectionLines(lines, "Test Commands")
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const parsedRows: Array<{ key: string; value: string }> = [];

  for (const row of rows) {
    if (!row.startsWith("-")) {
      issues.push(`Test Commands row \`${row}\` is not allowed; only \`- unit|phase|full: command\` rows are permitted.`);
      continue;
    }

    const match = row.match(/^-\s*(unit|phase|full)\s*:\s*(.+)$/i);
    if (!match) {
      issues.push(`Test Commands row \`${row}\` must use \`- unit|phase|full: command\` format.`);
      continue;
    }
    parsedRows.push({ key: match[1].toLowerCase(), value: match[2].replace(/^`(.+)`$/, "$1").trim() });
  }

  const actualKeys = parsedRows.map(row => row.key);
  if (actualKeys.length !== REQUIRED_COMMAND_KEYS.length || actualKeys.some((key, index) => key !== REQUIRED_COMMAND_KEYS[index])) {
    issues.push(`Test Commands must contain exactly these command rows in order: ${REQUIRED_COMMAND_KEYS.map(key => `\`${key}\``).join(", ")}.`);
  }

  const seen = new Set<string>();
  for (const row of parsedRows) {
    if (seen.has(row.key)) {
      issues.push(`Test Commands contains duplicate command \`${row.key}\`.`);
    }
    seen.add(row.key);
    if (row.value.length === 0) {
      issues.push(`Test Commands command \`${row.key}\` must be non-empty.`);
    }
  }
}

export function validateRulesArtifact(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["rules.md does not exist."];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const lines = body.split("\n");
  const issues: string[] = [];

  if (!hasFrontmatter) {
    issues.push("rules.md must start with YAML frontmatter.");
  }
  if (/<!--[\s\S]*?-->/.test(content)) {
    issues.push("rules.md must not contain HTML template comments.");
  }
  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(body)) {
      issues.push(`rules.md must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== "Rules") {
    issues.push("rules.md must contain exactly one top-level heading: `# Rules`.");
  }

  for (const line of lines) {
    const deepHeading = deepHeadingName(line);
    if (deepHeading) {
      issues.push(`rules.md must not contain headings deeper than \`##\`: \`${line.trim()}\`.`);
    }
  }

  const actualSections = lines.map(headingName).filter((section): section is string => section !== null);
  for (const section of REQUIRED_SECTIONS) {
    if (!actualSections.some(actual => actual.toLowerCase() === section.toLowerCase())) {
      issues.push(`rules.md must contain section \`## ${section}\`.`);
    }
  }
  for (const section of actualSections) {
    if (!REQUIRED_SECTIONS.some(allowed => allowed.toLowerCase() === section.toLowerCase())) {
      issues.push(`rules.md contains unexpected section \`## ${section}\`.`);
    }
  }
  if (
    actualSections.length !== REQUIRED_SECTIONS.length ||
    actualSections.some((section, index) => section !== REQUIRED_SECTIONS[index])
  ) {
    issues.push(`rules.md \`##\` sections must exactly match this order: ${REQUIRED_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  validateTestCommands(lines, issues);
  return issues;
}
