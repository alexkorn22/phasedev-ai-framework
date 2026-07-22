import * as fs from "fs";
import * as path from "path";

const DEFAULT_STALE_MS = 60_000;
const DEFAULT_WAIT_MS = 15_000;
const INITIAL_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 1_000;

export class LockHeldError extends Error {
  constructor(public readonly lockPath: string, public readonly pid: number) {
    super(`Lock ${lockPath} is held by pid ${pid}.`);
    this.name = "LockHeldError";
  }
}

export interface FileLock {
  readonly path: string;
  release(): void;
}

function readLockPid(lockPath: string): number {
  try {
    const raw = fs.readFileSync(lockPath, "utf-8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // EPERM: the process exists but is owned by another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isStale(lockPath: string, staleMs: number): boolean {
  const pid = readLockPid(lockPath);
  if (!isProcessAlive(pid)) return true;
  try {
    const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
    return ageMs > staleMs;
  } catch {
    // Lock file vanished between the EEXIST failure and this stat: treat as reclaimable.
    return true;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tryAcquire(lockPath: string, staleMs: number): FileLock | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return {
        path: lockPath,
        release: () => {
          if (readLockPid(lockPath) === process.pid) {
            fs.rmSync(lockPath, { force: true });
          }
        }
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      if (!isStale(lockPath, staleMs)) {
        return null;
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  return null;
}

/**
 * Acquire an exclusive advisory lock file. Uses O_EXCL (open flag "wx") so
 * creation fails atomically when the file already exists. A pre-existing lock
 * is reclaimed when its owner process is gone (PID-liveness check) or when
 * its file age exceeds staleMs. A busy lock is retried with backoff for up to
 * waitMs (each retry re-checks staleness, so a holder dying mid-wait is
 * reclaimed); only after the budget is spent is a LockHeldError naming the
 * path and holder pid thrown. waitMs = 0 fails fast on the first busy check.
 */
export function acquireLock(
  lockPath: string,
  staleMs: number = DEFAULT_STALE_MS,
  waitMs: number = DEFAULT_WAIT_MS
): FileLock {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  const deadline = Date.now() + waitMs;
  let retryDelayMs = INITIAL_RETRY_DELAY_MS;
  for (;;) {
    const lock = tryAcquire(lockPath, staleMs);
    if (lock) return lock;
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new LockHeldError(lockPath, readLockPid(lockPath));
    }
    sleepSync(Math.min(retryDelayMs, remainingMs));
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  }
}
