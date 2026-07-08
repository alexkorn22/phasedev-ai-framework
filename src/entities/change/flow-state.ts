import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "./active-change";
import { findInvalidArchiveState, findPendingArchiveState, readArchiveState } from "./archive-state";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export type ActivePhase =
  | "change_intake"
  | "code_research"
  | "technical_design"
  | "iteration_planning"
  | "implementation"
  | "iteration_validation"
  | "final_validation"
  | "finding_repair"
  | "archive";

export const ACTIVE_PHASES = new Set<ActivePhase>([
  "change_intake",
  "code_research",
  "technical_design",
  "iteration_planning",
  "implementation",
  "iteration_validation",
  "final_validation",
  "finding_repair",
  "archive"
]);

export function isActivePhase(value: string): value is ActivePhase {
  return ACTIVE_PHASES.has(value as ActivePhase);
}

export interface FlowState {
  activePhase: ActivePhase;
  activeIteration: number | null;
  repairCycleCount: number;
}

export const FLOW_STATE_FILE = "state.json";

/**
 * Locate state.json path.
 * Priority:
 * 1. Active change directory (resolveChangeDir).
 * 2. Archive with pending (in_progress) archive state.
 * Returns null if neither exists.
 */
export function locateFlowStatePath(projectPath: string): string | null {
  const active = resolveChangeDir(projectPath);
  if (active) return path.join(active, FLOW_STATE_FILE);

  const pending = findPendingArchiveState(projectPath);
  if (pending) return path.join(pending.archivePath, FLOW_STATE_FILE);

  // A broken .phase-archive.json makes findPendingArchiveState skip its directory
  // silently. Fall back to that directory's state.json (if any) so advanceFlow can
  // still load state and report the invalid archive state instead of "no active change".
  const invalid = findInvalidArchiveState(projectPath);
  if (invalid) {
    const fallbackStatePath = path.join(path.dirname(invalid.statePath), FLOW_STATE_FILE);
    if (fs.existsSync(fallbackStatePath)) {
      return fallbackStatePath;
    }
  }

  return null;
}

/**
 * Load the flow state. Returns null only when no state.json exists.
 * A state.json that exists but cannot be parsed or has an invalid shape
 * throws: silently treating the phase lock as "no active change" would let
 * the next saveFlowState overwrite the corrupt file and destroy evidence.
 */
export function loadFlowState(projectPath: string): FlowState | null {
  const p = locateFlowStatePath(projectPath);
  if (!p || !fs.existsSync(p)) return null;

  const invalid = (reason: string): never => {
    throw new Error(`Invalid flow state at ${p}: ${reason} Fix or remove state.json, then rerun.`);
  };

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (error: unknown) {
    return invalid(`not valid JSON (${error instanceof Error ? error.message : "parse error"}).`);
  }

  if (typeof raw !== "object" || raw === null) return invalid("must be a JSON object.");
  const record = raw as Record<string, unknown>;

  const activePhase = record.activePhase;
  if (typeof activePhase !== "string" || !isActivePhase(activePhase)) {
    return invalid(`unknown activePhase ${JSON.stringify(activePhase)}.`);
  }

  const activeIteration = record.activeIteration ?? null;
  if (activeIteration !== null && (typeof activeIteration !== "number" || !Number.isInteger(activeIteration) || activeIteration <= 0)) {
    return invalid(`activeIteration must be null or a positive integer, got ${JSON.stringify(activeIteration)}.`);
  }

  const repairCycleCount = typeof record.repairCycleCount === "number" && Number.isInteger(record.repairCycleCount) && record.repairCycleCount >= 0
    ? record.repairCycleCount
    : 0;

  return { activePhase, activeIteration, repairCycleCount };
}

export function writeFlowState(statePath: string, state: FlowState): void {
  writeFileAtomic(statePath, JSON.stringify(state, null, 2) + "\n");
}

export function saveFlowState(projectPath: string, state: FlowState): void {
  const p = locateFlowStatePath(projectPath);
  if (!p) throw new Error("No active change: cannot save flow state. Run create-change first.");
  writeFlowState(p, state);
}

/**
 * Locate the change directory that corresponds to the current flow state.
 * For archive phase, the change is in the archive directory.
 * For other phases, it's the active change directory.
 *
 * This is a read-only lookup; it does not diagnose *why* an archive change is
 * missing. Callers (e.g. advanceFlow) are responsible for consulting
 * findInvalidArchiveState when this returns null for an archive phase, so that
 * diagnostic path stays in one place instead of drifting across call sites.
 */
export function locateChangeDir(projectPath: string, state: FlowState): string | null {
  if (state.activePhase === "archive") {
    const pending = findPendingArchiveState(projectPath);
    if (pending) return pending.archivePath;

    // Pre-move crash recovery: the archive state marker was written into the
    // active change dir but the directory was never moved. Return the active
    // dir so startArchiveStage can complete the move idempotently.
    const activeDir = resolveChangeDir(projectPath);
    if (activeDir) {
      const preMoveState = readArchiveState(activeDir);
      if (preMoveState && preMoveState.status === "in_progress" && !preMoveState.movedAt) {
        return activeDir;
      }
    }

    return null;
  }

  return resolveChangeDir(projectPath);
}
