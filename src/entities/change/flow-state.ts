import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "./active-change";
import { findInvalidArchiveState, findPendingArchiveState, readArchiveState } from "./archive-state";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import type { FindingsBaselineRow } from "../validation-findings/findings-baseline";
import { parseValidationFindingsArtifact } from "../validation-findings/parse-validation-findings";

export type ActivePhase =
  | "change_intake"
  | "code_research"
  | "technical_design"
  | "iteration_planning"
  | "implementation"
  | "iteration_validation"
  | "final_validation"
  | "finding_repair"
  | "quick_plan"
  | "quick_implementation"
  | "quick_validation"
  | "quick_spec_revision"
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
  "quick_plan",
  "quick_implementation",
  "quick_validation",
  "quick_spec_revision",
  "archive"
]);

export function isActivePhase(value: string): value is ActivePhase {
  return ACTIVE_PHASES.has(value as ActivePhase);
}

export type FlowMode = "quick" | "standard";

export interface FlowState {
  activePhase: ActivePhase;
  activeIteration: number | null;
  repairCycleCount: number;
  flowMode?: FlowMode;
}

export const FLOW_STATE_FILE = "state.json";

export interface CommitLog {
  start: string | null;
  iterations: Record<string, string>;
}

export interface FindingsBaseline {
  rows: FindingsBaselineRow[];
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const LEGACY_STATE_FILES = [".commit-log.json", ".findings-baseline.json"] as const;
const warnedLegacyPaths = new Set<string>();

function readStateObject(statePath: string): Record<string, unknown> {
  if (!fs.existsSync(statePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function writeStateObject(statePath: string, obj: Record<string, unknown>): void {
  writeFileAtomic(statePath, JSON.stringify(obj, null, 2) + "\n");
}

function isValidCommitLog(value: unknown): value is CommitLog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.start !== null && !(typeof record.start === "string" && SHA_PATTERN.test(record.start))) return false;
  if (typeof record.iterations !== "object" || record.iterations === null || Array.isArray(record.iterations)) return false;
  for (const sha of Object.values(record.iterations as Record<string, unknown>)) {
    if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) return false;
  }
  return true;
}

/** Reads the commitLog section. A present-but-malformed section reads as absent. */
export function readCommitLog(statePath: string): CommitLog | null {
  const raw = readStateObject(statePath).commitLog;
  return isValidCommitLog(raw) ? { start: raw.start, iterations: { ...raw.iterations } } : null;
}

function currentCommitLog(obj: Record<string, unknown>): CommitLog {
  return isValidCommitLog(obj.commitLog) ? obj.commitLog : { start: null, iterations: {} };
}

/** Sets commitLog.start once; later calls are no-ops so re-entering the phase doesn't move the diff base. */
export function recordCommitLogStart(statePath: string, sha: string): void {
  const obj = readStateObject(statePath);
  const existing = currentCommitLog(obj);
  if (existing.start !== null) return;
  obj.commitLog = { start: sha, iterations: existing.iterations };
  writeStateObject(statePath, obj);
}

/** Records (or overwrites, on repair cycles) the commit SHA marking an iteration boundary. */
export function recordIterationBoundary(statePath: string, iterationId: number, sha: string): void {
  const obj = readStateObject(statePath);
  const existing = currentCommitLog(obj);
  obj.commitLog = { start: existing.start, iterations: { ...existing.iterations, [String(iterationId)]: sha } };
  writeStateObject(statePath, obj);
}

/** The SHA an iteration's diff should be taken against: the previous iteration's boundary, or the flow start. */
export function iterationDiffBase(log: CommitLog, iterationId: number): string | null {
  if (iterationId <= 1) return log.start;
  return log.iterations[String(iterationId - 1)] ?? log.start;
}

/** Reads the findingsBaseline section. A present-but-malformed section reads as absent. */
export function readFindingsBaseline(statePath: string): FindingsBaseline | null {
  const raw = readStateObject(statePath).findingsBaseline;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const rows = (raw as { rows?: unknown }).rows;
  return Array.isArray(rows) ? { rows: rows as FindingsBaselineRow[] } : null;
}

/** Snapshots validation_findings.md's current rows as the findingsBaseline section (empty rows if the file is absent). */
export function writeFindingsBaseline(statePath: string, findingsPath: string): void {
  const rows: FindingsBaselineRow[] = fs.existsSync(findingsPath)
    ? parseValidationFindingsArtifact(findingsPath).rows.map(row => ({
        id: row.id,
        status: row.status,
        severity: row.severity,
        className: row.className,
        iteration: row.phase,
        finding: row.finding,
        requiredFix: row.requiredFix
      }))
    : [];
  const obj = readStateObject(statePath);
  obj.findingsBaseline = { rows };
  writeStateObject(statePath, obj);
}

/** Removes the findingsBaseline section, if present. */
export function clearFindingsBaseline(statePath: string): void {
  const obj = readStateObject(statePath);
  if (!("findingsBaseline" in obj)) return;
  delete obj.findingsBaseline;
  writeStateObject(statePath, obj);
}

function warnOnLegacyStateFiles(statePath: string): void {
  const dir = path.dirname(statePath);
  for (const legacy of LEGACY_STATE_FILES) {
    const p = path.join(dir, legacy);
    if (fs.existsSync(p) && !warnedLegacyPaths.has(p)) {
      warnedLegacyPaths.add(p);
      console.warn(`[state] Legacy ${legacy} in ${dir} is ignored — commit-log/findings-baseline now live in state.json. Delete it or recreate the change.`);
    }
  }
}

/**
 * Locate state.json path.
 * Priority:
 * 1. Active change directory (resolveChangeDir).
 * 2. Archive with pending (in_progress) archive state.
 * Returns null if neither exists.
 */
export function locateFlowStatePath(projectPath: string, changeName?: string): string | null {
  const active = resolveChangeDir(projectPath, changeName);
  if (active) return path.join(active, FLOW_STATE_FILE);

  const pending = findPendingArchiveState(projectPath, changeName);
  if (pending) return path.join(pending.archivePath, FLOW_STATE_FILE);

  // A broken .phase-archive.json makes findPendingArchiveState skip its directory
  // silently. Fall back to that directory's state.json (if any) so advanceFlow can
  // still load state and report the invalid archive state instead of "no active change".
  const invalid = findInvalidArchiveState(projectPath, changeName);
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
export function loadFlowState(projectPath: string, changeName?: string): FlowState | null {
  const p = locateFlowStatePath(projectPath, changeName);
  if (!p || !fs.existsSync(p)) return null;
  warnOnLegacyStateFiles(p);

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

  const flowModeRaw = record.flowMode;
  if (flowModeRaw !== undefined && flowModeRaw !== "quick" && flowModeRaw !== "standard") {
    return invalid(`flowMode must be "quick" or "standard" when present, got ${JSON.stringify(flowModeRaw)}.`);
  }
  const flowMode = flowModeRaw as FlowMode | undefined;

  return { activePhase, activeIteration, repairCycleCount, ...(flowMode ? { flowMode } : {}) };
}

/**
 * Writes the phase-lock fields, preserving any commitLog/findingsBaseline
 * section already on disk — those are mutated only through their own
 * accessors, never clobbered by a phase-lock write.
 */
export function writeFlowState(statePath: string, state: FlowState): void {
  const obj = readStateObject(statePath);
  obj.activePhase = state.activePhase;
  obj.activeIteration = state.activeIteration;
  obj.repairCycleCount = state.repairCycleCount;
  if (state.flowMode) obj.flowMode = state.flowMode; else delete obj.flowMode;
  writeStateObject(statePath, obj);
}

export function saveFlowState(projectPath: string, state: FlowState, changeName?: string): void {
  const p = locateFlowStatePath(projectPath, changeName);
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
export function locateChangeDir(projectPath: string, state: FlowState, changeName?: string): string | null {
  if (state.activePhase === "archive") {
    const pending = findPendingArchiveState(projectPath, changeName);
    if (pending) return pending.archivePath;

    // Pre-move crash recovery: the archive state marker was written into the
    // active change dir but the directory was never moved. Return the active
    // dir so startArchiveStage can complete the move idempotently.
    const activeDir = resolveChangeDir(projectPath, changeName);
    if (activeDir) {
      const preMoveState = readArchiveState(activeDir);
      if (preMoveState && preMoveState.status === "in_progress" && !preMoveState.movedAt) {
        return activeDir;
      }
    }

    return null;
  }

  return resolveChangeDir(projectPath, changeName);
}
