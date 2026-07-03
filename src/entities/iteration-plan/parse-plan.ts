import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { CheckEvidenceRow, GenerationBundleRow, Iteration, RequiredCheck, Task } from "./types";

function taskStatusFor(statusChar: string): Task["status"] {
  const normalized = statusChar.toLowerCase();
  if (normalized === "x") return "completed";
  if (normalized === "~" || normalized === "/") return "in_progress";
  return "not_started";
}

function parseTaskContent(content: string): { id: string; name: string } {
  const match = content.match(/^(\d+(?:\.\d+)+)\s+(.+)$/);
  if (!match || match[1] === undefined || match[2] === undefined) {
    return { id: "", name: content.trim() };
  }

  return { id: match[1], name: match[2].trim() };
}

function parseTasks(lines: string[]): Task[] {
  const tasks: Task[] = [];
  const stack: Array<{ indent: number; task: Task }> = [];
  const taskRegex = /^(\s*)-\s*\[\s*(x|~| |\/)\s*\]\s*(.*)$/i;

  for (const line of lines) {
    const match = line.match(taskRegex);
    if (!match || match[1] === undefined || match[2] === undefined || match[3] === undefined) {
      continue;
    }

    const indent = match[1].replace(/\t/g, "  ").length;
    const parsed = parseTaskContent(match[3]);
    const task: Task = {
      id: parsed.id,
      name: parsed.name,
      status: taskStatusFor(match[2]),
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.task;
    if (parent) {
      parent.children.push(task);
    } else {
      tasks.push(task);
    }
    stack.push({ indent, task });
  }

  return tasks;
}

function parseAdditionalChecks(lines: string[]): string[] {
  const checks: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:\*\*)?Additional checks(?:\*\*)?:\s*$/i.test(trimmed)) {
      inSection = true;
      continue;
    }

    if (!inSection) {
      continue;
    }

    if (trimmed.length === 0) {
      continue;
    }

    const bulletMatch = trimmed.match(/^-\s+(.+)$/);
    if (!bulletMatch) {
      break;
    }

    checks.push(bulletMatch[1].trim());
  }

  return checks;
}

function stripInlineCode(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1").trim();
}

function parseRequiredChecks(lines: string[]): RequiredCheck[] {
  const checks: RequiredCheck[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^###\s+Checks\s*$/i.test(trimmed)) {
      inSection = true;
      continue;
    }

    if (!inSection) {
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      break;
    }

    if (/^(?:\*\*)?Additional checks(?:\*\*)?:\s*$/i.test(trimmed)) {
      break;
    }

    if (trimmed.length === 0) {
      continue;
    }

    const bulletMatch = trimmed.match(/^-\s+([^:]+):\s*(.+)$/);
    if (!bulletMatch || bulletMatch[1] === undefined || bulletMatch[2] === undefined) {
      continue;
    }

    const check = bulletMatch[1].trim().toLowerCase();
    const command = stripInlineCode(bulletMatch[2]);
    if (check.length > 0 && command.length > 0) {
      checks.push({ check, command });
    }
  }

  return checks;
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

function headingLevel(line: string): number | null {
  const match = line.match(/^(#{1,6})\s+/);
  return match?.[1]?.length ?? null;
}

function parseTableAfterHeading(lines: string[], headingPattern: RegExp, boundaryLevel: number): string[][] {
  const headingIndex = lines.findIndex(line => headingPattern.test(line.trim()));
  if (headingIndex === -1) {
    return [];
  }

  const boundaryIndex = lines.findIndex((line, index) => {
    const level = headingLevel(line.trim());
    return index > headingIndex && level !== null && level <= boundaryLevel;
  });
  const sectionLines = lines.slice(headingIndex + 1, boundaryIndex === -1 ? lines.length : boundaryIndex);
  const tableStart = sectionLines.findIndex(line => line.trim().startsWith("|"));
  if (tableStart === -1) {
    return [];
  }

  const tableLines: string[] = [];
  for (const line of sectionLines.slice(tableStart)) {
    if (!line.trim().startsWith("|")) {
      break;
    }
    tableLines.push(line);
  }

  return tableLines
    .map(splitMarkdownTableRow)
    .filter(cells => cells.length > 0 && !isSeparatorRow(cells));
}

function parseGenerationBundle(lines: string[]): GenerationBundleRow[] {
  return parseTableAfterHeading(lines, /^##\s+Generation Bundle$/i, 2)
    .slice(1)
    .map(cells => ({
      area: cells[0] ?? "",
      required: cells[1] ?? "",
      plan: cells[2] ?? ""
    }));
}

function parseCheckEvidence(lines: string[]): CheckEvidenceRow[] {
  return parseTableAfterHeading(lines, /^###\s+Check Evidence$/i, 3)
    .slice(1)
    .map(cells => ({
      check: cells[0] ?? "",
      commandOrMethod: cells[1] ?? "",
      result: cells[2] ?? "",
      evidence: cells[3] ?? "",
      notes: cells[4] ?? ""
    }));
}

function iterationFor(meta: { id: number; name: string; status: Iteration["status"] }, heading: string, lines: string[], generationBundle: GenerationBundleRow[]): Iteration {
  return {
    ...meta,
    tasks: parseTasks(lines),
    additionalChecks: parseAdditionalChecks(lines),
    requiredChecks: parseRequiredChecks(lines),
    generationBundle,
    checkEvidence: parseCheckEvidence(lines),
    rawContent: [heading, ...lines].join("\n").trim()
  };
}

export function parsePlan(filePath: string): Iteration[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = content.split("\n");
  const iterations: Iteration[] = [];
  const generationBundle = parseGenerationBundle(lines);
  const phaseRegex = /^##\s*Iteration\s*(\d+)\s*:\s*(.*?)\s*\[\s*(x|~| |\/)\s*\]/i;

  let currentPhaseLines: string[] = [];
  let currentPhaseHeading = "";
  let currentPhaseMeta: { id: number; name: string; status: Iteration["status"] } | null = null;

  for (const line of lines) {
    const match = line.match(phaseRegex);
    if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
      if (currentPhaseMeta !== null) {
        iterations.push(iterationFor(currentPhaseMeta, currentPhaseHeading, currentPhaseLines, generationBundle));
      }

      currentPhaseLines = [];
      currentPhaseHeading = line;
      currentPhaseMeta = {
        id: parseInt(match[1], 10),
        name: match[2].trim(),
        status: taskStatusFor(match[3])
      };
      continue;
    }

    if (currentPhaseMeta !== null) {
      currentPhaseLines.push(line);
    }
  }

  if (currentPhaseMeta !== null) {
    iterations.push(iterationFor(currentPhaseMeta, currentPhaseHeading, currentPhaseLines, generationBundle));
  }

  return iterations;
}
