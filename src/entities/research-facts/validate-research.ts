import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

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

export function validateResearchFacts(filePath: string): string[] {
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

  return issues;
}
