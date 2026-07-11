import * as fs from "fs";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface CommitLog {
  start: string | null;
  iterations: Record<string, string>;
}

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function isValidLog(value: unknown): value is CommitLog {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const { start, iterations } = record;
  if (start !== null && !(typeof start === "string" && SHA_PATTERN.test(start))) return false;
  if (typeof iterations !== "object" || iterations === null || Array.isArray(iterations)) return false;
  for (const sha of Object.values(iterations as Record<string, unknown>)) {
    if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) return false;
  }
  return true;
}

export function readCommitLog(commitLogPath: string): CommitLog | null {
  if (!fs.existsSync(commitLogPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(commitLogPath, "utf-8"));
  } catch {
    return null;
  }
  return isValidLog(parsed) ? { start: parsed.start, iterations: { ...parsed.iterations } } : null;
}

export function writeCommitLog(commitLogPath: string, log: CommitLog): void {
  writeFileAtomic(commitLogPath, `${JSON.stringify(log, null, 2)}\n`);
}

export function recordCommitLogStart(commitLogPath: string, sha: string): void {
  const log = readCommitLog(commitLogPath) ?? { start: null, iterations: {} };
  if (log.start !== null) return;
  writeCommitLog(commitLogPath, { start: sha, iterations: log.iterations });
}

export function recordIterationBoundary(commitLogPath: string, iterationId: number, sha: string): void {
  const log = readCommitLog(commitLogPath) ?? { start: null, iterations: {} };
  writeCommitLog(commitLogPath, {
    start: log.start,
    iterations: { ...log.iterations, [String(iterationId)]: sha }
  });
}

export function iterationDiffBase(log: CommitLog, iterationId: number): string | null {
  if (iterationId <= 1) return log.start;
  return log.iterations[String(iterationId - 1)] ?? log.start;
}
