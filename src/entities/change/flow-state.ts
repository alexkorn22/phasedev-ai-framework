import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "./paths";
import { findActiveChangeDir } from "./active-change";
import { findPendingArchiveState } from "./archive-state";

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
}

export const FLOW_STATE_FILE = "state.json";

/**
 * Locate state.json path.
 * Priority:
 * 1. Active change directory (findActiveChangeDir).
 * 2. Archive with pending (in_progress) archive state.
 * Returns null if neither exists.
 */
export function locateFlowStatePath(projectPath: string): string | null {
  const active = findActiveChangeDir(projectPath);
  if (active) return path.join(active, FLOW_STATE_FILE);

  const pending = findPendingArchiveState(projectPath);
  if (pending) return path.join(pending.archivePath, FLOW_STATE_FILE);

  return null;
}

export function loadFlowState(projectPath: string): FlowState | null {
  const p = locateFlowStatePath(projectPath);
  if (!p || !fs.existsSync(p)) return null;

  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  if (typeof raw !== "object" || raw === null) return null;

  const activePhase = raw.activePhase;
  if (!isActivePhase(activePhase)) return null;

  const activeIteration = raw.activeIteration ?? null;
  if (activeIteration !== null && (typeof activeIteration !== "number" || !Number.isInteger(activeIteration) || activeIteration <= 0)) {
    return null;
  }

  return { activePhase, activeIteration };
}

export function saveFlowState(projectPath: string, state: FlowState): void {
  const p = locateFlowStatePath(projectPath);
  if (!p) throw new Error("No active change: cannot save flow state. Run create-change first.");
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Locate the change directory that corresponds to the current flow state.
 * For archive phase, the change is in the archive directory.
 * For other phases, it's the active change directory.
 */
export function locateChangeDir(projectPath: string, state: FlowState): string | null {
  if (state.activePhase === "archive") {
    const pending = findPendingArchiveState(projectPath);
    if (pending) return pending.archivePath;
    return null;
  }

  return findActiveChangeDir(projectPath);
}
