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

function parseIntentCard(lines: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of sectionLines(lines, "Intent Card")) {
    if (!line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells.length < 2 || cells[0].toLowerCase() === "field" || /^-+$/.test(cells[0])) {
      continue;
    }

    values.set(cells[0], cells[1]);
  }

  return values;
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

  for (const section of REQUIRED_SECTIONS) {
    if (!lines.some(line => headingName(line)?.toLowerCase() === section.toLowerCase())) {
      issues.push(`prd.md must contain section \`## ${section}\`.`);
    }
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

  return issues;
}
