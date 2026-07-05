import * as fs from "fs";
import { fencedCodeLineMask } from "../../shared/markdown/code-fences";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface ManageFindingsResult {
  ok: boolean;
  message: string;
}

interface FindingTableRow {
  id: string;
  status: string;
  severity: string;
  className: string;
  iteration: string;
  finding: string;
  requiredFix: string;
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = "";

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (trimmed[i] === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += trimmed[i];
  }
  cells.push(current.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();

  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c));
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
  const frontmatterMatch = content.match(/^---[\s\S]*?---\s*/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[0] : "";
  const body = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
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
  const dataLines = tableLines.slice(2).filter(line => !isSeparatorRow(splitTableRow(line)));

  const rows: FindingTableRow[] = dataLines.map(line => {
    const cells = splitTableRow(line);
    return {
      id: cells[0] ?? "",
      status: cells[1] ?? "",
      severity: cells[2] ?? "",
      className: cells[3] ?? "",
      iteration: cells[4] ?? "",
      finding: cells[5] ?? "",
      requiredFix: cells[6] ?? ""
    };
  });

  return { frontmatter, headerLine, rows, bodyBeforeTable, bodyAfterTable };
}

function escapeCell(value: string): string {
  // splitTableRow unescapes \| when reading, so cells held in memory are raw.
  // Escape pipes (and flatten newlines) on the way back out to keep the
  // markdown table structurally intact.
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function padColumns(rowParts: string[]): string {
  // Build a pipe-delimited row with consistent padding
  return `| ${rowParts.map(escapeCell).join(" | ")} |`;
}

function composeDocument(frontmatter: string, bodyBeforeTable: string, table: string, bodyAfterTable: string): string {
  const before = bodyBeforeTable.trimEnd();
  const beforeBlock = before ? `${before}\n\n` : "";
  return frontmatter + beforeBlock + table + (bodyAfterTable ? "\n" + bodyAfterTable : "");
}

const HEADER_CELLS = ["ID", "Status", "Severity", "Class", "Iteration", "Finding", "Required Fix"];
const SEPARATOR = "|---|---|---|---|---|---|---|";

export function addFinding(
  filePath: string,
  id: string,
  title: string,
  severity: string,
  className?: string,
  iteration?: string
): ManageFindingsResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, rows, bodyBeforeTable, bodyAfterTable } = parseTable(content);

  // Check for duplicate ID
  if (rows.some(r => r.id === id)) {
    return { ok: false, message: `Finding ID \`${id}\` already exists.` };
  }

  const newRow: FindingTableRow = {
    id,
    status: "open",
    severity,
    className: className ?? "validation",
    iteration: iteration ?? "current",
    finding: title,
    requiredFix: "TBD"
  };

  const allRows = [...rows, newRow];
  const tableBody = allRows.map(r => padColumns([r.id, r.status, r.severity, r.className, r.iteration, r.finding, r.requiredFix]));
  const table = [padColumns(HEADER_CELLS), SEPARATOR, ...tableBody].join("\n");
  const newContent = composeDocument(frontmatter, bodyBeforeTable, table, bodyAfterTable);

  writeFileAtomic(filePath, newContent);

  return {
    ok: true,
    message: `Finding ${id} added (severity: ${severity}).`
  };
}

export function resolveFinding(filePath: string, id: string): ManageFindingsResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const { frontmatter, rows, bodyBeforeTable, bodyAfterTable } = parseTable(content);

  const rowIndex = rows.findIndex(r => r.id === id);
  if (rowIndex === -1) {
    return { ok: false, message: `Finding ID \`${id}\` not found.` };
  }

  rows[rowIndex].status = "resolved";

  const tableBody = rows.map(r => padColumns([r.id, r.status, r.severity, r.className, r.iteration, r.finding, r.requiredFix]));
  const table = [padColumns(HEADER_CELLS), SEPARATOR, ...tableBody].join("\n");
  const newContent = composeDocument(frontmatter, bodyBeforeTable, table, bodyAfterTable);

  writeFileAtomic(filePath, newContent);

  return {
    ok: true,
    message: `Finding ${id} resolved.`
  };
}
