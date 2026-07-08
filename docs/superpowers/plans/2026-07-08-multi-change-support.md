# Multi-Change Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow several unfinished changes to coexist in `.phasedev/changes/`, target them explicitly with `--change <name>` on every change-scoped CLI command, rework `phasedev list`, and teach the orchestrator skill to ask the user which change to work on at session start.

**Architecture:** Replace the single-change resolver `findActiveChangeDir(projectRoot)` with `resolveChangeDir(projectRoot, changeName?)` and thread an optional `changeName` parameter from `cli.ts` down through every feature entry point into the `change` entity layer. Archive-state lookups become name-scoped so multiple pending archives are legal. No new state files; `state.json` shape is untouched.

**Tech Stack:** TypeScript, Bun test runner (`bun test`), Node `fs`/`path`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-08-multi-change-design.md`

## Global Constraints

- CLAUDE.md is binding: invoke `dev-core` before the first edit of every task; keep root `src/` thin; dependency direction entrypoints → features → entities → shared.
- Frozen contracts must not change: `state.json = { activePhase, activeIteration, repairCycleCount }`; iteration heading format; YAML keys `approved`/`verdict`/`type`; `config.yaml` shape; `ready_with_risks` semantics; prompt templates by meaning.
- All new parameters are appended and optional — existing call sites keep compiling and behaving identically when exactly one change exists.
- `--change` values are original change slugs, never date-prefixed archive directory names.
- Error messages quoted in tasks are exact — tests assert on them.
- Commands run from the repo root. Full gate: `bun test && npm run typecheck`.

---

### Task 1: Resolution core — `resolveChangeDir`, error classes, name-scoped archive state

**Files:**
- Create: `src/entities/change/change-errors.ts`
- Modify: `src/entities/change/active-change.ts` (full rewrite below)
- Modify: `src/entities/change/archive-state.ts:188-228` (three functions + one new)
- Modify: all `findActiveChangeDir` import sites (mechanical rename, list in Step 5)
- Modify: `src/cli.ts:872-895` (top-level catch)
- Test: `test/multi-change.test.ts` (new file)

**Interfaces:**
- Produces: `resolveChangeDir(projectRoot: string, changeName?: string): string | null` — named lookup or 0/1/N resolution; throws `UnknownChangeError` / `AmbiguousChangeError` (both in `change-errors.ts`, each with `.name` set and message text as specified below).
- Produces: `findPendingArchiveState(projectPath: string, changeName?: string): ArchiveState | null`, `findInvalidArchiveState(projectPath: string, changeName?: string): InvalidArchiveState | null`, `findCompletedArchiveState(projectPath: string, changeName?: string): string | null`, `findArchiveStateForChange(projectPath: string, changeName: string): ArchiveState | null`.
- Consumes: existing `listActiveChangeDirs`, `archiveDirectories`, `readArchiveState`.

- [ ] **Step 1: Write failing tests**

Create `test/multi-change.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";
import { resolveChangeDir } from "../src/entities/change/active-change";
import { AmbiguousChangeError, UnknownChangeError } from "../src/entities/change/change-errors";
import { findPendingArchiveState, findCompletedArchiveState, findArchiveStateForChange } from "../src/entities/change/archive-state";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — `change-errors` module not found, `resolveChangeDir` not exported.

- [ ] **Step 3: Implement**

Create `src/entities/change/change-errors.ts`:

```typescript
export class UnknownChangeError extends Error {
  constructor(readonly changeName: string, readonly available: string[]) {
    super(`Unknown change "${changeName}". Available changes: ${available.length > 0 ? available.join(", ") : "none"}.`);
    this.name = "UnknownChangeError";
  }
}

export class AmbiguousChangeError extends Error {
  constructor(readonly changeNames: string[]) {
    super(`Multiple changes exist: ${changeNames.join(", ")}. Pass --change <name>.`);
    this.name = "AmbiguousChangeError";
  }
}
```

Rewrite `src/entities/change/active-change.ts` (delete `MultipleActiveChangesError`; `listActiveChangeDirs` body is unchanged):

```typescript
import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "./paths";
import { AmbiguousChangeError, UnknownChangeError } from "./change-errors";
import { findArchiveStateForChange } from "./archive-state";

export function listActiveChangeDirs(projectRoot: string): string[] {
  const changesDir = path.join(projectRoot, SYSTEM_DIR, "changes");
  if (!fs.existsSync(changesDir)) return [];

  return fs.readdirSync(changesDir).filter(item => {
    const fullPath = path.join(changesDir, item);
    return (fs.statSync(fullPath, { throwIfNoEntry: false })?.isDirectory() ?? false) &&
      !item.startsWith(".") && item !== "archive";
  });
}

/**
 * Resolve the directory of an unfinished (non-archived) change.
 *
 * With changeName: that change's directory, or null when the name belongs to
 * a change already in changes/archive/ (pending or completed) — archive-aware
 * callers resolve those via archive-state. Unknown names throw.
 *
 * Without changeName: null when no changes exist, the single change when
 * exactly one exists, AmbiguousChangeError otherwise.
 */
export function resolveChangeDir(projectRoot: string, changeName?: string): string | null {
  const names = listActiveChangeDirs(projectRoot);

  if (changeName !== undefined) {
    if (names.includes(changeName)) {
      return path.join(projectRoot, SYSTEM_DIR, "changes", changeName);
    }
    if (findArchiveStateForChange(projectRoot, changeName)) {
      return null;
    }
    throw new UnknownChangeError(changeName, names);
  }

  if (names.length > 1) {
    throw new AmbiguousChangeError(names);
  }
  return names.length > 0
    ? path.join(projectRoot, SYSTEM_DIR, "changes", names[0])
    : null;
}
```

In `src/entities/change/archive-state.ts`:

1. Delete the import `import { findActiveChangeDir } from "./active-change";` (line 5) — this breaks the would-be import cycle with `active-change.ts`.
2. Add `import { AmbiguousChangeError } from "./change-errors";`.
3. Replace `findInvalidArchiveState`, `findPendingArchiveState`, `findCompletedArchiveState` (lines 188-228) with:

```typescript
export function findInvalidArchiveState(projectPath: string, changeName?: string): InvalidArchiveState | null {
  for (const directory of archiveDirectories(projectPath)) {
    // A broken .phase-archive.json has no readable changeName; match the
    // date-prefixed directory suffix instead.
    if (changeName !== undefined && !path.basename(directory).endsWith(`-${changeName}`)) {
      continue;
    }
    const invalid = parseArchiveState(directory).invalid;
    if (invalid) {
      return invalid;
    }
  }

  return null;
}

export function findPendingArchiveState(projectPath: string, changeName?: string): ArchiveState | null {
  const pending: ArchiveState[] = [];
  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state?.status === "in_progress") {
      // Trust the directory the state file was actually found in, not the
      // stored archivePath: the stored value is an absolute path that goes
      // stale when the project is moved/cloned or when a crash-retry landed
      // in a different date-prefixed directory.
      pending.push({ ...state, archivePath: directory });
    }
  }

  if (changeName !== undefined) {
    return pending.find(state => state.changeName === changeName) ?? null;
  }
  if (pending.length > 1) {
    throw new AmbiguousChangeError(pending.map(state => state.changeName));
  }
  return pending[0] ?? null;
}

export function findCompletedArchiveState(projectPath: string, changeName?: string): string | null {
  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state?.status !== "completed") continue;
    if (changeName !== undefined && state.changeName !== changeName) continue;
    return directory;
  }
  return null;
}

export function findArchiveStateForChange(projectPath: string, changeName: string): ArchiveState | null {
  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state?.changeName === changeName) {
      return { ...state, archivePath: directory };
    }
  }
  return null;
}
```

Note: the old `findCompletedArchiveState` returned null whenever any active change existed. That guard is dropped; its only caller (`advanceFlow`, `src/features/phase-control/advance-flow.ts:233`) reaches it only when `loadFlowState` returned null, i.e. when no unfinished change resolves — the guard is now redundant.

- [ ] **Step 4: Mechanical rename of all call sites**

Rename `findActiveChangeDir` → `resolveChangeDir` (same single argument, no behavior change) in:

- `src/entities/change/flow-state.ts:3,50,139,150`
- `src/features/phase-control/create-change.ts:5,47`
- `src/features/phase-control/flow-route.ts:3,75`
- `src/features/phase-control/check-flow.ts:7,38`
- `src/features/phase-control/get-phase-prompt.ts:16,268`
- `src/features/phase-control/get-feedback-prompt.ts:2,16`
- `src/features/phase-control/reopen-phase.ts:3,28`
- `src/features/iteration-ops/set-iteration-status.ts:3,26`
- `src/features/flow-state/reset-change.ts:3,18`
- `src/features/flow-status/get-status.ts:4,35`
- `src/cli.ts:28,125,224,315`

In `src/cli.ts` replace the import at line 28 with:

```typescript
import { resolveChangeDir } from "./entities/change/active-change";
import { AmbiguousChangeError, UnknownChangeError } from "./entities/change/change-errors";
```

Replace the `MultipleActiveChangesError` branch in the top-level catch (`src/cli.ts:876-887`) with:

```typescript
  if (error instanceof AmbiguousChangeError) {
    if (globalJsonMode) {
      console.log(JSON.stringify({ ok: false, kind: "ambiguous-change", message, data: { changeNames: error.changeNames } }));
    } else {
      console.error([
        `[PHASEDEV] BLOCKED: ${message}`,
        "Tip: Use `phasedev list` to see all changes and their status."
      ].join("\n"));
    }
    process.exitCode = 1;
  } else if (error instanceof UnknownChangeError) {
    if (globalJsonMode) {
      console.log(JSON.stringify({ ok: false, kind: "unknown-change", message, data: { changeName: error.changeName, available: error.available } }));
    } else {
      console.error(`[PHASEDEV] FAILED: ${message}`);
    }
    process.exitCode = 1;
  } else if (globalJsonMode) {
```

Update any test in `test/parser.test.ts` referencing `MultipleActiveChangesError` or `findActiveChangeDir` to the new names (`AmbiguousChangeError`, `resolveChangeDir`) and the new message text `"Multiple changes exist: … Pass --change <name>."`.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts test/parser.test.ts && npm run typecheck`
Expected: PASS. Then run the full `bun test` — remaining suites must stay green (single-change behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/entities/change/ src/features/ src/cli.ts test/
git commit -m "feat: resolveChangeDir with named lookup; name-scoped archive state"
```

---

### Task 2: Thread `changeName` through flow state

**Files:**
- Modify: `src/entities/change/flow-state.ts:49-68,76,115-119,131-151`
- Test: `test/multi-change.test.ts` (append)

**Interfaces:**
- Produces: `locateFlowStatePath(projectPath: string, changeName?: string): string | null`, `loadFlowState(projectPath: string, changeName?: string): FlowState | null`, `saveFlowState(projectPath: string, state: FlowState, changeName?: string): void`, `locateChangeDir(projectPath: string, state: FlowState, changeName?: string): string | null`.
- Consumes: Task 1's `resolveChangeDir`, `findPendingArchiveState`, `findInvalidArchiveState`.

- [ ] **Step 1: Write failing tests** (append to `test/multi-change.test.ts`; reuse `mkChange`/`mkArchived` helpers)

```typescript
import { loadFlowState, saveFlowState } from "../src/entities/change/flow-state";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — `saveFlowState` does not accept a third argument / wrong state loaded.

- [ ] **Step 3: Implement**

In `src/entities/change/flow-state.ts`, append the optional parameter and pass it through every internal lookup:

```typescript
export function locateFlowStatePath(projectPath: string, changeName?: string): string | null {
  const active = resolveChangeDir(projectPath, changeName);
  if (active) return path.join(active, FLOW_STATE_FILE);

  const pending = findPendingArchiveState(projectPath, changeName);
  if (pending) return path.join(pending.archivePath, FLOW_STATE_FILE);

  // A broken .phase-archive.json makes findPendingArchiveState skip its directory
  // silently. Fall back to that directory's state.json (if any) so advanceFlow can
  // still load state and report the invalid archive state instead of "no active change".
  const invalid = findInvalidArchiveState(projectPath, changeName);
  if (invalid) {
    const fallbackStatePath = path.join(path.dirname(invalid.statePath), FLOW_STATE_FILE);
    if (fs.existsSync(fallbackStatePath)) {
      return fallbackStatePath;
    }
  }

  return null;
}
```

`loadFlowState(projectPath: string, changeName?: string)`: change line 77 to `const p = locateFlowStatePath(projectPath, changeName);` — the rest of the body is unchanged.

`saveFlowState(projectPath: string, state: FlowState, changeName?: string)`: change line 116 to `const p = locateFlowStatePath(projectPath, changeName);`.

`locateChangeDir(projectPath: string, state: FlowState, changeName?: string)`: pass `changeName` to `findPendingArchiveState` (line 133) and both `resolveChangeDir` calls (lines 139, 150).

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/change/flow-state.ts test/multi-change.test.ts
git commit -m "feat: thread changeName through flow-state resolution"
```

---

### Task 3: Thread `changeName` through routing

**Files:**
- Modify: `src/features/phase-control/flow-route.ts:53-77,157`
- Modify: `src/features/phase-control/current-flow-state.ts:11-14`
- Test: `test/multi-change.test.ts` (append)

**Interfaces:**
- Produces: `resolveRoute(projectPath: string, changeName?: string): Route`, `resolveCurrentState(projectPath: string, changeName?: string): CurrentState`.
- Consumes: Task 1 archive-state signatures, Task 2 `loadFlowState`.

- [ ] **Step 1: Write failing test** (append to `test/multi-change.test.ts`)

```typescript
import { resolveRoute } from "../src/features/phase-control/flow-route";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — without name-scoping, the pending archive is returned first (`pending_archive` route), and `resolveRoute` takes one argument.

- [ ] **Step 3: Implement**

`src/features/phase-control/flow-route.ts` — change the signature and the four internal lookups:

```typescript
export function resolveRoute(projectPath: string, changeName?: string): Route {
  const invalidArchiveState = findInvalidArchiveState(projectPath, changeName);
  ...
  const pendingArchive = findPendingArchiveState(projectPath, changeName);
  ...
  const changeDir = resolveChangeDir(projectPath, changeName);
  ...
```

(only the argument lists change; every returned Route object stays as-is). At line 157, `const flowState = loadFlowState(projectPath);` becomes `const flowState = loadFlowState(projectPath, changeName);`.

`src/features/phase-control/current-flow-state.ts`:

```typescript
export function resolveCurrentState(projectPath: string, changeName?: string): CurrentState {
  const route = resolveRoute(projectPath, changeName);
  return { phase: route.phase, routeKind: route.kind, activeChangePath: route.activeChangePath };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts test/controller.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/flow-route.ts src/features/phase-control/current-flow-state.ts test/multi-change.test.ts
git commit -m "feat: name-scoped route resolution"
```

---

### Task 4: `create-change` under multi-change rules

**Files:**
- Modify: `src/features/phase-control/create-change.ts:46-75`
- Test: `test/multi-change.test.ts` (append)

**Interfaces:**
- Produces: `createChange(projectPath, name, taskText?)` — signature unchanged; new refusal semantics.
- Consumes: `listActiveChangeDirs`, Task 1's `findPendingArchiveState(projectPath, slug)`, `findInvalidArchiveState(projectPath, slug)`.

- [ ] **Step 1: Write failing tests** (append)

```typescript
import { createChange } from "../src/features/phase-control/create-change";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — "Active change already exists" on the first two tests.

- [ ] **Step 3: Implement**

In `src/features/phase-control/create-change.ts`, replace the whole guard block (lines 46-69, the `try { ... }` with `findActiveChangeDir`/pending/invalid checks) with name-scoped checks; also replace the `findActiveChangeDir` import with `listActiveChangeDirs`:

```typescript
  try {
    if (listActiveChangeDirs(projectPath).includes(slug)) {
      return { ok: false, message: `Change "${slug}" already exists at ${path.join(projectPath, SYSTEM_DIR, "changes", slug)}.` };
    }

    // A pending archive still owns this change name (state.json lives in the
    // archived directory). Reusing the name would make --change ambiguous.
    const pendingSameName = findPendingArchiveState(projectPath, slug);
    if (pendingSameName) {
      return { ok: false, message: `Archive of "${slug}" is still in progress at ${pendingSameName.archivePath}. Complete the archive phase (set .phase-archive.json status=completed) before reusing this name.` };
    }

    const invalidSameName = findInvalidArchiveState(projectPath, slug);
    if (invalidSameName) {
      return { ok: false, message: `Archive state is invalid: ${invalidSameName.reason} (${invalidSameName.statePath}). Fix it before reusing this name.` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Error checking active changes: ${msg}` };
  }
```

Keep everything after the guard block (the `fs.existsSync(changeDir)` safety check, mkdir, `state.json`, `intake_task.md`) exactly as it is.

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts test/controller.test.ts test/cli.test.ts && npm run typecheck`
Expected: PASS, except any existing test that asserts "Active change already exists" — update it to expect successful creation of a second change (this is the intended behavior change; adjust the assertion, do not delete the test).

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/create-change.ts test/
git commit -m "feat: allow multiple unfinished changes in create-change"
```

---

### Task 5: `phasedev list` rework

**Files:**
- Modify: `src/features/flow-status/list-changes.ts` (full rewrite below)
- Modify: `src/cli.ts:540-549` (`changes`/`list` command)
- Test: `test/multi-change.test.ts` (append)

**Interfaces:**
- Produces: `listChanges(projectPath: string, includeArchived?: boolean): ChangeEntry[]` with `ChangeEntry = { name: string; type: "active" | "pending_archive" | "archived"; phase?: string; activeIteration?: number | null; taskSummary?: string; error?: string; archiveDate?: string; archiveStatus?: string }`; `renderChanges(entries: ChangeEntry[]): string`.
- Consumes: `listActiveChangeDirs`, `archiveDirectories`, `readArchiveState` (Task 1).

- [ ] **Step 1: Write failing tests** (append)

```typescript
import { listChanges, renderChanges } from "../src/features/flow-status/list-changes";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — old `listChanges` stamps a global route phase and always includes archived entries.

- [ ] **Step 3: Implement**

Rewrite `src/features/flow-status/list-changes.ts`:

```typescript
import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { listActiveChangeDirs } from "../../entities/change/active-change";
import { archiveDirectories, readArchiveState } from "../../entities/change/archive-state";

export interface ChangeEntry {
  name: string;
  type: "active" | "pending_archive" | "archived";
  phase?: string;
  activeIteration?: number | null;
  taskSummary?: string;
  error?: string;
  archiveDate?: string;
  archiveStatus?: string;
}

function readChangeState(changeDir: string): { phase?: string; activeIteration?: number | null; error?: string } {
  const statePath = path.join(changeDir, "state.json");
  if (!fs.existsSync(statePath)) return { error: "state.json is missing" };
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (typeof raw !== "object" || raw === null || typeof raw.activePhase !== "string") {
      return { error: "state.json has no activePhase" };
    }
    return { phase: raw.activePhase, activeIteration: raw.activeIteration ?? null };
  } catch {
    return { error: "state.json is not valid JSON" };
  }
}

function readTaskSummary(changeDir: string): string {
  for (const file of ["intake_task.md", "prd.md"]) {
    const filePath = path.join(changeDir, file);
    if (!fs.existsSync(filePath)) continue;
    const firstLine = fs.readFileSync(filePath, "utf-8")
      .split("\n")
      .map(line => line.trim())
      .find(line => line.length > 0 && line !== "---");
    if (firstLine) return firstLine.replace(/^#+\s*/, "");
  }
  return "";
}

function archiveDateOf(directory: string): string {
  const match = path.basename(directory).match(/^(\d{4}-\d{2}-\d{2})-/);
  return match ? match[1] : "";
}

export function listChanges(projectPath: string, includeArchived = false): ChangeEntry[] {
  const entries: ChangeEntry[] = [];

  for (const name of listActiveChangeDirs(projectPath).sort()) {
    const changeDir = path.join(projectPath, SYSTEM_DIR, "changes", name);
    const state = readChangeState(changeDir);
    entries.push({ name, type: "active", taskSummary: readTaskSummary(changeDir), ...state });
  }

  for (const directory of archiveDirectories(projectPath)) {
    const state = readArchiveState(directory);
    if (state === null) {
      // Unreadable .phase-archive.json: still unfinished work — surface it.
      entries.push({
        name: path.basename(directory),
        type: "pending_archive",
        archiveDate: archiveDateOf(directory),
        error: ".phase-archive.json is missing or malformed"
      });
      continue;
    }
    if (state.status === "in_progress") {
      entries.push({
        name: state.changeName,
        type: "pending_archive",
        phase: "archive",
        taskSummary: readTaskSummary(directory),
        archiveDate: archiveDateOf(directory)
      });
    } else if (includeArchived) {
      entries.push({
        name: path.basename(directory),
        type: "archived",
        archiveDate: archiveDateOf(directory),
        archiveStatus: state.status
      });
    }
  }

  return entries;
}

export function renderChanges(entries: ChangeEntry[]): string {
  if (entries.length === 0) {
    return "No changes. Run: phasedev create-change <name>.";
  }

  const lines: string[] = ["=== PhaseDev Changes ===", ""];
  const unfinished = entries.filter(e => e.type !== "archived");
  const archived = entries.filter(e => e.type === "archived");

  if (unfinished.length > 0) {
    lines.push("--- Changes ---");
    for (const entry of unfinished) {
      const marker = entry.type === "pending_archive" ? " [archive in progress]" : "";
      lines.push(`  ${entry.name}${marker}`);
      if (entry.error) {
        lines.push(`    ERROR: ${entry.error}`);
        continue;
      }
      if (entry.phase) {
        const iter = entry.activeIteration != null ? ` (iteration ${entry.activeIteration})` : "";
        lines.push(`    Phase: ${entry.phase}${iter}`);
      }
      if (entry.taskSummary) {
        lines.push(`    Task: ${entry.taskSummary}`);
      }
    }
    lines.push("");
  }

  if (archived.length > 0) {
    lines.push("--- Archived Changes ---");
    for (const entry of archived) {
      const dateStr = entry.archiveDate ? ` [${entry.archiveDate}]` : "";
      lines.push(`  ${entry.name}${dateStr} (status: ${entry.archiveStatus})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

Update the CLI command (`src/cli.ts:540-549`):

```typescript
  if (command === "changes" || command === "list") {
    const entries = listChanges(projectPath, hasFlag(args, "--archived"));
    reportCliResult(jsonMode, {
      ok: true,
      kind: "changes",
      humanMessage: renderChanges(entries),
      data: { entries }
    });
    return;
  }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts test/cli.test.ts && npm run typecheck`
Expected: PASS; fix any cli test asserting the old "No changes found." wording or old archived-by-default output.

- [ ] **Step 5: Commit**

```bash
git add src/features/flow-status/list-changes.ts src/cli.ts test/
git commit -m "feat: per-change list with pending archives and --archived flag"
```

---

### Task 6: Thread `changeName` through read-side features

**Files:**
- Modify: `src/features/phase-control/check-flow.ts:33-40,62-94,107-109`
- Modify: `src/features/phase-control/get-phase-prompt.ts:253-293`
- Modify: `src/features/phase-control/get-feedback-prompt.ts:14-25`
- Modify: `src/features/flow-status/get-status.ts:26-35`
- Test: `test/multi-change.test.ts` (append)

**Interfaces:**
- Produces: `checkPhase(projectPath: string, phaseOverride?: string, changeName?: string): PhaseCheckResult`, `checkValidationCompletion(projectPath: string, options: ValidationCheckOptions, changeName?: string): ValidationCheckResult`, `getPhasePrompt(projectPath: string, config?: Config, changeName?: string): Prompt`, `getFeedbackPrompt(projectPath: string, changeName?: string): FeedbackPrompt`, `getFlowStatus(projectPath: string, changeName?: string): FlowStatus`.
- Consumes: Tasks 1-3 signatures.

- [ ] **Step 1: Write failing test** (append)

```typescript
import { checkPhase } from "../src/features/phase-control/check-flow";
import { getFlowStatus } from "../src/features/flow-status/get-status";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — functions take fewer arguments / `AmbiguousChangeError` is thrown.

- [ ] **Step 3: Implement**

`src/features/phase-control/check-flow.ts`:

- `checkPhase(projectPath: string, phaseOverride?: string, changeName?: string)`: pass `changeName` to `loadFlowState(projectPath, changeName)` (line 66) and `locateChangeDir(projectPath, state, changeName)` (line 84).
- `checkValidationCompletion(projectPath: string, options: ValidationCheckOptions, changeName?: string)`: `resolveRoute(projectPath, changeName)` (line 108) and pass `changeName` into `pathsForValidation`.
- `pathsForValidation(projectPath: string, route: Route, changeName?: string)`: `resolveChangeDir(projectPath, changeName)` (line 38).

`src/features/phase-control/get-phase-prompt.ts`:

- `getPhasePrompt(projectPath: string, config: Config = loadConfig(), changeName?: string)`: pass `changeName` to `loadFlowState` (line 254), `resolveChangeDir` (line 268), `findPendingArchiveState` (line 269), and `resolveRoute` inside the `detectStateRouteConflict` call (line 282). The render functions below the switch are untouched — they receive `paths`/`changeDir` already resolved.

`src/features/phase-control/get-feedback-prompt.ts`:

```typescript
export function getFeedbackPrompt(projectPath: string, changeName?: string): FeedbackPrompt {
  const state = loadFlowState(projectPath, changeName);
  const changeDir = resolveChangeDir(projectPath, changeName);
```

`src/features/flow-status/get-status.ts`:

```typescript
export function getFlowStatus(projectPath: string, changeName?: string): FlowStatus {
  let state: { phase: string; routeKind: string };
  try {
    const resolved = resolveCurrentState(projectPath, changeName);
    ...
  const changeDir = resolveChangeDir(projectPath, changeName);
```

(only the two argument lists change; the rest of the body stays).

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts test/controller.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/check-flow.ts src/features/phase-control/get-phase-prompt.ts src/features/phase-control/get-feedback-prompt.ts src/features/flow-status/get-status.ts test/multi-change.test.ts
git commit -m "feat: thread changeName through check, phase prompt, feedback, status"
```

---

### Task 7: Thread `changeName` through mutating features; scope the archive stage

**Files:**
- Modify: `src/features/phase-control/advance-flow.ts:230-290,304,453`
- Modify: `src/features/phase-control/archive-stage.ts:40-49`
- Modify: `src/features/flow-state/reset-change.ts:17-18`
- Modify: `src/features/phase-control/reopen-phase.ts:22-28`
- Modify: `src/features/iteration-ops/set-iteration-status.ts:12-26`
- Test: `test/multi-change.test.ts` (append)

**Interfaces:**
- Produces: `advanceFlow(projectPath: string, config: Config, changeName?: string): AdvanceResult`, `getPendingArchivePrompt(projectPath: string, config?: Config, changeName?: string): Prompt | null`, `resetChange(projectPath: string, force?: boolean, changeName?: string): ResetChangeResult`, `reopenPhase(projectPath: string, phase: ReopenablePhase, changeName?: string): ReopenResult`, `setIterationStatus(projectPath, iterationId, status, explicitFile?, changeName?): SetIterationStatusResult`.
- Consumes: Tasks 1-3 signatures; `startArchiveStage` keeps its signature (it already receives `changeDir`).

- [ ] **Step 1: Write failing tests** (append)

```typescript
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { loadConfig } from "../src/entities/config/config";

describe("mutating features with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("mut"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("advanceFlow on the named change refuses without touching the other change", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    const result = advanceFlow(root, loadConfig(), "beta");
    expect(result.ok).toBe(false); // change_intake artifacts are missing — refusal is correct
    expect(loadFlowState(root, "alpha")?.activePhase).toBe("change_intake");
  });

  test("advanceFlow --change on a completed archive reports finished", () => {
    mkArchived(root, "old-done", "completed");
    mkChange(root, "alpha");
    const result = advanceFlow(root, loadConfig(), "old-done");
    expect(result.finished).toBe(true);
  });

  test("startArchiveStage archives change B even while change A has a pending archive", () => {
    mkArchived(root, "stuck", "in_progress");
    const beta = mkChange(root, "beta");
    const prompt = startArchiveStage(root, beta, new Date("2026-07-08T12:00:00Z"));
    expect(prompt.blocked ?? false).toBe(false);
    expect(fs.existsSync(beta)).toBe(false); // moved into archive
    expect(findPendingArchiveState(root, "beta")?.status).toBe("in_progress");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/multi-change.test.ts`
Expected: FAIL — `advanceFlow` takes two arguments; `startArchiveStage` short-circuits on the OTHER change's pending archive and returns the stuck change's prompt without moving `beta`.

- [ ] **Step 3: Implement**

`src/features/phase-control/advance-flow.ts` — `advanceFlow(projectPath: string, config: Config, changeName?: string)`; pass `changeName` at every lookup:

- line 231: `loadFlowState(projectPath, changeName)`
- line 233: `findCompletedArchiveState(projectPath, changeName)`
- line 240: `locateChangeDir(projectPath, state, changeName)`
- line 243: `findInvalidArchiveState(projectPath, changeName)`
- line 275: `detectStateRouteConflict(state, resolveRoute(projectPath, changeName))`
- line 290: `let route = resolveRoute(projectPath, changeName);`
- line 304: `route = resolveRoute(projectPath, changeName);`
- line 453: `saveFlowState(projectPath, finalNextState, changeName);`

`src/features/phase-control/archive-stage.ts` — scope the pending-archive short-circuit to the change being archived (this is the multi-change correctness fix):

```typescript
export function getPendingArchivePrompt(projectPath: string, config: Config = loadConfig(), changeName?: string): Prompt | null {
  const pendingState = findPendingArchiveState(projectPath, changeName);
  return pendingState ? archivePrompt(projectPath, pendingState, config) : null;
}

export function startArchiveStage(projectPath: string, changeDir: string, now: Date, config: Config = loadConfig()): Prompt {
  const pendingPrompt = getPendingArchivePrompt(projectPath, config, path.basename(changeDir));
  if (pendingPrompt) {
    return pendingPrompt;
  }
  ...
```

(rest of `startArchiveStage` unchanged).

`src/features/flow-state/reset-change.ts`: `resetChange(projectPath: string, force?: boolean, changeName?: string)`; line 18 → `const changeDir = resolveChangeDir(projectPath, changeName);`.

`src/features/phase-control/reopen-phase.ts`: `reopenPhase(projectPath: string, phase: ReopenablePhase, changeName?: string)`; line 28 → `const changeDir = resolveChangeDir(projectPath, changeName);`.

`src/features/iteration-ops/set-iteration-status.ts`: `setIterationStatus(projectPath: string, iterationId: number, status: "completed" | "in_progress" | "not_started", explicitFile?: string, changeName?: string)`; line 26 → `const changeDir = resolveChangeDir(projectPath, changeName);`.

Also check `getPendingArchivePrompt` call sites (`grep -n getPendingArchivePrompt src/`) — where the caller is the `phase` command path handling a pending archive, pass the CLI's `changeName` through (final wiring lands in Task 8).

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/multi-change.test.ts test/controller.test.ts test/e2e-flow.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ test/multi-change.test.ts
git commit -m "feat: thread changeName through advance, reset, reopen, iteration ops; scope archive stage to its own change"
```

---

### Task 8: CLI `--change` flag

**Files:**
- Modify: `src/cli.ts` (flag parsing + every change-scoped command dispatch; exact sites below)
- Modify: `src/features/cli-help/render-help.ts` (document `--change` and `list --archived`)
- Test: `test/cli.test.ts` (append)

**Interfaces:**
- Consumes: every `changeName?`-capable signature from Tasks 1-7.
- Produces: CLI behavior — `--change <name>` accepted by `phase`, `check`, `advance`, `approve`, `add-finding`, `resolve-finding`, `reopen-finding`, `set-verdict`, `set-iteration-status`, `validate-artifact`, `status`, `feedback`, `reset-change`, `reopen`, `check-validation`. Not change-scoped: `init`, `init-project`, `config`, `log`, `version`, `help`, `create-change`, `check-archive` (takes `--archive-path`).

- [ ] **Step 1: Write failing tests** (append to `test/cli.test.ts`, following that file's existing pattern for invoking the CLI against a temp workspace)

Test cases (adapt to the file's existing runner helper):

1. `phasedev status --change beta` with changes `alpha` and `beta` → exit 0, output contains `beta`.
2. `phasedev status` with two changes → exit 1, stderr/stdout contains `Multiple changes exist: alpha, beta. Pass --change <name>.`
3. `phasedev status --change nope` with one change `alpha` → exit 1, output contains `Unknown change "nope". Available changes: alpha.`
4. `phasedev check --change beta` with two changes → runs against `beta` (exit code per its artifact state, message names phase `change_intake`).
5. `phasedev list` with two changes → exit 0, both names present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/cli.test.ts`
Expected: FAIL — `--change` is not parsed; ambiguity produces the old wording.

- [ ] **Step 3: Implement**

In `src/cli.ts` `main()`, right after `const projectPath = parseProjectPath(args);` (line 185) add:

```typescript
  const changeName = parseStringOption(args, "--change");
```

Then pass `changeName` through each dispatch:

- `status` (line 198): `getFlowStatus(projectPath, changeName)`
- `approve` (line 224): `resolveChangeDir(projectPath, changeName)` in the relative-path fallback
- `set-iteration-status` (line ~270, inside its handler): `setIterationStatus(projectPath, iterationId, status, explicitFile, changeName)`
- `validate-artifact` (line 315): `resolveChangeDir(projectPath, changeName)` in its path fallback
- findings commands (`add-finding` 336, `resolve-finding` 413, `reopen-finding` 458, `set-verdict` 503): change the helpers to `resolveFindingsPath(projectPath: string, changeName?: string)` (line 123: `resolveChangeDir(projectPath, changeName)`) and `findingsCreateContext(projectPath: string, changeName?: string)` (line 134: `loadFlowState(projectPath, changeName)`), and pass `changeName` at each call
- `phase` (line 732): `getPhasePrompt(projectPath, config, changeName)`
- `feedback` (line 748): `getFeedbackPrompt(projectPath, changeName)`
- `advance` (line 766): `advanceFlow(projectPath, config, changeName)`
- `check` (line 807): `checkPhase(projectPath, phaseOverride, changeName)`
- `check-validation` (line 829): `checkValidationCompletion(projectPath, parsed.options, changeName)`
- `reset-change` (line 642): `resetChange(projectPath, force, changeName)`
- `reopen` (line 669): `reopenPhase(projectPath, phase as ReopenablePhase, changeName)`

The top-level catch already maps `AmbiguousChangeError`/`UnknownChangeError` (Task 1); commands that throw from deep lookups exit 1 with the exact messages tested in Step 1.

In `src/features/cli-help/render-help.ts`, add to the global options section (match the file's existing formatting):

```
  --change <name>    Target change when several exist (defaults to the only change)
```

and to the `changes`/`list` entry:

```
  list [--archived]  List unfinished changes (with --archived: completed archive too)
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test test/cli.test.ts test/multi-change.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/features/cli-help/render-help.ts test/cli.test.ts
git commit -m "feat: --change flag on change-scoped CLI commands"
```

---

### Task 9: End-to-end multi-change flow test

**Files:**
- Test: `test/e2e-flow.test.ts` (append a `describe` block, reusing that file's existing flow-driving helpers)

**Interfaces:**
- Consumes: the full CLI/feature surface from Tasks 1-8. No production code changes; if a test here fails, fix the responsible task's code, not the test.

- [ ] **Step 1: Write the test**

Append a `describe("multi-change e2e")` block that, using the file's existing helpers for driving a change through phases (artifact fixtures, advance calls):

1. Creates `alpha` and `beta` via `createChange` in one workspace.
2. Drives `alpha` forward at least one phase (`change_intake` → `code_research`) using `advanceFlow(root, config, "alpha")` with the fixture artifacts the suite already uses.
3. Asserts `loadFlowState(root, "beta")?.activePhase` is still `change_intake` and `beta`'s directory has no `alpha` artifacts.
4. Asserts `resolveRoute(root, "beta").kind` is `change_intake` while `resolveRoute(root, "alpha").kind` has moved on.
5. Asserts `advanceFlow(root, config)` (no name) refuses with `Multiple changes exist`.

- [ ] **Step 2: Run the test**

Run: `bun test test/e2e-flow.test.ts`
Expected: PASS. If it fails, the failure points at a missed threading site in Tasks 6-8 — fix there.

- [ ] **Step 3: Run the full gate**

Run: `bun test && npm run typecheck`
Expected: PASS across all suites.

- [ ] **Step 4: Commit**

```bash
git add test/e2e-flow.test.ts
git commit -m "test: e2e coverage for independent multi-change flows"
```

---

### Task 10: Orchestrator skill update

**Files:**
- Modify: `skills/phasedev-orchestrator/SKILL.md`
- Test: `bun test test/skill-md-drift.test.ts` (guards route-kind tokens in SKILL.md against the code)

**Interfaces:**
- Consumes: CLI surface from Tasks 5 and 8 (`phasedev list`, `--change`).

- [ ] **Step 1: Edit SKILL.md**

Apply these edits (wording may be polished, meaning must be exact):

1. **Command list** (the "Core orchestrator commands" section): add after `create-change`:
   > `phasedev list` — list unfinished changes with phase, iteration, and task summary. Run first at session start.
   And add a global note: every change-scoped command below is invoked with `--change <change>` (see Initialization).

2. **Initialization** — replace the "Before the loop, create the change once…" sentence with a "Change selection" protocol:
   > Before the loop, select the change:
   > 1. Run `phasedev list`.
   > 2. If it reports no changes → create one: `phasedev create-change <name>` (`<name>` slugified from the user's goal).
   > 3. If any unfinished changes exist → ALWAYS stop and ask the user one question: list each change (name, phase, iteration, task summary — from `list` output only) plus the option "create a new change for the current goal". This applies both with and without a goal argument.
   > 4. Fix the selected name as `<change>` for the whole session: one orchestrator — one change. Switching changes mid-session is a new orchestrator run.
   > 5. A change marked `archive in progress` or with an error marker may be selected; the normal loop handles it.
   >
   > Pass `--change <change>` on EVERY change-scoped command (`phase`, `check`, `advance`, `approve`, `add-finding`, `feedback`, `status`), even when only one change exists. `config` is not change-scoped.

3. **Sub-agent prompt** (the canonical prompt block): change step 1 to `Run command: phasedev phase --change <change> — get the active phase contract.`, step 3's self-check to `phasedev check --change <change>`, and add after the CLI-invocation line:
   > You work ONLY on the change "<change>". Never pass a different --change value.
   Apply the same two substitutions to the feedback sub-agent prompt block (`phasedev feedback` → the sub-agent still runs `phasedev feedback --change <change>`; `add-finding` fast path gains `--change <change>`).

4. **The Loop / invariant sentence**: update to "…`phasedev phase --change X` returns the same contract for every sub-agent until `advance --change X` is called — an advance on another change does not affect X's contract."

5. **User Feedback Handling**, fresh-session paragraph: prepend "Run `phasedev list` first; if several unfinished changes exist and the user did not name one, ask which change the feedback targets."

6. **Auto-Approval / Archive Handling**: add `--change <change>` to the quoted `phasedev approve` and `phasedev advance` invocations.

- [ ] **Step 2: Run the drift test**

Run: `bun test test/skill-md-drift.test.ts`
Expected: PASS (route-kind tokens unchanged).

- [ ] **Step 3: Commit**

```bash
git add skills/phasedev-orchestrator/SKILL.md
git commit -m "docs: orchestrator change-selection protocol and --change threading"
```

---

## Final verification

- [ ] `bun test && npm run typecheck` — full green.
- [ ] CLI smoke in a scratch project:

```bash
phasedev init --project-path /tmp/mc-smoke
phasedev create-change --project-path /tmp/mc-smoke alpha
phasedev create-change --project-path /tmp/mc-smoke beta
phasedev list --project-path /tmp/mc-smoke              # both listed with phases
phasedev status --project-path /tmp/mc-smoke            # refuses: Multiple changes exist
phasedev status --project-path /tmp/mc-smoke --change beta
phasedev check --project-path /tmp/mc-smoke --change alpha
```

Expected: the two `--change` calls succeed; the bare `status` exits 1 with the ambiguity message.
