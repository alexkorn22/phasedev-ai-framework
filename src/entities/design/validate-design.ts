import * as fs from "fs";
import * as path from "path";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { readFrontmatter } from "../../shared/markdown/frontmatter";
import {
  emptyTableCellsDiagnostic,
  isMarkdownTableSeparatorRow,
  MarkdownTableBlock,
  MarkdownTableRow,
  parseMarkdownTableBlocks,
  splitMarkdownTableRow
} from "../../shared/markdown/table";
import { extractPrdTraceability } from "../prd/traceability";

const BLOCKED_PLACEHOLDERS = [
  { pattern: /\bTBD\b/i, label: "TBD" },
  { pattern: /\bTODO\b/i, label: "TODO" },
  { pattern: /\bunknown\b/i, label: "unknown" },
  { pattern: /\bclarify later\b/i, label: "clarify later" },
  { pattern: /\bto be decided\b/i, label: "to be decided" }
];

const PACKAGE_MAP_HEADERS = ["File", "Purpose", "Visual content", "Review priority"];
const TRACEABILITY_HEADERS = ["PRD ID", "Research Evidence", "Design Decisions", "Design Coverage", "Plan Impact"];
const DECISION_HEADERS = ["Decision ID", "Decision", "Rationale", "Applies To", "Impacts"];
const REVIEW_PRIORITIES = new Set(["high", "medium", "low"]);
const DESIGN_ENTRYPOINT = "architecture/design.md";

export interface ValidateDesignOptions {
  prdPath?: string;
  researchPath?: string;
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

function tableRowsForSection(lines: string[], sectionName: string, expectedHeaders: string[], issues: string[]): MarkdownTableRow[] {
  const tableLines = sectionLines(lines, sectionName);
  const tableBlocks = parseMarkdownTableBlocks(tableLines);
  if (tableBlocks.length === 0) {
    issues.push(`Section \`## ${sectionName}\` must contain a markdown table.`);
    return [];
  }
  if (tableBlocks.length !== 1) {
    issues.push(`Section \`## ${sectionName}\` must contain exactly one markdown table, found ${tableBlocks.length}.`);
  }

  const tableBlock = tableBlocks[0];
  if (!tableBlock) {
    return [];
  }

  const headerCells = splitMarkdownTableRow(tableLines[tableBlock.start]);
  if (headerCells.length !== expectedHeaders.length || headerCells.some((header, index) => header !== expectedHeaders[index])) {
    issues.push(`${sectionName} columns must be exactly: ${expectedHeaders.join(", ")}.`);
  }

  const separatorIndex = tableBlock.start + 1;
  if (separatorIndex > tableBlock.end || !isMarkdownTableSeparatorRow(splitMarkdownTableRow(tableLines[separatorIndex]))) {
    issues.push(`${sectionName} must include a separator row immediately after the header.`);
  }

  const rows: MarkdownTableRow[] = [];
  for (let rowIndex = separatorIndex + 1; rowIndex <= tableBlock.end; rowIndex++) {
    const cells = splitMarkdownTableRow(tableLines[rowIndex]);
    const rowNumber = rowIndex + 1;
    if (isMarkdownTableSeparatorRow(cells)) {
      issues.push(`${sectionName} row ${rowNumber} contains an unexpected separator.`);
      continue;
    }
    if (cells.length !== expectedHeaders.length) {
      issues.push(`${sectionName} row ${rowNumber} must have exactly ${expectedHeaders.length} cells.`);
      continue;
    }
    const row = { rowNumber, cells };
    const emptyCellsIssue = emptyTableCellsDiagnostic(sectionName, row, expectedHeaders);
    if (emptyCellsIssue) {
      issues.push(emptyCellsIssue);
    }
    rows.push(row);
  }

  return rows;
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
    parseMarkdownTableBlocks(linesOutsidePackageMap).length > 0;
}

function validatePackageMapTableShape(lines: string[], tableBlock: MarkdownTableBlock, issues: string[]): number {
  const headerCells = splitMarkdownTableRow(lines[tableBlock.start]);
  if (headerCells.length !== PACKAGE_MAP_HEADERS.length || headerCells.some((header, index) => header !== PACKAGE_MAP_HEADERS[index])) {
    issues.push("Architecture Package Map columns must be exactly: File, Purpose, Visual content, Review priority.");
  }

  const separatorIndex = tableBlock.start + 1;
  if (separatorIndex > tableBlock.end || !isMarkdownTableSeparatorRow(splitMarkdownTableRow(lines[separatorIndex]))) {
    issues.push("Architecture Package Map must include a separator row immediately after the header.");
  }

  return separatorIndex;
}

function parsePackageMapRows(lines: string[], tableBlock: MarkdownTableBlock, separatorIndex: number, issues: string[]): PackageMapRow[] {
  const rows: PackageMapRow[] = [];

  for (let rowIndex = separatorIndex + 1; rowIndex <= tableBlock.end; rowIndex++) {
    const cells = splitMarkdownTableRow(lines[rowIndex]);
    const rowNumber = rowIndex + 1;
    if (isMarkdownTableSeparatorRow(cells)) {
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

    const emptyCellsIssue = emptyTableCellsDiagnostic("Architecture Package Map", { rowNumber, cells }, PACKAGE_MAP_HEADERS);
    if (emptyCellsIssue) {
      issues.push(emptyCellsIssue);
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
  const tableBlocks = parseMarkdownTableBlocks(packageMapLines);
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

function splitReferences(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map(reference => reference.trim())
    .filter(reference => reference.length > 0);
}

function collectResearchFactIds(researchPath: string | undefined): Set<string> {
  if (!researchPath || !fs.existsSync(researchPath)) {
    return new Set();
  }

  const content = normalizeLineEndings(fs.readFileSync(researchPath, "utf-8"));
  const factIds = new Set<string>();
  for (const line of content.split("\n")) {
    const match = line.match(/^\|\s*([FS]\d+)\s*\|/);
    if (match) {
      factIds.add(match[1]);
    }
  }
  return factIds;
}

function collectDecisionRows(lines: string[], issues: string[]): Map<string, MarkdownTableRow> {
  const rows = tableRowsForSection(lines, "Key Design Decisions", DECISION_HEADERS, issues);
  const decisionRows = new Map<string, MarkdownTableRow>();

  for (const row of rows) {
    const decisionId = row.cells[0] ?? "";
    if (!/^D\d+$/.test(decisionId)) {
      issues.push(`Key Design Decisions row ${row.rowNumber} Decision ID must use \`D#\` format.`);
      continue;
    }

    if (decisionRows.has(decisionId)) {
      issues.push(`Key Design Decisions contains duplicate Decision ID \`${decisionId}\`.`);
    }
    decisionRows.set(decisionId, row);
  }

  return decisionRows;
}

function validateTraceabilityMapping(lines: string[], options: ValidateDesignOptions, issues: string[]): void {
  const traceRows = tableRowsForSection(lines, "Traceability Mapping", TRACEABILITY_HEADERS, issues);
  const decisionRows = collectDecisionRows(lines, issues);
  const referencedDecisionIds = new Set<string>();
  const actualPrdIds = traceRows.map(row => row.cells[0] ?? "");
  const researchFactIds = collectResearchFactIds(options.researchPath);

  for (const row of traceRows) {
    const [prdId, researchEvidence, designDecisions] = row.cells;
    if (!/^R\d+$/.test(prdId) && !/^SC\d+$/.test(prdId)) {
      issues.push(`Traceability Mapping row ${row.rowNumber} PRD ID must use \`R#\` or \`SC#\` format.`);
    }

    for (const reference of splitReferences(designDecisions)) {
      if (!/^D\d+$/.test(reference)) {
        issues.push(`Traceability Mapping row ${row.rowNumber} Design Decisions must reference only \`D#\` IDs.`);
        continue;
      }
      if (!decisionRows.has(reference)) {
        issues.push(`Traceability Mapping row ${row.rowNumber} references unknown design decision \`${reference}\`.`);
      }
      referencedDecisionIds.add(reference);
    }

    const trimmedResearchEvidence = researchEvidence.trim();
    if (/^not_applicable\b/.test(trimmedResearchEvidence)) {
      if (!/^not_applicable\s*[:(]\s*\S/.test(trimmedResearchEvidence)) {
        issues.push(`Traceability Mapping row ${row.rowNumber} Research Evidence \`not_applicable\` must include a short reason in the same cell.`);
      }
      continue;
    }

    for (const reference of splitReferences(trimmedResearchEvidence)) {
      if (!/^[FS]\d+$/.test(reference)) {
        issues.push(`Traceability Mapping row ${row.rowNumber} Research Evidence must reference only \`F#\`, \`S#\`, or \`not_applicable\`.`);
        continue;
      }
      if (options.researchPath && !researchFactIds.has(reference)) {
        issues.push(`Traceability Mapping row ${row.rowNumber} Research Evidence references unknown fact \`${reference}\`.`);
      }
    }
  }

  if (options.prdPath && fs.existsSync(options.prdPath)) {
    const { requirements, criteria } = extractPrdTraceability(options.prdPath);
    const expectedIds = [...requirements, ...criteria];
    for (const id of expectedIds) {
      if (!actualPrdIds.includes(id)) {
        issues.push(`Traceability Mapping must include PRD ID \`${id}\`.`);
      }
    }
    for (const id of actualPrdIds) {
      if (!expectedIds.includes(id)) {
        issues.push(`Traceability Mapping contains unexpected PRD ID \`${id}\`.`);
      }
    }
  }

  const duplicatePrdIds = actualPrdIds.filter((id, index) => actualPrdIds.indexOf(id) !== index);
  for (const id of Array.from(new Set(duplicatePrdIds))) {
    issues.push(`Traceability Mapping contains duplicate PRD ID \`${id}\`.`);
  }

  for (const decisionId of decisionRows.keys()) {
    if (!referencedDecisionIds.has(decisionId)) {
      issues.push(`Key Design Decisions ID \`${decisionId}\` must be referenced by Traceability Mapping.`);
    }
  }
}

export function validateDesign(filePath: string, options: ValidateDesignOptions = {}): string[] {
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

  validateArchitecturePackageMap(lines, filePath, issues);
  if (options.prdPath || options.researchPath) {
    validateTraceabilityMapping(lines, options, issues);
  }

  return issues;
}
