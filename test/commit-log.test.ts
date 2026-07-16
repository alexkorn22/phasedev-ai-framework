import { describe, it, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  readCommitLog, recordCommitLogStart,
  recordIterationBoundary, iterationDiffBase
} from "../src/entities/change/flow-state";
import { buildChangePaths } from "../src/entities/change/paths";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40), D = "d".repeat(40);
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function tmpStatePath(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "clog-"));
  dirs.push(d);
  const statePath = path.join(d, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n");
  return statePath;
}

describe("entities/change/paths (.commit-log.json legacy field)", () => {
  it("buildChangePaths still exposes the legacy .commit-log.json path (unused by state-backed accessors)", () => {
    expect(buildChangePaths("/x/change").commitLogPath).toBe("/x/change/.commit-log.json");
  });

  it("buildChangePaths exposes worklogPath under the change dir", () => {
    expect(buildChangePaths("/x/change").worklogPath).toBe("/x/change/worklog.md");
  });
});

describe("commitLog accessors (state-backed)", () => {
  it("read returns null when the commitLog section is absent, round-trips a written log", () => {
    const p = tmpStatePath();
    expect(readCommitLog(p)).toBeNull();
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B } });
  });

  it("read returns null on a malformed commitLog section (bad SHA shape)", () => {
    const p = tmpStatePath();
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    raw.commitLog = { start: "short", iterations: {} };
    fs.writeFileSync(p, JSON.stringify(raw, null, 2) + "\n");
    expect(readCommitLog(p)).toBeNull();
  });

  it("recordCommitLogStart sets start once (idempotent) and preserves iterations", () => {
    const p = tmpStatePath();
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    recordCommitLogStart(p, C); // must NOT overwrite start
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B } });
  });

  it("recordIterationBoundary overwrites the same iteration (repair cycle) and preserves start", () => {
    const p = tmpStatePath();
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    recordIterationBoundary(p, 2, C);
    recordIterationBoundary(p, 2, D); // repair re-validation overwrites boundary 2
    expect(readCommitLog(p)).toEqual({ start: A, iterations: { "1": B, "2": D } });
  });

  it("recordCommitLogStart/recordIterationBoundary preserve the phase-lock fields", () => {
    const p = tmpStatePath();
    recordCommitLogStart(p, A);
    recordIterationBoundary(p, 1, B);
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    expect(raw.activePhase).toBe("implementation");
    expect(raw.activeIteration).toBe(1);
    expect(raw.repairCycleCount).toBe(0);
  });

  it("iterationDiffBase: N=1 -> start, N>1 -> iterations[N-1], missing -> null", () => {
    const log = { start: A, iterations: { "1": B, "2": C } };
    expect(iterationDiffBase(log, 1)).toBe(A);
    expect(iterationDiffBase(log, 2)).toBe(B);
    expect(iterationDiffBase(log, 3)).toBe(C);
    expect(iterationDiffBase({ start: null, iterations: {} }, 1)).toBeNull();
    expect(iterationDiffBase({ start: A, iterations: {} }, 5)).toBe(A);
  });
});
