import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { acquireLock, LockHeldError } from "../src/shared/fs/state-lock";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;
let lockPath: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("state-lock");
  lockPath = path.join(testTmpDir, ".phasedev", "state.lock");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

describe("acquireLock", () => {
  test("writes the holder pid and creates the lock file", () => {
    const lock = acquireLock(lockPath);

    expect(fs.existsSync(lockPath)).toBe(true);
    expect(fs.readFileSync(lockPath, "utf-8").trim()).toBe(String(process.pid));

    lock.release();
  });

  test("acquiring twice fails while the live holder is running", () => {
    const lock = acquireLock(lockPath);

    expect(() => acquireLock(lockPath)).toThrow(LockHeldError);

    lock.release();
  });

  test("reclaims a stale lock whose holder pid is dead", () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, "2147483646", "utf-8");

    const lock = acquireLock(lockPath);

    expect(fs.readFileSync(lockPath, "utf-8").trim()).toBe(String(process.pid));

    lock.release();
  });

  test("does not reclaim a stale-by-mtime lock when the holder process is alive", () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, String(process.pid), "utf-8");
    const past = new Date(Date.now() - 5_000);
    fs.utimesSync(lockPath, past, past);

    expect(() => acquireLock(lockPath, 1_000)).toThrow(LockHeldError);
  });

  test("release removes the lock file so it can be acquired again", () => {
    const first = acquireLock(lockPath);
    first.release();

    expect(fs.existsSync(lockPath)).toBe(false);

    const second = acquireLock(lockPath);
    expect(fs.existsSync(lockPath)).toBe(true);
    second.release();
  });

  test("release does not remove lock file if owned by a different pid", () => {
    const lock = acquireLock(lockPath);
    // Manually overwrite with a different PID to simulate a stolen lock
    fs.writeFileSync(lockPath, "999999", "utf-8");

    lock.release();

    // The lock file should still exist because our PID no longer matches
    expect(fs.existsSync(lockPath)).toBe(true);

    // Clean up
    fs.rmSync(lockPath, { force: true });
  });
});
