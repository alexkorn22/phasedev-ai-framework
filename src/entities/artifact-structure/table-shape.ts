import { sectionLines } from "../../shared/markdown/headings";
import {
  emptyTableCellsDiagnostic,
  isMarkdownTableSeparatorRow,
  MarkdownTableRow,
  parseMarkdownTableBlocks,
  splitMarkdownTableRow
} from "../../shared/markdown/table";

/**
 * Declarative shape of a single markdown table living under a `## <section>`.
 *
 * - `mode: "filtered"` treats every pipe-prefixed line in the section as one
 *   table (no gap detection, no "exactly one table" check). Data-row numbers
 *   are `index + 3` (header + separator counted).
 * - `mode: "blocks"` uses gap-aware block detection, reports a second table as
 *   an error, and flags unexpected in-body separator rows. Row numbers are the
 *   1-based position inside the section body.
 * - `rowChecks` enables per-row cell-count and empty-cell diagnostics and drops
 *   rows with the wrong cell count from the returned set (always on in blocks
 *   mode, which validates every emitted row).
 */
export interface TableShapeSpec {
  section: string;
  headers: string[];
  mode: "filtered" | "blocks";
  rowChecks: boolean;
  sectionCaseInsensitive?: boolean;
}

export function validateTableShape(lines: string[], spec: TableShapeSpec, issues: string[]): MarkdownTableRow[] {
  const secLines = sectionLines(lines, spec.section, spec.sectionCaseInsensitive ?? true);
  return spec.mode === "blocks"
    ? validateBlockTable(secLines, spec, issues)
    : validateFilteredTable(secLines, spec, issues);
}

function validateHeaderAndSeparator(cells: string[], separatorCells: string[], spec: TableShapeSpec, issues: string[]): void {
  if (cells.length !== spec.headers.length || cells.some((header, index) => header !== spec.headers[index])) {
    issues.push(`${spec.section} columns must be exactly: ${spec.headers.join(", ")}.`);
  }
  if (!isMarkdownTableSeparatorRow(separatorCells)) {
    issues.push(`${spec.section} must include a separator row immediately after the header.`);
  }
}

function filterRowShape(spec: TableShapeSpec, rows: MarkdownTableRow[], issues: string[]): MarkdownTableRow[] {
  return rows.filter(row => {
    if (row.cells.length !== spec.headers.length) {
      issues.push(`${spec.section} row ${row.rowNumber} must have exactly ${spec.headers.length} cells.`);
      return false;
    }

    const emptyCellsIssue = emptyTableCellsDiagnostic(spec.section, row, spec.headers);
    if (emptyCellsIssue) {
      issues.push(emptyCellsIssue);
    }
    return true;
  });
}

function validateFilteredTable(secLines: string[], spec: TableShapeSpec, issues: string[]): MarkdownTableRow[] {
  const tableLines = secLines.filter(line => line.trim().startsWith("|"));
  if (tableLines.length === 0) {
    issues.push(`Section \`## ${spec.section}\` must contain a markdown table.`);
    return [];
  }

  const separatorCells = tableLines.length < 2 ? [] : splitMarkdownTableRow(tableLines[1]);
  validateHeaderAndSeparator(splitMarkdownTableRow(tableLines[0]), separatorCells, spec, issues);

  const dataRows: MarkdownTableRow[] = tableLines.slice(2).map((line, index) => ({
    cells: splitMarkdownTableRow(line),
    rowNumber: index + 3
  }));

  return spec.rowChecks ? filterRowShape(spec, dataRows, issues) : dataRows;
}

function validateBlockTable(secLines: string[], spec: TableShapeSpec, issues: string[]): MarkdownTableRow[] {
  const blocks = parseMarkdownTableBlocks(secLines);
  if (blocks.length === 0) {
    issues.push(`Section \`## ${spec.section}\` must contain a markdown table.`);
    return [];
  }
  if (blocks.length !== 1) {
    issues.push(`Section \`## ${spec.section}\` must contain exactly one markdown table, found ${blocks.length}.`);
  }

  const block = blocks[0];
  if (!block) {
    return [];
  }

  const separatorIndex = block.start + 1;
  const separatorCells = separatorIndex > block.end ? [] : splitMarkdownTableRow(secLines[separatorIndex]);
  validateHeaderAndSeparator(splitMarkdownTableRow(secLines[block.start]), separatorCells, spec, issues);

  const rows: MarkdownTableRow[] = [];
  for (let rowIndex = separatorIndex + 1; rowIndex <= block.end; rowIndex++) {
    const cells = splitMarkdownTableRow(secLines[rowIndex]);
    const rowNumber = rowIndex + 1;
    if (isMarkdownTableSeparatorRow(cells)) {
      issues.push(`${spec.section} row ${rowNumber} contains an unexpected separator.`);
      continue;
    }
    if (cells.length !== spec.headers.length) {
      issues.push(`${spec.section} row ${rowNumber} must have exactly ${spec.headers.length} cells.`);
      continue;
    }

    const row = { rowNumber, cells };
    const emptyCellsIssue = emptyTableCellsDiagnostic(spec.section, row, spec.headers);
    if (emptyCellsIssue) {
      issues.push(emptyCellsIssue);
    }
    rows.push(row);
  }

  return rows;
}
