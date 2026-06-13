import * as fs from "fs";

export interface PrdTraceIds {
  requirements: string[];
  criteria: string[];
}

export interface PrdTraceability {
  intent: Map<string, string>;
  requirements: string[];
  criteria: string[];
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

function collectFirstColumnIds(lines: string[], sectionName: string, idPattern: RegExp): string[] {
  const ids: string[] = [];
  let currentSection = "";

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1].trim().toLowerCase();
      continue;
    }

    if (currentSection !== sectionName.toLowerCase() || !line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    const id = cells[0] ?? "";
    if (cells[0] === "ID" || isSeparatorRow(cells)) {
      continue;
    }
    if (idPattern.test(id)) {
      ids.push(id);
    }
  }

  return ids;
}

function collectIntentValues(lines: string[]): Map<string, string> {
  const values = new Map<string, string>();
  let currentSection = "";

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1].trim().toLowerCase();
      continue;
    }

    if (currentSection !== "intent" || !line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells[0] === "Field" || isSeparatorRow(cells)) {
      continue;
    }

    const field = cells[0] ?? "";
    const value = cells[1] ?? "";
    if (field.length > 0) {
      values.set(field, value);
    }
  }

  return values;
}

export function extractRequirementsAndCriteriaFromPrd(prdPath: string): PrdTraceIds {
  if (!fs.existsSync(prdPath)) {
    return { requirements: [], criteria: [] };
  }

  const lines = fs.readFileSync(prdPath, "utf-8").split("\n");
  return {
    requirements: collectFirstColumnIds(lines, "Requirements", /^R\d+$/),
    criteria: collectFirstColumnIds(lines, "Success Criteria", /^SC\d+$/)
  };
}

export function extractPrdTraceability(prdPath: string): PrdTraceability {
  if (!fs.existsSync(prdPath)) {
    return { intent: new Map(), requirements: [], criteria: [] };
  }

  const lines = fs.readFileSync(prdPath, "utf-8").split("\n");
  return {
    intent: collectIntentValues(lines),
    requirements: collectFirstColumnIds(lines, "Requirements", /^R\d+$/),
    criteria: collectFirstColumnIds(lines, "Success Criteria", /^SC\d+$/)
  };
}
