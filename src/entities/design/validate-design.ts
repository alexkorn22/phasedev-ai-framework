import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { readFrontmatter } from "../../shared/markdown/frontmatter";

const REQUIRED_SECTIONS = [
  "Executive Summary",
  "Traceability Mapping",
  "Architecture Package Map",
  "Key Design Decisions",
  "Database Schemas & API Contracts",
  "Risks & Open Questions"
];

const BLOCKED_PLACEHOLDERS = [
  { pattern: /\bTBD\b/i, label: "TBD" },
  { pattern: /\bTODO\b/i, label: "TODO" },
  { pattern: /\bunknown\b/i, label: "unknown" },
  { pattern: /\bclarify later\b/i, label: "clarify later" },
  { pattern: /\bto be decided\b/i, label: "to be decided" }
];

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

function bodyAfterFrontmatter(content: string): { body: string; hasFrontmatter: boolean } {
  const frontmatterMatch = content.match(/^\s*---[\s\S]*?---\s*/);
  if (!frontmatterMatch) {
    return { body: content, hasFrontmatter: false };
  }

  return { body: content.slice(frontmatterMatch[0].length), hasFrontmatter: true };
}

export function validateDesign(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return ["design.md does not exist."];
  }

  const fm = readFrontmatter(filePath);
  const issues: string[] = [];

  if (!fm) {
    issues.push("design.md must start with YAML frontmatter.");
  } else {
    if (fm.approved === undefined) {
      issues.push("design.md frontmatter must contain 'approved' field.");
    }
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const { body, hasFrontmatter } = bodyAfterFrontmatter(content);
  const lines = body.split("\n");

  if (/<!--[\s\S]*?-->/.test(content)) {
    issues.push("design.md must not contain HTML template comments.");
  }

  for (const placeholder of BLOCKED_PLACEHOLDERS) {
    if (placeholder.pattern.test(body)) {
      issues.push(`design.md must not contain placeholder text: ${placeholder.label}.`);
    }
  }

  const topLevelHeadings = lines.map(topLevelHeadingName).filter((heading): heading is string => heading !== null);
  if (topLevelHeadings.length !== 1 || topLevelHeadings[0] !== "Design") {
    issues.push("design.md must contain exactly one top-level heading: `# Design`.");
  }

  for (const line of lines) {
    const deepHeading = deepHeadingName(line);
    if (deepHeading) {
      issues.push(`design.md must not contain headings deeper than \`##\`: \`${line.trim()}\`.`);
    }
  }

  const actualSections = lines.map(headingName).filter((section): section is string => section !== null);
  for (const section of REQUIRED_SECTIONS) {
    if (!actualSections.some(actual => actual.toLowerCase() === section.toLowerCase())) {
      issues.push(`design.md must contain section \`## ${section}\`.`);
    }
  }

  for (const section of actualSections) {
    if (!REQUIRED_SECTIONS.some(allowed => allowed.toLowerCase() === section.toLowerCase())) {
      issues.push(`design.md contains unexpected section \`## ${section}\`.`);
    }
  }

  const normalizedActualSections = actualSections.map(section => section.toLowerCase());
  const normalizedRequiredSections = REQUIRED_SECTIONS.map(section => section.toLowerCase());
  if (
    normalizedActualSections.length !== normalizedRequiredSections.length ||
    normalizedActualSections.some((section, index) => section !== normalizedRequiredSections[index])
  ) {
    issues.push(`design.md \`##\` sections must exactly match this order: ${REQUIRED_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  // Verify that Architecture Package Map contains a table
  const packageMapLines = sectionLines(lines, "Architecture Package Map");
  const hasTable = packageMapLines.some(line => line.trim().startsWith("|"));
  if (!hasTable) {
    issues.push("Section `## Architecture Package Map` must contain a markdown table.");
  }

  return issues;
}
