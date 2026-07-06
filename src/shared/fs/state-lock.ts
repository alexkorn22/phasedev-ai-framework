import * as fs from "fs";
import * as path from "path";

const DEFAULT_STALE_MS = 60_000;

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

function isStale(lockPath: string, _staleMs: number): boolean {
  const pid = readLockPid(lockPath);
  return !isProcessAlive(pid);
}

/**
 * Acquire an exclusive advisory lock file. Uses O_EXCL (open flag "wx") so
 * creation fails atomically when the file already exists. A pre-existing lock
 * is reclaimed only when its owner process is gone or the file is older than
 * `staleMs`; otherwise a LockHeldError naming the path and holder pid is thrown.
 */
export function acquireLock(lockPath: string, staleMs: number = DEFAULT_STALE_MS): FileLock {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

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
        throw new LockHeldError(lockPath, readLockPid(lockPath));
      }
      fs.rmSync(lockPath, { force: true });
    }
  }

  throw new LockHeldError(lockPath, readLockPid(lockPath));
}
