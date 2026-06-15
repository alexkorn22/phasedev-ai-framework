import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { extractPrdTraceability } from "../prd/traceability";

const REQUIRED_SECTIONS = [
  "PRD Intent Trace",
  "Requirements & Success Criteria Trace",
  "Source Facts",
  "Research Gaps & Blockers"
];

const INTENT_FIELDS = ["Change type", "Why", "Target state", "Risk boundaries"];
const ALLOWED_STATUSES = ["confirmed", "limited", "blocked", "not_applicable"];
const INTENT_TABLE_HEADERS = ["Field", "PRD Value", "Status", "Evidence", "Notes"];
const TRACE_TABLE_HEADERS = ["ID", "Status", "Code Evidence", "Spec Context", "Gaps/Blockers"];
const SOURCE_FACTS_HEADERS = ["Fact ID", "Type", "Source", "Fact", "Supports"];
const PRD_ONLY_INTENT_FIELDS = ["Change type", "Why"];
const CODE_EVIDENCE_REQUIRED_STATUSES = ["confirmed", "limited", "blocked"];

const BLOCKED_PLACEHOLDERS = [
  { pattern: /\bTBD\b/i, label: "TBD" },
  { pattern: /\bTODO\b/i, label: "TODO" },
  { pattern: /\bunknown\b/i, label: "unknown" },
  { pattern: /\bclarify later\b/i, label: "clarify later" },
  { pattern: /\bto be decided\b/i, label: "to be decided" }
];

const BLOCKED_TEMPLATE_SAMPLE_VALUES = [
  "src/file.ts:42",
  "test/file.test.ts:12",
  ".phasedev/specs/foo/spec.md:12",
  "Current implementation does X.",
  "Tests verify behavior X.",
  "Existing spec describes capability Y."
];

interface TableRow {
  cells: string[];
  rowNumber: number;
}

interface SourceFact {
  id: string;
  type: string;
  rowNumber: number;
  supports: string;
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
  const startIndex = lines.findIndex(line => headingName(line) === sectionName);
  if (startIndex === -1) {
    return [];
  }

  const endIndex = lines.findIndex((line, index) => index > startIndex && /^##\s+/.test(line));
  return lines.slice(startIndex + 1, endIndex === -1 ? lines.length : endIndex);
}

function tableRowsForSection(lines: string[], sectionName: string, expectedHeaders: string[], issues: string[]): TableRow[] {
  const tableLines = sectionLines(lines, sectionName).filter(line => line.trim().startsWith("|"));
  if (tableLines.length === 0) {
    issues.push(`Section \`## ${sectionName}\` must contain a markdown table.`);
    return [];
  }

  const headerCells = splitMarkdownTableRow(tableLines[0]);
  if (headerCells.length !== expectedHeaders.length || headerCells.some((header, index) => header !== expectedHeaders[index])) {
    issues.push(`${sectionName} columns must be exactly: ${expectedHeaders.join(", ")}.`);
  }

  if (tableLines.length < 2 || !isSeparatorRow(splitMarkdownTableRow(tableLines[1]))) {
    issues.push(`${sectionName} must include a separator row immediately after the header.`);
  }

  return tableLines.slice(2).map((line, index) => ({
    cells: splitMarkdownTableRow(line),
    rowNumber: index + 3
  }));
}

function validateCellCountAndNonEmpty(sectionName: string, rows: TableRow[], expectedCellCount: number, issues: string[]): TableRow[] {
  return rows.filter(row => {
    if (row.cells.length !== expectedCellCount) {
      issues.push(`${sectionName} row ${row.rowNumber} must have exactly ${expectedCellCount} cells.`);
      return false;
    }

    if (row.cells.some(cell => cell.trim().length === 0)) {
      issues.push(`${sectionName} row ${row.rowNumber} must not contain empty cells.`);
    }

    return true;
  });
}

function validateStatus(sectionName: string, rowNumber: number, status: string, issues: string[]): void {
  if (!ALLOWED_STATUSES.includes(status)) {
    const allowedList = `${ALLOWED_STATUSES.slice(0, -1).join(", ")}, or ${ALLOWED_STATUSES[ALLOWED_STATUSES.length - 1]}`;
    issues.push(`${sectionName} row ${rowNumber} has invalid Status \`${status}\`; expected ${allowedList}.`);
  }
}

function splitReferences(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map(reference => reference.trim())
    .filter(reference => reference.length > 0);
}

function validateIntentTable(lines: string[], sourceFactIds: Set<string>, prdIntent: Map<string, string>, issues: string[]): void {
  const validRows = validateCellCountAndNonEmpty(
    "PRD Intent Trace",
    tableRowsForSection(lines, "PRD Intent Trace", INTENT_TABLE_HEADERS, issues),
    INTENT_TABLE_HEADERS.length,
    issues
  );
  const fields = validRows.map(row => row.cells[0]);

  for (const field of INTENT_FIELDS) {
    if (!fields.includes(field)) {
      issues.push(`PRD Intent Trace must include field \`${field}\`.`);
    }
  }

  for (const field of fields) {
    if (!INTENT_FIELDS.includes(field)) {
      issues.push(`PRD Intent Trace contains unexpected field \`${field}\`.`);
    }
  }

  if (fields.length !== INTENT_FIELDS.length || fields.some((field, index) => field !== INTENT_FIELDS[index])) {
    issues.push(`PRD Intent Trace fields must exactly match this order: ${INTENT_FIELDS.map(field => `\`${field}\``).join(", ")}.`);
  }

  for (const row of validRows) {
    const [field, prdValue, status, evidence] = row.cells;
    validateStatus("PRD Intent Trace", row.rowNumber, status, issues);

    const expectedPrdValue = prdIntent.get(field);
    if (expectedPrdValue !== undefined && prdValue !== expectedPrdValue) {
      issues.push(`PRD Intent Trace row ${row.rowNumber} PRD Value for \`${field}\` must match prd.md value \`${expectedPrdValue}\`.`);
    }

    for (const reference of splitReferences(evidence)) {
      if (reference === "prd-only") {
        if (!PRD_ONLY_INTENT_FIELDS.includes(field)) {
          issues.push(`PRD Intent Trace row ${row.rowNumber} Evidence may use \`prd-only\` only for \`Change type\` and \`Why\`.`);
        }
        continue;
      }
      if (!/^[FS]\d+$/.test(reference)) {
        issues.push(`PRD Intent Trace row ${row.rowNumber} Evidence must reference only existing \`F#\`, \`S#\`, or \`prd-only\`.`);
        continue;
      }
      if (!sourceFactIds.has(reference)) {
        issues.push(`PRD Intent Trace row ${row.rowNumber} Evidence references unknown fact \`${reference}\`.`);
      }
    }
  }
}

function validateTraceTable(lines: string[], sourceFacts: SourceFact[], prdPath: string | undefined, issues: string[]): Set<string> {
  const validRows = validateCellCountAndNonEmpty(
    "Requirements & Success Criteria Trace",
    tableRowsForSection(lines, "Requirements & Success Criteria Trace", TRACE_TABLE_HEADERS, issues),
    TRACE_TABLE_HEADERS.length,
    issues
  );
  const actualIds = validRows.map(row => row.cells[0]);
  const codeFactIds = new Set(sourceFacts.filter(fact => /^F\d+$/.test(fact.id) && fact.type === "code").map(fact => fact.id));
  const specFactIds = new Set(sourceFacts.filter(fact => /^S\d+$/.test(fact.id) && fact.type === "spec").map(fact => fact.id));

  for (const row of validRows) {
    const [id, status, codeEvidence, specContext] = row.cells;
    if (!/^R\d+$/.test(id) && !/^SC\d+$/.test(id)) {
      issues.push(`Requirements & Success Criteria Trace row ${row.rowNumber} ID must use \`R#\` or \`SC#\` format.`);
    }

    validateStatus("Requirements & Success Criteria Trace", row.rowNumber, status, issues);

    let hasCodeFactEvidence = false;
    for (const reference of splitReferences(codeEvidence)) {
      if (reference === "not_applicable") {
        continue;
      }
      if (!/^F\d+$/.test(reference)) {
        issues.push(`Requirements & Success Criteria Trace row ${row.rowNumber} Code Evidence must reference only \`F#\` facts or be \`not_applicable\`.`);
        continue;
      }
      if (!codeFactIds.has(reference)) {
        issues.push(`Requirements & Success Criteria Trace row ${row.rowNumber} Code Evidence references unknown code fact \`${reference}\`.`);
      } else {
        hasCodeFactEvidence = true;
      }
    }

    if (CODE_EVIDENCE_REQUIRED_STATUSES.includes(status) && !hasCodeFactEvidence) {
      issues.push(`Requirements & Success Criteria Trace row ${row.rowNumber} with Status \`${status}\` must reference at least one \`F#\` code fact in Code Evidence.`);
    }

    for (const reference of splitReferences(specContext)) {
      if (reference === "none" || reference === "not_applicable") {
        continue;
      }
      if (!/^S\d+$/.test(reference)) {
        issues.push(`Requirements & Success Criteria Trace row ${row.rowNumber} Spec Context must reference only \`S#\`, \`none\`, or \`not_applicable\`.`);
        continue;
      }
      if (!specFactIds.has(reference)) {
        issues.push(`Requirements & Success Criteria Trace row ${row.rowNumber} Spec Context references unknown spec fact \`${reference}\`.`);
      }
    }
  }

  const duplicateIds = actualIds.filter((id, index) => actualIds.indexOf(id) !== index);
  for (const id of Array.from(new Set(duplicateIds))) {
    issues.push(`Requirements & Success Criteria Trace contains duplicate ID \`${id}\`.`);
  }

  if (!prdPath) {
    return new Set(actualIds);
  }

  const { requirements, criteria } = extractPrdTraceability(prdPath);
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

  return new Set(actualIds);
}

function validateSourceFacts(lines: string[], issues: string[]): SourceFact[] {
  const validRows = validateCellCountAndNonEmpty(
    "Source Facts",
    tableRowsForSection(lines, "Source Facts", SOURCE_FACTS_HEADERS, issues),
    SOURCE_FACTS_HEADERS.length,
    issues
  );
  const facts: SourceFact[] = [];
  const factIds: string[] = [];

  for (const row of validRows) {
    const [id, type, source, , supports] = row.cells;
    factIds.push(id);
    facts.push({ id, type, rowNumber: row.rowNumber, supports });

    if (/^F\d+$/.test(id) && type !== "code") {
      issues.push(`Source Facts row ${row.rowNumber} with Fact ID \`${id}\` must have Type \`code\`.`);
    } else if (/^S\d+$/.test(id) && type !== "spec") {
      issues.push(`Source Facts row ${row.rowNumber} with Fact ID \`${id}\` must have Type \`spec\`.`);
    } else if (!/^[FS]\d+$/.test(id)) {
      issues.push(`Source Facts row ${row.rowNumber} Fact ID must use \`F#\` or \`S#\` format.`);
    }

    if (!/\b[a-zA-Z0-9_\-\./]+:\d+\b/.test(source)) {
      issues.push(`Source Facts row ${row.rowNumber} Source must contain a path with a line number.`);
    }
  }

  const duplicateFactIds = factIds.filter((id, index) => factIds.indexOf(id) !== index);
  for (const id of Array.from(new Set(duplicateFactIds))) {
    issues.push(`Source Facts contains duplicate Fact ID \`${id}\`.`);
  }

  if (!facts.some(fact => /^F\d+$/.test(fact.id) && fact.type === "code")) {
    issues.push("Source Facts must include at least one `F#` code fact.");
  }

  return facts;
}

function validateSourceFactSupports(sourceFacts: SourceFact[], traceIds: Set<string>, issues: string[]): void {
  for (const fact of sourceFacts) {
    for (const reference of splitReferences(fact.supports)) {
      if (!/^R\d+$/.test(reference) && !/^SC\d+$/.test(reference)) {
        issues.push(`Source Facts row ${fact.rowNumber} Supports must reference only \`R#\` or \`SC#\` IDs.`);
        continue;
      }

      if (!traceIds.has(reference)) {
        issues.push(`Source Facts row ${fact.rowNumber} Supports references unknown trace ID \`${reference}\`.`);
      }
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

  for (const sampleValue of BLOCKED_TEMPLATE_SAMPLE_VALUES) {
    if (content.includes(sampleValue)) {
      issues.push(`research_facts.md must replace embedded template sample value \`${sampleValue}\`.`);
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
    if (!actualSections.includes(section)) {
      issues.push(`research_facts.md must contain section \`## ${section}\`.`);
    }
  }

  for (const section of actualSections) {
    if (!REQUIRED_SECTIONS.includes(section)) {
      issues.push(`research_facts.md contains unexpected section \`## ${section}\`.`);
    }
  }

  if (
    actualSections.length !== REQUIRED_SECTIONS.length ||
    actualSections.some((section, index) => section !== REQUIRED_SECTIONS[index])
  ) {
    issues.push(`research_facts.md \`##\` sections must exactly match this order: ${REQUIRED_SECTIONS.map(section => `\`## ${section}\``).join(", ")}.`);
  }

  const prdTraceability = prdPath ? extractPrdTraceability(prdPath) : { intent: new Map<string, string>(), requirements: [], criteria: [] };
  const sourceFacts = validateSourceFacts(lines, issues);
  validateIntentTable(lines, new Set(sourceFacts.map(fact => fact.id)), prdTraceability.intent, issues);
  const traceIds = validateTraceTable(lines, sourceFacts, prdPath, issues);
  validateSourceFactSupports(sourceFacts, traceIds, issues);

  return issues;
}
