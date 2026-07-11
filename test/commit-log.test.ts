import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  readCommitLog, writeCommitLog, recordCommitLogStart,
  recordIterationBoundary, iterationDiffBase
} from "../src/entities/change/commit-log";
import { buildChangePaths } from "../src/entities/change/paths";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), D = "d".repeat(40);
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
function tmp(): string { const d = fs.mkdtempSync(path.join(os.tmpdir(), "clog-")); dirs.push(d); return d; }

describe("entities/change/commit-log", () => {
  it("buildChangePaths exposes .commit-log.json", () => {
    expect(buildChangePaths("/x/change").commitLogPath).toBe("/x/change/.commit-log.json");
  });

  it("buildChangePaths exposes worklogPath under the change dir", () => {
    expect(buildChangePaths("/x/change").worklogPath).toBe("/x/change/worklog.md");
  });

  it("read returns null when missing, round-trips a written log", () => {
    const p = path.join(tmp(), ".commit-log.json");
    expect(readCommitLog(p)).toBeNull();
    writeCommitLog(p, { start: A, iterations: { "1": B } });
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B } });
  });

  it("read returns null on malformed JSON or bad SHA shape", () => {
    const p = path.join(tmp(), ".commit-log.json");
    fs.writeFileSync(p, "{not json");
    expect(readCommitLog(p)).toBeNull();
    fs.writeFileSync(p, JSON.stringify({ start: "short", iterations: {} }));
    expect(readCommitLog(p)).toBeNull();
  });

  it("recordCommitLogStart sets start once (idempotent) and preserves iterations", () => {
    const p = path.join(tmp(), ".commit-log.json");
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    recordCommitLogStart(p, C); // must NOT overwrite start
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B } });
  });

  it("recordIterationBoundary overwrites the same iteration (repair cycle) and preserves start", () => {
    const p = path.join(tmp(), ".commit-log.json");
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    recordIterationBoundary(p, 2, C);
    recordIterationBoundary(p, 2, D); // repair re-validation overwrites boundary 2
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B, "2": D } });
  });

  it("iterationDiffBase: N=1 → start, N>1 → iterations[N-1], missing → null", () => {
    const log: any = { start: A, iterations: { "1": B, "2": C } };
    expect(iterationDiffBase(log, 1)).toBe(A);
    expect(iterationDiffBase(log, 2)).toBe(B);
    expect(iterationDiffBase(log, 3)).toBe(C);
    expect(iterationDiffBase({ start: null, iterations: {} }, 1)).toBeNull();
    expect(iterationDiffBase({ start: A, iterations: {} }, 5)).toBe(A);
  });
});
