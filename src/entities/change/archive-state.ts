import * as fs from "fs";
import * as path from "path";
import { archiveRootPath } from "./paths";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface ArchiveState {
  status: "in_progress" | "completed";
  changeName: string;
  archivePath: string;
  startedAt: string;
  movedAt?: string;
  completedAt?: string;
}

export interface InvalidArchiveState {
  archivePath: string;
  statePath: string;
  reason: string;
}

export const FLOW_ARCHIVE_STATE_FILE = ".phase-archive.json";

export function archiveStatePath(archivePath: string): string {
  return path.join(archivePath, FLOW_ARCHIVE_STATE_FILE);
}

interface ArchiveStateParseResult {
  state: ArchiveState | null;
  invalid: InvalidArchiveState | null;
}

export interface ArchiveStateValidation {
  state: ArchiveState | null;
  issues: string[];
}

export interface ArchiveStateValidationOptions {
  /** Require status "completed" plus a non-empty completedAt (archive-completion check). */
  requireCompleted: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function checkArchiveStateFields(
  parsed: Record<string, unknown>,
  options: ArchiveStateValidationOptions
): ArchiveStateValidation {
  const issues: string[] = [];

  const statusIsKnown = parsed.status === "in_progress" || parsed.status === "completed";
  if (!statusIsKnown) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} status must be "in_progress" or "completed".`);
  } else if (options.requireCompleted && parsed.status !== "completed") {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} status must be "completed".`);
  }

  if (!isNonEmptyString(parsed.changeName)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must include changeName as a non-empty string.`);
  }

  if (!isNonEmptyString(parsed.archivePath)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must include archivePath as a non-empty string.`);
  }

  if (!isNonEmptyString(parsed.startedAt)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must include startedAt as a non-empty string.`);
  }

  if (options.requireCompleted && !isNonEmptyString(parsed.completedAt)) {
    issues.push(`${FLOW_ARCHIVE_STATE_FILE} must include completedAt as a non-empty string.`);
  }

  if (issues.length > 0) {
    return { state: null, issues };
  }

  return {
    state: {
      status: parsed.status as "in_progress" | "completed",
      changeName: parsed.changeName as string,
      archivePath: parsed.archivePath as string,
      startedAt: parsed.startedAt as string,
      movedAt: typeof parsed.movedAt === "string" ? parsed.movedAt : undefined,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined
    },
    issues: []
  };
}

/**
 * Single source of truth for `.phase-archive.json` shape validation. Reads
 * and parses the file, then applies the field checks every consumer needs;
 * `requireCompleted` layers on the extra rules the archive-completion check
 * (check-archive) needs on top of the base shape used while an archive is
 * still in progress.
 */
export function validateArchiveStateFile(
  archivePath: string,
  options: ArchiveStateValidationOptions = { requireCompleted: false }
): ArchiveStateValidation {
  const statePath = archiveStatePath(archivePath);
  if (!fs.existsSync(statePath)) {
    return { state: null, issues: [`${FLOW_ARCHIVE_STATE_FILE} is missing.`] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    return { state: null, issues: [`${FLOW_ARCHIVE_STATE_FILE} is not valid JSON: ${message}`] };
  }

  if (!isRecord(parsed)) {
    return { state: null, issues: [`${FLOW_ARCHIVE_STATE_FILE} must be a JSON object.`] };
  }

  return checkArchiveStateFields(parsed, options);
}

function parseArchiveState(archivePath: string): ArchiveStateParseResult {
  const statePath = archiveStatePath(archivePath);
  if (!fs.existsSync(statePath)) {
    return { state: null, invalid: null };
  }

  const result = validateArchiveStateFile(archivePath, { requireCompleted: false });
  if (result.state) {
    return { state: result.state, invalid: null };
  }

  return {
    state: null,
    invalid: { archivePath, statePath, reason: result.issues.join(" ") }
  };
}

export function readArchiveState(archivePath: string): ArchiveState | null {
  return parseArchiveState(archivePath).state;
}

export function writeArchiveState(state: ArchiveState): void {
  writeFileAtomic(archiveStatePath(state.archivePath), `${JSON.stringify(state, null, 2)}\n`);
}

export function createArchiveState(changeName: string, archivePath: string, now: Date, writePath: string = archivePath): ArchiveState {
  const state = {
    status: "in_progress" as const,
    changeName,
    archivePath,
    startedAt: now.toISOString()
  };

  writeFileAtomic(archiveStatePath(writePath), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

export function markArchiveMoved(archivePath: string, movedAt: string): void {
  const state = readArchiveState(archivePath);
  if (!state) {
    throw new Error(`Cannot mark archive as moved: no valid archive state at ${archivePath}.`);
  }
  // Persist the directory the archive actually landed in: on a crash-retry
  // across a date boundary the pre-move marker still carries the old
  // date-prefixed target path.
  writeArchiveState({ ...state, archivePath, movedAt });
}

export function archiveDirectories(projectPath: string): string[] {
  const archiveRoot = archiveRootPath(projectPath);
  if (!fs.existsSync(archiveRoot)) {
    return [];
  }

  return fs.readdirSync(archiveRoot)
    .map(item => path.join(archiveRoot, item))
    .filter(itemPath => fs.statSync(itemPath, { throwIfNoEntry: false })?.isDirectory() ?? false)
    .sort();
}

export function findInvalidArchiveState(projectPath: string): InvalidArchiveState | null {
  for (const directory of archiveDirectories(projectPath)) {
    const invalid = parseArchiveState(directory).invalid;
    if (invalid) {
      return invalid;
    }
  }

  return null;
}

export function findPendingArchiveState(projectPath: string): ArchiveState | null {
  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state?.status === "in_progress") {
      // Trust the directory the state file was actually found in, not the
      // stored archivePath: the stored value is an absolute path that goes
      // stale when the project is moved/cloned or when a crash-retry landed
      // in a different date-prefixed directory.
      return { ...state, archivePath: directory };
    }
  }

  return null;
}

export function findCompletedArchiveState(projectPath: string): string | null {
  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state?.status === "completed") {
      return directory;
    }
  }
  return null;
}
