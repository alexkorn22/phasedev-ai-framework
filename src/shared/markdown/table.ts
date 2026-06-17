export interface MarkdownTableBlock {
  start: number;
  end: number;
}

export interface MarkdownTableRow {
  rowNumber: number;
  cells: string[];
}

export function splitMarkdownTableRow(line: string): string[] {
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

export function isMarkdownTableSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function parseMarkdownTableBlocks(lines: string[]): MarkdownTableBlock[] {
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

export function emptyTableCellsDiagnostic(
  sectionName: string,
  row: MarkdownTableRow,
  headers: string[],
  options: { rowLabel?: string } = {}
): string | null {
  const emptyColumns = row.cells
    .map((cell, index) => ({ cell, header: headers[index] ?? `Column ${index + 1}` }))
    .filter(column => column.cell.trim().length === 0)
    .map(column => column.header);

  if (emptyColumns.length === 0) {
    return null;
  }

  const rowId = row.cells[0]?.trim();
  const identity = rowId ? ` (${rowId})` : "";
  const label = options.rowLabel ?? `${sectionName} row ${row.rowNumber}`;
  return `${label}${identity} has empty cell(s): ${emptyColumns.join(", ")}.`;
}
