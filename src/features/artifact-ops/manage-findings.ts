import * as fs from "fs";
import { fencedCodeLineMask } from "../../shared/markdown/code-fences";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { matchFrontmatterBlock } from "../../shared/markdown/frontmatter";
import { escapeMarkdownTableCell, isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";
import { ALLOWED_SEVERITIES, ALLOWED_CLASSES, canonicalFindingKey } from "../../entities/validation-findings/parse-validation-findings";

export interface ManageFindingsResult {
  ok: boolean;
  message: string;
}

export interface FindingsCreateContext {
  type: "iteration" | "final";
  date: string;
}

interface FindingTableRow {
  id: string;
  status: string;
  severity: string;
  className: string;
  iteration: string;
  finding: string;
  requiredFix: string;
  resolution: string;
}

const HEADER_CELLS = ["ID", "Status", "Severity", "Class", "Iteration", "Finding", "Required Fix", "Resolution"];
const SEPARATOR = "|---|---|---|---|---|---|---|---|";
const LEGACY_RESOLVED_RESOLUTION = "legacy: resolved before Resolution column";
const KNOWN_VERDICTS = ["ready", "ready_with_risks", "repaired", "repair_required"] as const;
export const PLACEHOLDER_REQUIRED_FIX = /^(?:TBD|TODO|n\/a|none|-)$/i;

export function isPlaceholderRequiredFix(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || PLACEHOLDER_REQUIRED_FIX.test(trimmed);
}

function findTableBounds(lines: string[]): { start: number; end: number } | null {
  // Fenced example tables must not be mistaken for the findings table.
  const fenceMask = fencedCodeLineMask(lines);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!fenceMask[i] && lines[i].trim().startsWith("|")) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      return { start, end: i - 1 };
    }
  }
  if (start !== -1) return { start, end: lines.length - 1 };
  return null;
}

function parseTable(content: string): { frontmatter: string; headerLine: string; rows: FindingTableRow[]; bodyBeforeTable: string; bodyAfterTable: string } {
  const block = matchFrontmatterBlock(content);
  const frontmatter = block ? `${content.slice(0, block.endIndex)}\n\n` : "";
  const body = block ? content.slice(block.endIndex).replace(/^\s*/, "") : content;
  const bodyLines = body.split("\n");
  const tableBounds = findTableBounds(bodyLines);

  if (!tableBounds) {
    // No table yet: keep the whole body as leading content so nothing is lost
    // when the table is appended.
    return { frontmatter, headerLine: "", rows: [], bodyBeforeTable: body, bodyAfterTable: "" };
  }

  const tableLines = bodyLines.slice(tableBounds.start, tableBounds.end + 1);
  const bodyBeforeTable = bodyLines.slice(0, tableBounds.start).join("\n");
  const bodyAfterTable = bodyLines.slice(tableBounds.end + 1).join("\n");
  const headerLine = tableLines[0];
  // Skip header and separator to get data rows
  const dataLines = tableLines.slice(2).filter(line => !isMarkdownTableSeparatorRow(splitMarkdownTableRow(line)));

  const rows: FindingTableRow[] = dataLines.map(line => {
    const cells = splitMarkdownTableRow(line);
    return {
      id: cells[0] ?? "",
      status: cells[1] ?? "",
      severity: cells[2] ?? "",
      className: cells[3] ?? "",
      iteration: cells[4] ?? "",
      finding: cells[5] ?? "",
      requiredFix: cells[6] ?? "",
      resolution: cells[7] ?? ""
    };
  });

  // Legacy 7-column tables never recorded resolution evidence; a resolved row
  // without one is migrated in place the first time this file is mutated.
  for (const row of rows) {
    if (row.resolution.trim().length === 0 && row.status.toLowerCase() === "resolved") {
      row.resolution = LEGACY_RESOLVED_RESOLUTION;
    }
  }

  return { frontmatter, headerLine, rows, bodyBeforeTable, bodyAfterTable };
}

function padColumns(rowParts: string[]): string {
  // Build a pipe-delimited row with consistent padding
  return `| ${rowParts.map(escapeMarkdownTableCell).join(" | ")} |`;
}

function composeDocument(frontmatter: string, bodyBeforeTable: string, table: string, bodyAfterTable: string): string {
  const before = bodyBeforeTable.trimEnd();
  const beforeBlock = before ? `${before}\n\n` : "";
  return frontmatter + beforeBlock + table + (bodyAfterTable ? "\n" + bodyAfterTable : "");
}

function writeTable(filePath: string, parsed: ReturnType<typeof parseTable>, rows: FindingTableRow[]): void {
  const tableBody = rows.map(r => padColumns([r.id, r.status, r.severity, r.className, r.iteration, r.finding, r.requiredFix, r.resolution]));
  const table = [padColumns(HEADER_CELLS), SEPARATOR, ...tableBody].join("\n");
  writeFileAtomic(filePath, composeDocument(parsed.frontmatter, parsed.bodyBeforeTable, table, parsed.bodyAfterTable));
}

function readVerdictLine(frontmatter: string): string | null {
  const match = frontmatter.match(/^verdict:\s*(.+?)\s*$/m);
  return match ? match[1] : null;
}

function isKnownVerdict(value: string): value is (typeof KNOWN_VERDICTS)[number] {
  return (KNOWN_VERDICTS as readonly string[]).includes(value);
}

function correctedVerdict(current: string, addedSeverity: string): string | null {
  const isBlocking = addedSeverity.toUpperCase() === "MUST-FIX";
  if (isBlocking && ["ready", "ready_with_risks", "repaired"].includes(current)) return "repair_required";
  if (!isBlocking && current === "ready") return "ready_with_risks";
  return null;
}

/**
 * Открытая строка делает «готовый» вердикт противоречивым; команда чинит его
 * атомарно. Guard: отсутствующая или невалидная строка verdict (например,
 * плейсхолдер шаблона до записи вердикта валидатором) — коррекция молча
 * пропускается, файл не трогается.
 */
function applyVerdictCorrection(parsed: ReturnType<typeof parseTable>, addedSeverity: string): string {
  const current = readVerdictLine(parsed.frontmatter);
  if (current === null || !isKnownVerdict(current)) return "";
  const next = correctedVerdict(current, addedSeverity);
  if (!next) return "";
  parsed.frontmatter = parsed.frontmatter.replace(/^verdict:\s*.*$/m, `verdict: ${next}`);
  return `; verdict updated to ${next}`;
}

function findingsFileSkeleton(context: FindingsCreateContext, verdict: string): string {
  return [
    "---",
    `verdict: ${verdict}`,
    `type: ${context.type}`,
    `date: ${context.date}`,
    "---",
    "",
    padColumns(HEADER_CELLS),
    SEPARATOR,
    ""
  ].join("\n");
}

function verdictConsistencyIssue(verdict: string, rows: FindingTableRow[]): string | null {
  const openRows = rows.filter(r => ["open", "reopened"].includes(r.status.toLowerCase()));
  const openBlocking = openRows.filter(r => r.severity.toUpperCase() === "MUST-FIX");
  if (verdict === "ready" && openRows.length > 0) return "`verdict: ready` is allowed only when there are no open or reopened findings.";
  if (verdict === "ready_with_risks" && openBlocking.length > 0) return "`verdict: ready_with_risks` is not allowed while open or reopened MUST-FIX findings exist.";
  if (verdict === "repair_required" && openBlocking.length === 0) return "`verdict: repair_required` requires at least one open or reopened MUST-FIX finding.";
  if (verdict === "repaired" && openBlocking.length > 0) return "`verdict: repaired` is not allowed while open or reopened MUST-FIX findings exist.";
  return null;
}

export function addFinding(
  filePath: string,
  id: string | null,
  title: string,
  severity: string,
  requiredFix: string,
  className?: string,
  iteration?: string,
  createContext?: FindingsCreateContext
): ManageFindingsResult {
  if (isPlaceholderRequiredFix(requiredFix)) {
    return { ok: false, message: "Required fix must be a concrete action; placeholder values such as TBD are not allowed." };
  }
  if (!iteration || iteration.trim().length === 0) {
    return { ok: false, message: "Iteration label is required (for example \"Iteration 1\" or \"Final\")." };
  }

  const normalizedSeverity = severity.toUpperCase();

  if (!fs.existsSync(filePath)) {
    if (!createContext) {
      return { ok: false, message: `File not found: ${filePath}` };
    }
    const skeletonVerdict = normalizedSeverity === "MUST-FIX" ? "repair_required" : "ready_with_risks";
    writeFileAtomic(filePath, findingsFileSkeleton(createContext, skeletonVerdict));
  }

  if (!ALLOWED_SEVERITIES.has(normalizedSeverity)) {
    return { ok: false, message: `Invalid severity \`${severity}\`. Must be one of: MUST-FIX, RECOMMENDED, NIT.` };
  }

  const normalizedClass = (className ?? "validation").toLowerCase();
  if (!ALLOWED_CLASSES.has(normalizedClass)) {
    return { ok: false, message: `Invalid class \`${className}\`. Must be one of: implementation, test, plan, design, requirements, validation, security, code_review.` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = parseTable(content);
  const { rows } = parsed;

  const duplicate = rows.find(r => canonicalFindingKey(r.finding) === canonicalFindingKey(title));
  if (duplicate) {
    return { ok: false, message: `Finding \`${duplicate.id}\` already covers this issue ("${duplicate.finding}"). Update or reopen ${duplicate.id} instead of adding a duplicate.` };
  }

  if (id !== null && rows.some(r => r.id === id)) {
    return { ok: false, message: `Finding ID \`${id}\` already exists.` };
  }

  const maxNumber = rows.reduce((max, row) => {
    const match = /^F(\d+)$/i.exec(row.id.trim());
    return match ? Math.max(max, Number.parseInt(match[1], 10)) : max;
  }, 0);
  const newId = id ?? `F${maxNumber + 1}`;

  const newRow: FindingTableRow = {
    id: newId,
    status: "open",
    severity: normalizedSeverity,
    className: normalizedClass,
    iteration,
    finding: title,
    requiredFix,
    resolution: ""
  };

  const allRows = [newRow, ...rows];
  const verdictNote = applyVerdictCorrection(parsed, normalizedSeverity);
  writeTable(filePath, parsed, allRows);

  return {
    ok: true,
    message: `Finding ${newId} added (severity: ${normalizedSeverity})${verdictNote}.`
  };
}

export function resolveFinding(filePath: string, id: string, resolution: string): ManageFindingsResult {
  if (isPlaceholderRequiredFix(resolution)) {
    return { ok: false, message: "Resolution must record what was changed and how it was verified; placeholders are not allowed." };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = parseTable(content);
  const { rows } = parsed;

  const row = rows.find(r => r.id === id);
  if (!row) {
    return { ok: false, message: `Finding ID \`${id}\` not found.` };
  }
  if (row.status !== "open" && row.status !== "reopened") {
    return { ok: false, message: `Finding ${id} is ${row.status}; only open or reopened findings can be resolved.` };
  }

  row.status = "resolved";
  row.resolution = resolution.trim();

  writeTable(filePath, parsed, rows);

  return {
    ok: true,
    message: `Finding ${id} resolved.`
  };
}

export function reopenFinding(filePath: string, id: string, evidence: string): ManageFindingsResult {
  if (isPlaceholderRequiredFix(evidence)) {
    return { ok: false, message: "Reopen evidence must be concrete; placeholders are not allowed." };
  }
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = parseTable(content);
  const { rows } = parsed;

  const row = rows.find(r => r.id === id);
  if (!row) {
    return { ok: false, message: `Finding ID \`${id}\` not found.` };
  }
  if (row.status !== "resolved") {
    return { ok: false, message: `Finding ${id} is ${row.status}; only resolved findings can be reopened.` };
  }

  row.status = "reopened";
  // Finding text stays untouched so the dedup key remains stable; the
  // Resolution cell accumulates history instead of being overwritten.
  row.resolution = row.resolution ? `${row.resolution}; reopened: ${evidence.trim()}` : `reopened: ${evidence.trim()}`;

  const verdictNote = applyVerdictCorrection(parsed, row.severity);
  writeTable(filePath, parsed, rows);

  return {
    ok: true,
    message: `Finding ${id} reopened${verdictNote}.`
  };
}

export function setFindingsVerdict(filePath: string, verdict: string, context: FindingsCreateContext): ManageFindingsResult {
  if (!isKnownVerdict(verdict)) {
    return { ok: false, message: `Invalid verdict \`${verdict}\`. Must be one of: ${KNOWN_VERDICTS.join(", ")}.` };
  }
  if (!fs.existsSync(filePath)) {
    const issue = verdictConsistencyIssue(verdict, []);
    if (issue) return { ok: false, message: issue };
    writeFileAtomic(filePath, findingsFileSkeleton(context, verdict));
    return { ok: true, message: `Created ${filePath} with verdict ${verdict}.` };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = parseTable(content);
  const issue = verdictConsistencyIssue(verdict, parsed.rows);
  if (issue) return { ok: false, message: issue };
  if (readVerdictLine(parsed.frontmatter) !== null) {
    parsed.frontmatter = parsed.frontmatter.replace(/^verdict:\s*.*$/m, `verdict: ${verdict}`);
  } else {
    return { ok: false, message: "validation_findings.md has no `verdict:` frontmatter line to update." };
  }
  parsed.frontmatter = /^date:\s*/m.test(parsed.frontmatter)
    ? parsed.frontmatter.replace(/^date:\s*.*$/m, `date: ${context.date}`)
    : parsed.frontmatter;
  writeTable(filePath, parsed, parsed.rows);
  return { ok: true, message: `Verdict set to ${verdict}.` };
}
