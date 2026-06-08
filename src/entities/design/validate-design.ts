import * as fs from "fs";
import * as path from "path";
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

const PACKAGE_MAP_HEADERS = ["File", "Purpose", "Visual content", "Review priority"];
const REVIEW_PRIORITIES = new Set(["high", "medium", "low"]);
const DESIGN_ENTRYPOINT = "architecture/design.md";

interface MarkdownTableBlock {
  start: number;
  end: number;
}

interface PackageMapRow {
  rowNumber: number;
  file: string;
  purpose: string;
  visualContent: string;
  reviewPriority: string;
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

function parseTableBlocks(lines: string[]): MarkdownTableBlock[] {
  const blocks: MarkdownTableBlock[] = [];

  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim().startsWith("|")) {
      continue;
    }

    const start = index;
    while (index + 1 < lines.length && lines[index + 1].trim().startsWith("|")) {
      index++;
    }
    blocks.push({ start, end: index });
  }

  return blocks;
}

function stripCodeSpan(value: string): string {
  const trimmed = value.trim();
  const codeSpanMatch = trimmed.match(/^`([^`]+)`$/);
  return codeSpanMatch?.[1]?.trim() ?? trimmed;
}

function hasKebabCaseMarkdownFileName(filePath: string): boolean {
  const fileName = filePath.slice("architecture/".length);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(fileName);
}

function architectureFilesFor(designFilePath: string): string[] {
  const architectureDir = path.dirname(designFilePath);
  if (!fs.existsSync(architectureDir)) {
    return [];
  }

  return fs.readdirSync(architectureDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
    .map(entry => `architecture/${entry.name}`)
    .sort();
}

function hasVisualReviewSurfaceOutsidePackageMap(lines: string[]): boolean {
  const packageMapStart = lines.findIndex(line => headingName(line)?.toLowerCase() === "architecture package map");
  const packageMapEnd = packageMapStart === -1
    ? -1
    : lines.findIndex((line, index) => index > packageMapStart && /^##\s+/.test(line));
  const linesOutsidePackageMap = lines.filter((_, index) => {
    if (packageMapStart === -1) {
      return true;
    }
    const end = packageMapEnd === -1 ? lines.length : packageMapEnd;
    return index < packageMapStart || index >= end;
  });

  return linesOutsidePackageMap.some(line => line.trim().toLowerCase() === "```mermaid") ||
    parseTableBlocks(linesOutsidePackageMap).length > 0;
}

function validatePackageMapTableShape(lines: string[], tableBlock: MarkdownTableBlock, issues: string[]): number {
  const headerCells = splitMarkdownTableRow(lines[tableBlock.start]);
  if (headerCells.length !== PACKAGE_MAP_HEADERS.length || headerCells.some((header, index) => header !== PACKAGE_MAP_HEADERS[index])) {
    issues.push("Architecture Package Map columns must be exactly: File, Purpose, Visual content, Review priority.");
  }

  const separatorIndex = tableBlock.start + 1;
  if (separatorIndex > tableBlock.end || !isSeparatorRow(splitMarkdownTableRow(lines[separatorIndex]))) {
    issues.push("Architecture Package Map must include a separator row immediately after the header.");
  }

  return separatorIndex;
}

function parsePackageMapRows(lines: string[], tableBlock: MarkdownTableBlock, separatorIndex: number, issues: string[]): PackageMapRow[] {
  const rows: PackageMapRow[] = [];

  for (let rowIndex = separatorIndex + 1; rowIndex <= tableBlock.end; rowIndex++) {
    const cells = splitMarkdownTableRow(lines[rowIndex]);
    const rowNumber = rowIndex + 1;
    if (isSeparatorRow(cells)) {
      issues.push(`Architecture Package Map row ${rowNumber} contains an unexpected separator.`);
      continue;
    }

    if (cells.length !== PACKAGE_MAP_HEADERS.length) {
      issues.push(`Architecture Package Map row ${rowNumber} must have exactly ${PACKAGE_MAP_HEADERS.length} cells.`);
      continue;
    }

    const [rawFile = "", purpose = "", visualContent = "", rawReviewPriority = ""] = cells;
    rows.push({
      rowNumber,
      file: stripCodeSpan(rawFile),
      purpose,
      visualContent,
      reviewPriority: rawReviewPriority
    });

    if (cells.some(cell => cell.trim().length === 0)) {
      issues.push(`Architecture Package Map row ${rowNumber} must not contain empty cells.`);
    }
  }

  return rows;
}

function validatePackageMapFilePath(row: PackageMapRow, changeDir: string, issues: string[]): void {
  if (!row.file.startsWith("architecture/")) {
    issues.push(`Architecture Package Map file \`${row.file}\` must start with \`architecture/\`.`);
  }
  if (!row.file.endsWith(".md")) {
    issues.push(`Architecture Package Map file \`${row.file}\` must end with \`.md\`.`);
  }
  if (row.file.slice("architecture/".length).includes("/")) {
    issues.push(`Architecture Package Map file \`${row.file}\` must be a direct file inside \`architecture/\`.`);
  }
  if (row.file !== DESIGN_ENTRYPOINT && row.file.startsWith("architecture/") && row.file.endsWith(".md") && !hasKebabCaseMarkdownFileName(row.file)) {
    issues.push(`Architecture Package Map file \`${row.file}\` must use kebab-case for architecture subdocuments.`);
  }
  if (row.file.length > 0 && !fs.existsSync(path.join(changeDir, row.file))) {
    issues.push(`Architecture Package Map file \`${row.file}\` must exist.`);
  }
}

function listedFilesFrom(rows: PackageMapRow[], filePath: string, issues: string[]): Set<string> {
  const changeDir = path.dirname(path.dirname(filePath));
  const listedFiles = new Set<string>();

  for (const [index, row] of rows.entries()) {
    if (index === 0 && row.file !== DESIGN_ENTRYPOINT) {
      issues.push("The first Architecture Package Map data row must be `architecture/design.md`.");
    }

    validatePackageMapFilePath(row, changeDir, issues);
    if (!REVIEW_PRIORITIES.has(row.reviewPriority.toLowerCase())) {
      issues.push(`Architecture Package Map row ${row.rowNumber} has invalid Review priority \`${row.reviewPriority}\`; expected high, medium, or low.`);
    }

    if (row.file.length > 0 && row.purpose.length > 0 && row.visualContent.length > 0) {
      listedFiles.add(row.file);
    }
  }

  return listedFiles;
}

function validateArchitectureFileCoverage(filePath: string, listedFiles: Set<string>, issues: string[]): void {
  for (const architectureFile of architectureFilesFor(filePath)) {
    if (!listedFiles.has(architectureFile)) {
      issues.push(`Architecture file \`${architectureFile}\` must be listed in Architecture Package Map.`);
    }
  }
}

function validateArchitecturePackageMap(lines: string[], filePath: string, issues: string[]): void {
  const packageMapLines = sectionLines(lines, "Architecture Package Map");
  const tableBlocks = parseTableBlocks(packageMapLines);
  if (tableBlocks.length === 0) {
    issues.push("Section `## Architecture Package Map` must contain a markdown table.");
  }
  if (tableBlocks.length !== 1) {
    issues.push(`Section \`## Architecture Package Map\` must contain exactly one markdown table, found ${tableBlocks.length}.`);
  }

  const tableBlock = tableBlocks[0];
  if (!tableBlock) {
    return;
  }

  const separatorIndex = validatePackageMapTableShape(packageMapLines, tableBlock, issues);
  const rows = parsePackageMapRows(packageMapLines, tableBlock, separatorIndex, issues);
  const listedFiles = listedFilesFrom(rows, filePath, issues);
  validateArchitectureFileCoverage(filePath, listedFiles, issues);

  if (listedFiles.size > 1 && !hasVisualReviewSurfaceOutsidePackageMap(lines)) {
    issues.push("Multi-file design packages must include a Mermaid block or markdown table outside `## Architecture Package Map`.");
  }
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

  validateArchitecturePackageMap(lines, filePath, issues);

  return issues;
}
