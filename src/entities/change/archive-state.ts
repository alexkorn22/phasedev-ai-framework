import * as fs from "fs";
import * as path from "path";
import { archiveRootPath } from "./paths";

export interface ArchiveState {
  status: "in_progress" | "completed";
  changeName: string;
  archivePath: string;
  startedAt: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArchiveState(archivePath: string): ArchiveStateParseResult {
  const statePath = archiveStatePath(archivePath);
  if (!fs.existsSync(statePath)) {
    return { state: null, invalid: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    return {
      state: null,
      invalid: {
        archivePath,
        statePath,
        reason: `.phase-archive.json is not valid JSON: ${message}`
      }
    };
  }

  if (
    isRecord(parsed) &&
    (parsed.status === "in_progress" || parsed.status === "completed") &&
    typeof parsed.changeName === "string" &&
    typeof parsed.archivePath === "string" &&
    typeof parsed.startedAt === "string"
  ) {
    return {
      state: {
        status: parsed.status,
        changeName: parsed.changeName,
        archivePath: parsed.archivePath,
        startedAt: parsed.startedAt,
        completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined
      },
      invalid: null
    };
  }

  return {
    state: null,
    invalid: {
      archivePath,
      statePath,
      reason: ".phase-archive.json must include status, changeName, archivePath, and startedAt with a valid status."
    }
  };
}

export function readArchiveState(archivePath: string): ArchiveState | null {
  return parseArchiveState(archivePath).state;
}

export function writeArchiveState(state: ArchiveState): void {
  fs.writeFileSync(archiveStatePath(state.archivePath), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export function createArchiveState(changeName: string, archivePath: string, now: Date): ArchiveState {
  const state = {
    status: "in_progress" as const,
    changeName,
    archivePath,
    startedAt: now.toISOString()
  };

  writeArchiveState(state);
  return state;
}

function archiveDirectories(projectPath: string): string[] {
  const archiveRoot = archiveRootPath(projectPath);
  if (!fs.existsSync(archiveRoot)) {
    return [];
  }

  return fs.readdirSync(archiveRoot)
    .map(item => path.join(archiveRoot, item))
    .filter(itemPath => fs.statSync(itemPath).isDirectory())
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
      return state;
    }
  }

  return null;
}
