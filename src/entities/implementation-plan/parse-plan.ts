import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { Phase, Task } from "./types";

function parseTasks(lines: string[]): Task[] {
  const tasks: Task[] = [];
  const taskRegex = /^-\s*\[\s*(x|~| |\/)\s*\]\s*(.*)$/i;

  for (const line of lines) {
    const match = line.trim().match(taskRegex);
    if (match && match[1] !== undefined && match[2] !== undefined) {
      const statusChar = match[1].toLowerCase();
      const status = statusChar === "x" ? "completed" : statusChar === "~" || statusChar === "/" ? "in_progress" : "not_started";
      tasks.push({ name: match[2].trim(), status });
    }
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

export function parsePlan(filePath: string): Phase[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = content.split("\n");
  const phases: Phase[] = [];
  const phaseRegex = /^##\s*Phase\s*(\d+)\s*:\s*(.*?)\s*\[\s*(x|~| |\/)\s*\]/i;

  let currentPhaseLines: string[] = [];
  let currentPhaseMeta: { id: number; name: string; status: Phase["status"] } | null = null;

  for (const line of lines) {
    const match = line.match(phaseRegex);
    if (match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
      if (currentPhaseMeta !== null) {
        phases.push({ ...currentPhaseMeta, tasks: parseTasks(currentPhaseLines), additionalChecks: parseAdditionalChecks(currentPhaseLines) });
      }

      currentPhaseLines = [];
      const statusChar = match[3].toLowerCase();
      const status = statusChar === "x" ? "completed" : statusChar === "~" || statusChar === "/" ? "in_progress" : "not_started";
      currentPhaseMeta = {
        id: parseInt(match[1], 10),
        name: match[2].trim(),
        status
      };
      continue;
    }

    if (currentPhaseMeta !== null) {
      currentPhaseLines.push(line);
    }
  }

  if (currentPhaseMeta !== null) {
    phases.push({ ...currentPhaseMeta, tasks: parseTasks(currentPhaseLines), additionalChecks: parseAdditionalChecks(currentPhaseLines) });
  }

  return phases;
}
