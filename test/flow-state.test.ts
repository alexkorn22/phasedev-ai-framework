import { describe, it, test, expect, spyOn } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  loadFlowState, writeFlowState, isActivePhase,
  readCommitLog, recordCommitLogStart, recordIterationBoundary,
  readFindingsBaseline, writeFindingsBaseline, clearFindingsBaseline
} from "../src/entities/change/flow-state";
import type { FlowState } from "../src/entities/change/flow-state";

function tmpStateDir(state: unknown): { projectPath: string; changeName: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-flowmode-"));
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
  return { projectPath: root, changeName: "c1" };
}

function makeTempChange(): { dir: string; projectPath: string; changeName: string } {
  const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "pd-state-"));
  const changeName = "c1";
  const dir = path.join(projectPath, ".phasedev", "changes", changeName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "state.json"),
    JSON.stringify({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n"
  );
  return { dir, projectPath, changeName };
}

function writeState(state: FlowState): string {
  const { dir } = makeTempChange();
  const statePath = path.join(dir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
  return statePath;
}

function makeTempChangeWithFindings(): string {
  const { dir } = makeTempChange();
  const content =
    "---\nverdict: ready\ntype: iteration\ndate: 2026-07-01\n---\n\n" +
    "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n" +
    "|---|---|---|---|---|---|---|---|\n" +
    "| F1 | open | MUST-FIX | implementation | Iteration 1 | Missing validation | Fix it | |\n";
  fs.writeFileSync(path.join(dir, "validation_findings.md"), content, "utf-8");
  return dir;
}

describe("flowMode in state.json", () => {
  it("parses a quick state with a quick activePhase", () => {
    const { projectPath, changeName } = tmpStateDir({ activePhase: "quick_plan", activeIteration: null, repairCycleCount: 0, flowMode: "quick" });
    const state = loadFlowState(projectPath, changeName);
    expect(state?.activePhase).toBe("quick_plan");
    expect(state?.flowMode).toBe("quick");
  });

  it("treats absent flowMode as standard (undefined)", () => {
    const { projectPath, changeName } = tmpStateDir({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 });
    expect(loadFlowState(projectPath, changeName)?.flowMode).toBeUndefined();
  });

  it("throws on an unknown flowMode value", () => {
    const { projectPath, changeName } = tmpStateDir({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0, flowMode: "turbo" });
    expect(() => loadFlowState(projectPath, changeName)).toThrow(/flowMode/);
  });

  it("writes standard state without a flowMode key (byte-identical)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-write-"));
    const p = path.join(dir, "state.json");
    writeFlowState(p, { activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 });
    expect(fs.readFileSync(p, "utf-8")).toBe(JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n");
  });

  it("recognises quick phases as active phases", () => {
    expect(isActivePhase("quick_spec_revision")).toBe(true);
  });
});

describe("commitLog section on state.json", () => {
  test("recordCommitLogStart writes commitLog into state.json, preserving phase lock", () => {
    const { dir } = makeTempChange();
    const statePath = path.join(dir, "state.json");
    const sha = "a".repeat(40);
    recordCommitLogStart(statePath, sha);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.commitLog).toEqual({ start: sha, iterations: {} });
    expect(raw.activePhase).toBe("implementation");
    expect(raw.activeIteration).toBe(1);
  });

  test("recordCommitLogStart is idempotent on start", () => {
    const statePath = writeState({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 });
    recordCommitLogStart(statePath, "a".repeat(40));
    recordCommitLogStart(statePath, "b".repeat(40));
    expect(readCommitLog(statePath)?.start).toBe("a".repeat(40));
  });

  test("recordIterationBoundary adds an iteration sha without dropping start", () => {
    const statePath = writeState({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 });
    recordCommitLogStart(statePath, "a".repeat(40));
    recordIterationBoundary(statePath, 1, "b".repeat(40));
    const log = readCommitLog(statePath)!;
    expect(log.start).toBe("a".repeat(40));
    expect(log.iterations["1"]).toBe("b".repeat(40));
  });

  test("readCommitLog returns null when the section is absent or malformed", () => {
    const statePath = writeState({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 });
    expect(readCommitLog(statePath)).toBeNull();

    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    raw.commitLog = { start: "not-a-sha", iterations: {} };
    fs.writeFileSync(statePath, JSON.stringify(raw, null, 2) + "\n");
    expect(readCommitLog(statePath)).toBeNull();
  });

  test("writeFlowState preserves an existing commitLog section", () => {
    const statePath = writeState({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 });
    recordCommitLogStart(statePath, "a".repeat(40));
    writeFlowState(statePath, { activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 });
    expect(readCommitLog(statePath)?.start).toBe("a".repeat(40));
  });
});

describe("findingsBaseline section on state.json", () => {
  test("writeFindingsBaseline snapshots rows into state.json; clearFindingsBaseline removes the section", () => {
    const dir = makeTempChangeWithFindings();
    const statePath = path.join(dir, "state.json");
    const findingsPath = path.join(dir, "validation_findings.md");
    writeFindingsBaseline(statePath, findingsPath);
    expect(readFindingsBaseline(statePath)!.rows.length).toBe(1);
    clearFindingsBaseline(statePath);
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(raw.findingsBaseline).toBeUndefined();
    expect(raw.activePhase).toBeDefined();
  });

  test("readFindingsBaseline returns null when the section is malformed", () => {
    const { dir } = makeTempChange();
    const statePath = path.join(dir, "state.json");
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    raw.findingsBaseline = "not-an-object";
    fs.writeFileSync(statePath, JSON.stringify(raw, null, 2) + "\n");
    expect(readFindingsBaseline(statePath)).toBeNull();
  });
});

describe("legacy dotfile warning", () => {
  test("loadFlowState warns once when a legacy .commit-log.json sibling exists, and ignores it", () => {
    const { dir, projectPath, changeName } = makeTempChange();
    fs.writeFileSync(path.join(dir, ".commit-log.json"), "{}", "utf-8");
    const warnings: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((m: string) => { warnings.push(m); });
    loadFlowState(projectPath, changeName);
    spy.mockRestore();
    expect(warnings.some(w => w.includes(".commit-log.json"))).toBe(true);
  });

  test("loadFlowState warns once when a legacy .findings-baseline.json sibling exists, and ignores it", () => {
    const { dir, projectPath, changeName } = makeTempChange();
    fs.writeFileSync(path.join(dir, ".findings-baseline.json"), "{}", "utf-8");
    const warnings: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((m: string) => { warnings.push(m); });
    loadFlowState(projectPath, changeName);
    spy.mockRestore();
    expect(warnings.some(w => w.includes(".findings-baseline.json"))).toBe(true);
  });
});
