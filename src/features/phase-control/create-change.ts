import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { listActiveChangeDirs } from "../../entities/change/active-change";
import { findInvalidArchiveState, findPendingArchiveState } from "../../entities/change/archive-state";
import { gitHeadSha } from "../../shared/shell/git";
import { recordCommitLogStart } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { renderTemplate } from "../../shared/templates/render-template";
import { todayIsoDate } from "../../shared/time/today-iso-date";

/**
 * Convert a name string to a filesystem-safe slug.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export interface CreateChangeResult {
  ok: boolean;
  message: string;
  changeDir?: string;
}

/**
 * Create a new change directory with initial state.json.
 *
 * Performs the following:
 * 1. Slugifies the name.
 * 2. Checks no active change exists.
 * 3. Checks target directory does not exist.
 * 4. Creates directory + architecture subdirectory.
 * 5. Writes state.json with activePhase: change_intake, activeIteration: null.
 */
export function createChange(projectPath: string, name: string, taskText?: string, quick = false): CreateChangeResult {
  if (!name || name.trim().length === 0) {
    return { ok: false, message: "Change name is required." };
  }

  const slug = slugify(name);
  if (!slug) {
    return { ok: false, message: `Invalid change name: "${name}". Use alphanumeric characters.` };
  }

  try {
    if (listActiveChangeDirs(projectPath).includes(slug)) {
      return { ok: false, message: `Change "${slug}" already exists at ${path.join(projectPath, SYSTEM_DIR, "changes", slug)}.` };
    }

    // A pending archive still owns this change name (state.json lives in the
    // archived directory). Reusing the name would make --change ambiguous.
    const pendingSameName = findPendingArchiveState(projectPath, slug);
    if (pendingSameName) {
      return { ok: false, message: `Archive of "${slug}" is still in progress at ${pendingSameName.archivePath}. Complete the archive phase (set .phase-archive.json status=completed) before reusing this name.` };
    }

    const invalidSameName = findInvalidArchiveState(projectPath, slug);
    if (invalidSameName) {
      return { ok: false, message: `Archive state is invalid: ${invalidSameName.reason} (${invalidSameName.statePath}). Fix it before reusing this name.` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Error checking active changes: ${msg}` };
  }

  const changeDir = path.join(projectPath, SYSTEM_DIR, "changes", slug);

  if (fs.existsSync(changeDir)) {
    return { ok: false, message: `Change "${slug}" already exists at ${changeDir}.` };
  }

  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  // Write initial state.json directly (saveFlowState cannot be used yet
  // because locateFlowStatePath returns null before state.json exists).
  const statePath = path.join(changeDir, "state.json");
  const initialState = quick
    ? { activePhase: "quick_plan" as const, activeIteration: null, repairCycleCount: 0, flowMode: "quick" as const }
    : { activePhase: "change_intake" as const, activeIteration: null, repairCycleCount: 0 };
  writeFileAtomic(statePath, JSON.stringify(initialState, null, 2) + "\n");

  if (quick) {
    writeFileAtomic(path.join(changeDir, "worklog.md"), renderTemplate("artifacts/worklog", { date: todayIsoDate() }));
  }

  const head = gitHeadSha(projectPath);
  if (head) {
    recordCommitLogStart(buildChangePaths(changeDir).statePath, head);
  }

  if (taskText) {
    const taskPath = path.join(changeDir, "intake_task.md");
    writeFileAtomic(taskPath, taskText + "\n");
  }

  return {
    ok: true,
    message: `Created change ${slug} at ${changeDir}. Initial phase: ${quick ? "quick_plan (quick mode)" : "change_intake"}.`,
    changeDir
  };
}
