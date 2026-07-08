import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";
import { resolveChangeDir } from "../src/entities/change/active-change";
import { AmbiguousChangeError, UnknownChangeError } from "../src/entities/change/change-errors";
import { findPendingArchiveState, findCompletedArchiveState, findArchiveStateForChange } from "../src/entities/change/archive-state";
import { loadFlowState, saveFlowState } from "../src/entities/change/flow-state";
import { resolveRoute } from "../src/features/phase-control/flow-route";
import { createChange } from "../src/features/phase-control/create-change";
import { listChanges, renderChanges } from "../src/features/flow-status/list-changes";
import { checkPhase } from "../src/features/phase-control/check-flow";
import { getFlowStatus } from "../src/features/flow-status/get-status";

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

describe("resolveRoute with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("route"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("routes each named change independently", () => {
    const alpha = mkChange(root, "alpha");
    mkChange(root, "beta");
    const routeAlpha = resolveRoute(root, "alpha");
    expect(routeAlpha.kind).toBe("change_intake");
    expect(routeAlpha.activeChangePath).toBe(alpha);
    expect(resolveRoute(root, "beta").kind).toBe("change_intake");
  });

  test("a pending archive of another change does not hijack the named route", () => {
    mkArchived(root, "old-pending", "in_progress");
    const alpha = mkChange(root, "alpha");
    const route = resolveRoute(root, "alpha");
    expect(route.kind).toBe("change_intake");
    expect(route.activeChangePath).toBe(alpha);
  });
});

describe("createChange with multiple changes", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("create"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("creates a second change while another is unfinished", () => {
    mkChange(root, "alpha");
    const result = createChange(root, "beta");
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(root, ".phasedev", "changes", "beta", "state.json"))).toBe(true);
  });

  test("a pending archive of another change does not block creation", () => {
    mkArchived(root, "old-pending", "in_progress");
    expect(createChange(root, "beta").ok).toBe(true);
  });

  test("refuses a name that has a pending archive", () => {
    mkArchived(root, "old-pending", "in_progress");
    const result = createChange(root, "old-pending");
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Archive of "old-pending" is still in progress');
  });

  test("refuses a name colliding with an existing change", () => {
    mkChange(root, "alpha");
    const result = createChange(root, "alpha");
    expect(result.ok).toBe(false);
    expect(result.message).toContain('already exists');
  });
});

describe("listChanges multi-change", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("list"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("reports each change's own phase and task summary", () => {
    const alpha = mkChange(root, "alpha");
    fs.writeFileSync(path.join(alpha, "intake_task.md"), "# Fix login flow\ndetails...\n");
    const beta = mkChange(root, "beta");
    fs.writeFileSync(path.join(beta, "state.json"), JSON.stringify({ activePhase: "implementation", activeIteration: 2, repairCycleCount: 0 }));

    const entries = listChanges(root);
    const a = entries.find(e => e.name === "alpha");
    const b = entries.find(e => e.name === "beta");
    expect(a?.phase).toBe("change_intake");
    expect(a?.taskSummary).toBe("Fix login flow");
    expect(b?.phase).toBe("implementation");
    expect(b?.activeIteration).toBe(2);
  });

  test("includes pending archives, excludes completed unless includeArchived", () => {
    mkArchived(root, "old-pending", "in_progress");
    mkArchived(root, "old-done", "completed");

    const entries = listChanges(root);
    expect(entries.find(e => e.name === "old-pending")?.type).toBe("pending_archive");
    expect(entries.find(e => e.name?.includes("old-done"))).toBeUndefined();

    const all = listChanges(root, true);
    expect(all.some(e => e.type === "archived" && e.archiveStatus === "completed")).toBe(true);
  });

  test("a broken state.json becomes an error marker, not a crash", () => {
    const alpha = mkChange(root, "alpha");
    fs.writeFileSync(path.join(alpha, "state.json"), "{broken");
    const entry = listChanges(root).find(e => e.name === "alpha");
    expect(entry?.error).toContain("state.json");
  });

  test("renderChanges prints the empty-state hint", () => {
    expect(renderChanges([])).toBe("No changes. Run: phasedev create-change <name>.");
  });
});

describe("read-side features with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("read"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("checkPhase validates the named change among several", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    const result = checkPhase(root, undefined, "beta");
    expect(result.phase).toBe("change_intake");
  });

  test("getFlowStatus reports the named change", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    expect(getFlowStatus(root, "beta").activeChange).toBe("beta");
  });
});
