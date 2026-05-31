import * as fs from "fs";
import * as path from "path";
import { archiveRootPath } from "./paths";

export interface FlowArchiveState {
  status: "in_progress" | "completed";
  changeName: string;
  archivePath: string;
  startedAt: string;
  completedAt?: string;
}

export const FLOW_ARCHIVE_STATE_FILE = ".flow-archive.json";

export function archiveStatePath(archivePath: string): string {
  return path.join(archivePath, FLOW_ARCHIVE_STATE_FILE);
}

export function readArchiveState(archivePath: string): FlowArchiveState | null {
  const statePath = archiveStatePath(archivePath);
  if (!fs.existsSync(statePath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Partial<FlowArchiveState>;
  if (
    (parsed.status === "in_progress" || parsed.status === "completed") &&
    typeof parsed.changeName === "string" &&
    typeof parsed.archivePath === "string" &&
    typeof parsed.startedAt === "string"
  ) {
    return {
      status: parsed.status,
      changeName: parsed.changeName,
      archivePath: parsed.archivePath,
      startedAt: parsed.startedAt,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined
    };
  }

  return null;
}

export function writeArchiveState(state: FlowArchiveState): void {
  fs.writeFileSync(archiveStatePath(state.archivePath), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export function createArchiveState(changeName: string, archivePath: string, now: Date): FlowArchiveState {
  const state = {
    status: "in_progress" as const,
    changeName,
    archivePath,
    startedAt: now.toISOString()
  };

  writeArchiveState(state);
  return state;
}

export function findPendingArchiveState(projectPath: string): FlowArchiveState | null {
  const archiveRoot = archiveRootPath(projectPath);
  if (!fs.existsSync(archiveRoot)) {
    return null;
  }

  const directories = fs.readdirSync(archiveRoot)
    .map(item => path.join(archiveRoot, item))
    .filter(itemPath => fs.statSync(itemPath).isDirectory())
    .sort();

  for (const directory of directories) {
    const state = readArchiveState(directory);
    if (state?.status === "in_progress") {
      return state;
    }
  }

  return null;
}
