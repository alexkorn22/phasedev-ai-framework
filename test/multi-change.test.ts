import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";
import { resolveChangeDir } from "../src/entities/change/active-change";
import { AmbiguousChangeError, UnknownChangeError } from "../src/entities/change/change-errors";
import { findPendingArchiveState, findCompletedArchiveState, findArchiveStateForChange } from "../src/entities/change/archive-state";
import { loadFlowState, saveFlowState } from "../src/entities/change/flow-state";

function mkChange(root: string, name: string): string {
  const dir = path.join(root, ".phasedev", "changes", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 }));
  return dir;
}

function mkArchived(root: string, name: string, status: "in_progress" | "completed"): string {
  const dir = path.join(root, ".phasedev", "changes", "archive", `2026-07-08-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".phase-archive.json"), JSON.stringify({
    status, changeName: name, archivePath: dir, startedAt: "2026-07-08T00:00:00.000Z",
    ...(status === "completed" ? { completedAt: "2026-07-08T01:00:00.000Z" } : {})
  }));
  return dir;
}

describe("resolveChangeDir", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("resolve"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("returns null when no changes exist", () => {
    expect(resolveChangeDir(root)).toBeNull();
  });

  test("returns the single change when name omitted", () => {
    const dir = mkChange(root, "alpha");
    expect(resolveChangeDir(root)).toBe(dir);
  });

  test("throws AmbiguousChangeError when several changes and no name", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    expect(() => resolveChangeDir(root)).toThrow(AmbiguousChangeError);
    expect(() => resolveChangeDir(root)).toThrow("Multiple changes exist: alpha, beta. Pass --change <name>.");
  });

  test("resolves a named change among several", () => {
    mkChange(root, "alpha");
    const beta = mkChange(root, "beta");
    expect(resolveChangeDir(root, "beta")).toBe(beta);
  });

  test("throws UnknownChangeError for a missing name, listing available", () => {
    mkChange(root, "alpha");
    expect(() => resolveChangeDir(root, "nope")).toThrow(UnknownChangeError);
    expect(() => resolveChangeDir(root, "nope")).toThrow('Unknown change "nope". Available changes: alpha.');
  });

  test("returns null (not throw) when the name matches a pending or completed archive", () => {
    mkArchived(root, "old-pending", "in_progress");
    mkArchived(root, "old-done", "completed");
    expect(resolveChangeDir(root, "old-pending")).toBeNull();
    expect(resolveChangeDir(root, "old-done")).toBeNull();
  });
});

describe("name-scoped archive state", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("arch"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("findPendingArchiveState picks the pending archive by changeName", () => {
    mkArchived(root, "one", "in_progress");
    mkArchived(root, "two", "in_progress");
    expect(findPendingArchiveState(root, "two")?.changeName).toBe("two");
    expect(findPendingArchiveState(root, "missing")).toBeNull();
  });

  test("findPendingArchiveState without name throws on two pending archives", () => {
    mkArchived(root, "one", "in_progress");
    mkArchived(root, "two", "in_progress");
    expect(() => findPendingArchiveState(root)).toThrow(AmbiguousChangeError);
  });

  test("findCompletedArchiveState matches by name even when an active change exists", () => {
    mkChange(root, "alpha");
    const done = mkArchived(root, "old-done", "completed");
    expect(findCompletedArchiveState(root, "old-done")).toBe(done);
    expect(findCompletedArchiveState(root, "alpha")).toBeNull();
  });

  test("findArchiveStateForChange finds any-status archive by changeName", () => {
    mkArchived(root, "old-done", "completed");
    expect(findArchiveStateForChange(root, "old-done")?.status).toBe("completed");
    expect(findArchiveStateForChange(root, "missing")).toBeNull();
  });
});

describe("flow state with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("state"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("loads and saves the named change's state independently", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    saveFlowState(root, { activePhase: "code_research", activeIteration: null, repairCycleCount: 0 }, "beta");
    expect(loadFlowState(root, "beta")?.activePhase).toBe("code_research");
    expect(loadFlowState(root, "alpha")?.activePhase).toBe("change_intake");
  });

  test("loads a pending-archive change's state by name", () => {
    mkChange(root, "alpha");
    const dir = mkArchived(root, "old-pending", "in_progress");
    fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ activePhase: "archive", activeIteration: null, repairCycleCount: 0 }));
    expect(loadFlowState(root, "old-pending")?.activePhase).toBe("archive");
  });

  test("returns null for a completed archived change", () => {
    mkArchived(root, "old-done", "completed");
    expect(loadFlowState(root, "old-done")).toBeNull();
  });
});
