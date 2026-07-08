import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { listActiveChangeDirs } from "../../entities/change/active-change";
import { archiveDirectories, readArchiveState } from "../../entities/change/archive-state";

export interface ChangeEntry {
  name: string;
  type: "active" | "pending_archive" | "archived";
  phase?: string;
  activeIteration?: number | null;
  taskSummary?: string;
  error?: string;
  archiveDate?: string;
  archiveStatus?: string;
}

function readChangeState(changeDir: string): { phase?: string; activeIteration?: number | null; error?: string } {
  const statePath = path.join(changeDir, "state.json");
  if (!fs.existsSync(statePath)) return { error: "state.json is missing" };
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (typeof raw !== "object" || raw === null || typeof raw.activePhase !== "string") {
      return { error: "state.json has no activePhase" };
    }
    return { phase: raw.activePhase, activeIteration: raw.activeIteration ?? null };
  } catch {
    return { error: "state.json is not valid JSON" };
  }
}

function readTaskSummary(changeDir: string): string {
  for (const file of ["intake_task.md", "prd.md"]) {
    const filePath = path.join(changeDir, file);
    if (!fs.existsSync(filePath)) continue;
    const firstLine = fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .map(line => line.trim())
      .find(line => line.length > 0 && line !== "---");
    if (firstLine) return firstLine.replace(/^#+\s*/, "");
  }
  return "";
}

function archiveDateOf(directory: string): string {
  const match = path.basename(directory).match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : "";
}

export function listChanges(projectPath: string, includeArchived = false): ChangeEntry[] {
  const entries: ChangeEntry[] = [];

  for (const name of listActiveChangeDirs(projectPath).sort()) {
    const changeDir = path.join(projectPath, SYSTEM_DIR, "changes", name);
    const state = readChangeState(changeDir);
    entries.push({ name, type: "active", taskSummary: readTaskSummary(changeDir), ...state });
  }

  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state === null) {
      // Unreadable .phase-archive.json: still unfinished work — surface it.
      entries.push({
        name: path.basename(directory),
        type: "pending_archive",
        archiveDate: archiveDateOf(directory),
        error: ".phase-archive.json is missing or malformed"
      });
      continue;
    }
    if (state.status === "in_progress") {
      entries.push({
        name: state.changeName,
        type: "pending_archive",
        phase: "archive",
        taskSummary: readTaskSummary(directory),
        archiveDate: archiveDateOf(directory)
      });
    } else if (includeArchived) {
      entries.push({
        name: path.basename(directory),
        type: "archived",
        archiveDate: archiveDateOf(directory),
        archiveStatus: state.status
      });
    }
  }

  return entries;
}

export function renderChanges(entries: ChangeEntry[]): string {
  if (entries.length === 0) {
    return "No changes. Run: phasedev create-change <name>.";
  }

  const lines: string[] = ["=== PhaseDev Changes ===", ""];
  const unfinished = entries.filter(e => e.type !== "archived");
  const archived = entries.filter(e => e.type === "archived");

  if (unfinished.length > 0) {
    lines.push("--- Changes ---");
    for (const entry of unfinished) {
      const marker = entry.type === "pending_archive" ? " [archive in progress]" : "";
      lines.push(`  ${entry.name}${marker}`);
      if (entry.error) {
        lines.push(`    ERROR: ${entry.error}`);
        continue;
      }
      if (entry.phase) {
        const iter = entry.activeIteration != null ? ` (iteration ${entry.activeIteration})` : "";
        lines.push(`    Phase: ${entry.phase}${iter}`);
      }
      if (entry.taskSummary) {
        lines.push(`    Task: ${entry.taskSummary}`);
      }
    }
    lines.push("");
  }

  if (archived.length > 0) {
    lines.push("--- Archived Changes ---");
    for (const entry of archived) {
      const dateStr = entry.archiveDate ? ` [${entry.archiveDate}]` : "";
      lines.push(`  ${entry.name}${dateStr} (status: ${entry.archiveStatus})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
