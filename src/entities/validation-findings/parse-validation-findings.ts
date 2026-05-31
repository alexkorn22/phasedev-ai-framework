import { readFrontmatterValue } from "../../shared/markdown/frontmatter";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import * as fs from "fs";

export interface BlockingValidationFinding {
  id: string;
  status: string;
  className: string;
  phase: string;
  description: string;
  signature: string;
}

export function parseValidationVerdict(filePath: string): "ready" | "ready_with_risks" | "repaired" | "repair_required" | "unknown" {
  const verdict = readFrontmatterValue(filePath, "verdict")?.toLowerCase();
  if (verdict === "ready" || verdict === "ready_with_risks" || verdict === "repaired" || verdict === "repair_required") {
    return verdict;
  }

  return "unknown";
}

export function parseValidationVerdictType(filePath: string): "phase" | "final" | "unknown" {
  const type = readFrontmatterValue(filePath, "type")?.toLowerCase();
  if (type === "phase" || type === "final") {
    return type;
  }

  return "unknown";
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

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9?]+/g, "");
}

function normalizeSignaturePart(value: string): string {
  return value
    .replace(/reopened\s*\/\s*regression/gi, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function signatureFor(type: string, phase: string, className: string, description: string): string {
  return [
    normalizeSignaturePart(type),
    normalizeSignaturePart(phase),
    normalizeSignaturePart(className),
    normalizeSignaturePart(description)
  ].join("|");
}

export function parseBlockingValidationFindings(filePath: string): BlockingValidationFinding[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const type = parseValidationVerdictType(filePath);
  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = content.split("\n");
  const findings: BlockingValidationFinding[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim().startsWith("|")) continue;

    const headers = splitMarkdownTableRow(line);
    const headerIndexes = new Map(headers.map((header, columnIndex) => [normalizeHeader(header), columnIndex]));
    const requiredColumns = ["id", "status", "class", "blockspr?", "phase", "description"];
    if (!requiredColumns.every(column => headerIndexes.has(column))) {
      continue;
    }

    let rowIndex = index + 1;
    if (rowIndex < lines.length && isSeparatorRow(splitMarkdownTableRow(lines[rowIndex]))) {
      rowIndex++;
    }

    for (; rowIndex < lines.length; rowIndex++) {
      const rowLine = lines[rowIndex];
      if (!rowLine.trim().startsWith("|")) {
        break;
      }

      const cells = splitMarkdownTableRow(rowLine);
      if (isSeparatorRow(cells)) {
        continue;
      }

      const id = cells[headerIndexes.get("id") ?? -1]?.trim() ?? "";
      const status = cells[headerIndexes.get("status") ?? -1]?.trim().toLowerCase() ?? "";
      const className = cells[headerIndexes.get("class") ?? -1]?.trim() ?? "";
      const blocksPr = cells[headerIndexes.get("blockspr?") ?? -1]?.trim().toLowerCase() ?? "";
      const phase = cells[headerIndexes.get("phase") ?? -1]?.trim() ?? "";
      const description = cells[headerIndexes.get("description") ?? -1]?.trim() ?? "";

      if (blocksPr !== "yes") {
        continue;
      }

      findings.push({
        id,
        status,
        className,
        phase,
        description,
        signature: signatureFor(type, phase, className, description)
      });
    }
  }

  return findings;
}
