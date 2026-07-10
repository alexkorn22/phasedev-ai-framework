# State Sync After Feedback Scope Change — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-destructive `phasedev sync-state` command, defuse the destructive `reset-change` recovery hint, and teach the feedback template + orchestrator skill to keep artifacts and `state.json` consistent after a scope change.

**Architecture:** A new `sync-state` feature module in `src/features/phase-control` reuses `resolveRoute` and the exported `PHASE_RANK` to roll `state.json.activePhase` back to the artifact-derived phase (mirroring `reopen-phase`'s state write + baseline cleanup). The BLOCKED conflict message stops recommending `reset-change`. Template/skill/README updates are prompt-contract changes, no code.

**Tech Stack:** TypeScript, Bun (`bun test`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-10-state-sync-after-feedback-design.md`

## Global Constraints

- Invoke the `dev-core` skill before any code edit (repo CLAUDE.md hard gate).
- Root `src/` stays thin: new logic goes in `src/features/phase-control` / `src/entities`.
- Frozen contracts untouched: `state.json = { activePhase, activeIteration, repairCycleCount }`, phase routing, YAML keys, `config.yaml` shape.
- Every command supports `--json` via `reportCliResult`; exit code mirrors `ok`.
- Exported functions have explicit return types. Code/comments in English.
- Run focused tests first, full `bun test` + `npm run typecheck` at the end (Task 6).

---

### Task 1: `syncState` feature module

**Files:**
- Modify: `src/features/phase-control/state-route-consistency.ts` (export `PHASE_RANK`)
- Create: `src/features/phase-control/sync-state.ts`
- Test: `test/controller.test.ts` (new `describe("sync state", ...)` block, after the existing `describe("reopen phase", ...)` block around line 1781)

**Interfaces:**
- Consumes: `resolveRoute(projectPath, changeName?)` from `./flow-route`, `loadFlowState`/`saveFlowState`/`ActivePhase` from `../../entities/change/flow-state`, `resolveChangeDir` from `../../entities/change/active-change`, `buildChangePaths` from `../../entities/change/paths` (field `findingsBaselinePath`).
- Produces: `syncState(projectPath: string, changeName?: string): SyncStateResult` where `SyncStateResult = { ok: boolean; changed: boolean; message: string; fromPhase?: string; toPhase?: string }`. Also `PHASE_RANK` becomes an exported const of `state-route-consistency.ts`. Task 2 (CLI) and Task 3 rely on these exact names.

- [ ] **Step 1: Write the failing tests**

In `test/controller.test.ts`, add to the imports at the top:

```ts
import { syncState } from "../src/features/phase-control/sync-state";
```

Add a new describe block right after the `describe("reopen phase", ...)` block (it reuses the same file-local helpers `setupChange`, `writeArtifact`, `loadFlowState`):

```ts
describe("sync state", () => {
  function writeState(changeDir: string, phase: string, iteration: number | null = null) {
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: phase, activeIteration: iteration, repairCycleCount: 2 }, null, 2) + "\n",
      "utf-8"
    );
  }

  test("syncState rolls state.json back to the artifact-derived phase", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
    fs.rmSync(path.join(changeDir, "architecture", "design.md"));
    writeState(changeDir, "implementation", 1);
    fs.writeFileSync(path.join(changeDir, ".findings-baseline.json"), "{}", "utf-8");

    const result = syncState(testTmpDir);

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.fromPhase).toBe("implementation");
    expect(result.toPhase).toBe("technical_design");
    expect(result.message).toContain("implementation -> technical_design");

    const state = loadFlowState(testTmpDir);
    expect(state!.activePhase).toBe("technical_design");
    expect(state!.activeIteration).toBeNull();
    expect(state!.repairCycleCount).toBe(0);
    expect(fs.existsSync(path.join(changeDir, ".findings-baseline.json"))).toBe(false);
  });

  test("syncState is a no-op when state and route agree", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { designApproved: true, planApproved: true });
    writeState(changeDir, "implementation", 1);
    const before = fs.readFileSync(path.join(changeDir, "state.json"), "utf-8");

    const result = syncState(testTmpDir);

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.message).toContain("already consistent");
    expect(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8")).toBe(before);
  });

  test("syncState reports no active change", () => {
    const result = syncState(testTmpDir);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("No active change");
  });

  test("syncState does not modify any artifact files", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
    fs.rmSync(path.join(changeDir, "architecture", "design.md"));
    writeState(changeDir, "implementation", 1);
    const prdBefore = fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8");

    syncState(testTmpDir);

    expect(fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8")).toBe(prdBefore);
  });
});
```

Note: the first test mirrors the existing conflict tests at `test/controller.test.ts:1271-1305` — with `design.md` removed, `resolveRoute` derives `technical_design` while `state.json` says `implementation`. If `setupChange`'s defaults differ (e.g. design not approved by default), match the artifact setup used by those existing conflict tests exactly.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/controller.test.ts -t "sync state"`
Expected: FAIL — `Cannot find module '../src/features/phase-control/sync-state'`

- [ ] **Step 3: Export `PHASE_RANK` and implement `syncState`**

In `src/features/phase-control/state-route-consistency.ts:10`, change `const PHASE_RANK` to `export const PHASE_RANK` (keep the doc comment).

Create `src/features/phase-control/sync-state.ts`:

```ts
import * as fs from "fs";
import { ActivePhase, loadFlowState, saveFlowState } from "../../entities/change/flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { resolveRoute } from "./flow-route";
import { PHASE_RANK } from "./state-route-consistency";

export interface SyncStateResult {
  ok: boolean;
  changed: boolean;
  message: string;
  fromPhase?: string;
  toPhase?: string;
}

export function syncState(projectPath: string, changeName?: string): SyncStateResult {
  const state = loadFlowState(projectPath, changeName);
  if (!state) {
    return { ok: false, changed: false, message: "No active change. Run: phasedev create-change <name>." };
  }

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return { ok: false, changed: false, message: "Cannot locate active change directory." };
  }

  const route = resolveRoute(projectPath, changeName);
  const routePhase = route.phase as ActivePhase;
  if (PHASE_RANK[routePhase] >= PHASE_RANK[state.activePhase]) {
    return {
      ok: true,
      changed: false,
      fromPhase: state.activePhase,
      toPhase: routePhase,
      message: `state.json is already consistent (activePhase: ${state.activePhase}, artifact-derived: ${routePhase}). Nothing to sync.`
    };
  }

  const paths = buildChangePaths(changeDir);
  // The baseline would otherwise compare the findings table against a snapshot
  // from before this rollback, rejecting legitimate rework.
  fs.rmSync(paths.findingsBaselinePath, { force: true });

  saveFlowState(projectPath, { activePhase: routePhase, activeIteration: null, repairCycleCount: 0 }, changeName);

  return {
    ok: true,
    changed: true,
    fromPhase: state.activePhase,
    toPhase: routePhase,
    message: `Synced state.json: activePhase ${state.activePhase} -> ${routePhase} (activeIteration cleared, repairCycleCount reset). No artifacts were modified. Run: phasedev phase.`
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/controller.test.ts -t "sync state"`
Expected: 4 pass. Also run the neighboring suites to catch the `PHASE_RANK` export change: `bun test test/controller.test.ts` — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/sync-state.ts src/features/phase-control/state-route-consistency.ts test/controller.test.ts
git commit -m "feat: syncState non-destructively rolls state.json back to the artifact-derived phase"
```

---

### Task 2: CLI command `sync-state` + help

**Files:**
- Modify: `src/cli.ts` (new command block after the `reopen` block ending at line 682; import at top)
- Modify: `src/features/cli-help/render-help.ts` (new entry after the `reopen` entry at lines 146-149)
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `syncState(projectPath, changeName?): SyncStateResult` from Task 1; existing `runWithStateLock`, `reportCliResult`, `parseStringOption` plumbing in `cli.ts`.
- Produces: CLI command `phasedev sync-state [--project-path <path>] [--change <name>] [--json]` with JSON envelope `kind: "sync-state"`, `data: { changed, fromPhase, toPhase }`. Tasks 3-5 reference the command name `phasedev sync-state` in messages/templates/docs.

- [ ] **Step 1: Write the failing tests**

In `test/cli.test.ts` (near the reset-change tests around line 3023), add:

```ts
// --- sync-state ---

test("sync-state rolls state.json back and reports the transition", () => {
  const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
  fs.rmSync(path.join(changeDir, "architecture", "design.md"));
  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8"
  );

  const result = runCli(["sync-state", "--project-path", testTmpDir]);

  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("[PHASEDEV SYNC-STATE] OK");
  expect(result.output).toContain("implementation -> technical_design");
  const state = JSON.parse(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8"));
  expect(state.activePhase).toBe("technical_design");
});

test("sync-state --json reports changed and phases", () => {
  const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
  fs.rmSync(path.join(changeDir, "architecture", "design.md"));
  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8"
  );

  const result = runCli(["sync-state", "--project-path", testTmpDir, "--json"]);

  expect(result.exitCode).toBe(0);
  const envelope = JSON.parse(result.output);
  expect(envelope.ok).toBe(true);
  expect(envelope.kind).toBe("sync-state");
  expect(envelope.data.changed).toBe(true);
  expect(envelope.data.fromPhase).toBe("implementation");
  expect(envelope.data.toPhase).toBe("technical_design");
});

test("sync-state is a no-op when state and artifacts agree", () => {
  setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { designApproved: true, planApproved: true });

  const result = runCli(["sync-state", "--project-path", testTmpDir]);

  expect(result.exitCode).toBe(0);
  expect(result.output).toContain("already consistent");
});

test("help lists sync-state", () => {
  const result = runCli(["help"]);
  expect(result.output).toContain("phasedev sync-state");
});
```

Note: `test/cli.test.ts`'s `setupChange` writes approved prd/contract by default (`writeApproved`, line 248-253); adjust the state file the same way the existing reset-change/conflict tests in this file do. If `setupChange` here does not create `state.json`, write it explicitly as shown.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/cli.test.ts -t "sync-state"`
Expected: FAIL — output contains the unknown-command help text instead of `[PHASEDEV SYNC-STATE]`.

- [ ] **Step 3: Wire the command**

In `src/cli.ts`, add to the phase-control imports:

```ts
import { syncState } from "./features/phase-control/sync-state";
```

Insert after the `reopen` command block (after line 682):

```ts
  if (command === "sync-state") {
    runWithStateLock(projectPath, () => {
      const result = syncState(projectPath, changeName);
      const prefix = result.ok ? "[PHASEDEV SYNC-STATE] OK" : "[PHASEDEV SYNC-STATE] FAILED";
      reportCliResult(jsonMode, {
        ok: result.ok,
        kind: "sync-state",
        humanMessage: `${prefix}: ${result.message}`,
        jsonMessage: result.message,
        data: { changed: result.changed, fromPhase: result.fromPhase ?? null, toPhase: result.toPhase ?? null }
      });
    });
    return;
  }
```

In `src/features/cli-help/render-help.ts`, insert after the `reopen` entry (after line 149):

```
  phasedev sync-state [--project-path <path>] [--change <name>]
      Non-destructively roll state.json back to the artifact-derived phase when
      they disagree (e.g. after feedback reset artifact approvals). Artifacts
      are never modified.
      Side effects: modifies state.json; removes .findings-baseline.json.
```

(Match the surrounding indentation and blank-line style of the `reopen` entry exactly.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/cli.test.ts -t "sync-state"` and `bun test test/cli.test.ts -t "help lists"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/features/cli-help/render-help.ts test/cli.test.ts
git commit -m "feat: phasedev sync-state CLI command"
```

---

### Task 3: Reword the BLOCKED conflict message

**Files:**
- Modify: `src/features/phase-control/state-route-consistency.ts:44` (Recovery line)
- Test: `test/controller.test.ts:1271-1305` (extend the two existing conflict tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: the conflict message now names `phasedev sync-state` and never mentions `reset-change`. The orchestrator skill (Task 5) matches on the unchanged first line `state.json and the change artifacts disagree`.

- [ ] **Step 1: Extend the existing tests to assert the new message (failing)**

In `test/controller.test.ts`, in the test `"advance blocks when state.json phase and the artifact-derived route disagree"` (line 1271), add after the existing assertions:

```ts
    expect(result.message).toContain("phasedev sync-state");
    expect(result.message).not.toContain("reset-change");
```

In `"phase prompt blocks when state.json phase and the artifact-derived route disagree"` (line 1290), add:

```ts
    expect(result.prompt).toContain("phasedev sync-state");
    expect(result.prompt).not.toContain("reset-change");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/controller.test.ts -t "disagree"`
Expected: FAIL — message still contains `reset-change`.

- [ ] **Step 3: Reword the Recovery line**

In `src/features/phase-control/state-route-consistency.ts`, replace line 44:

```ts
    `Recovery: restore or remove the stale artifact, or reset state.json (phasedev reset-change), then retry.`
```

with:

```ts
    `Recovery: restore the stale artifact, or run \`phasedev sync-state\` to non-destructively roll state.json back to "${routePhase}", then retry.`
```

The new line must NOT contain the string `reset-change` in any form (the test asserts its absence so an agent can never pattern-match the destructive command out of this message).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/controller.test.ts -t "disagree"` — PASS.
Then check nothing else asserted the old wording: `grep -rn "reset state.json" src test templates` — expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/state-route-consistency.ts test/controller.test.ts
git commit -m "fix: BLOCKED conflict message recommends sync-state instead of destructive reset-change"
```

---

### Task 4: Clear error when `.phasedev/` is missing

**Files:**
- Modify: `src/entities/change/change-errors.ts` (new error class)
- Modify: `src/entities/change/active-change.ts:33-41` (throw it in `resolveChangeDir`)
- Modify: `src/cli.ts:874-902` (catch branch)
- Test: `test/cli.test.ts`

**Interfaces:**
- Consumes: `SYSTEM_DIR` from `src/entities/change/paths` (already imported in `active-change.ts`).
- Produces: `class MissingPhasedevDirError extends Error { readonly projectRoot: string }` exported from `change-errors.ts`; thrown by `resolveChangeDir` only when a `changeName` was given and `<projectRoot>/.phasedev` does not exist. CLI catch prints `[PHASEDEV] FAILED: No .phasedev directory found at <path>. Run from the project root or pass --project-path.` (JSON kind: `missing-phasedev-dir`).

- [ ] **Step 1: Write the failing test**

In `test/cli.test.ts` (near the other error-path tests):

```ts
test("--change outside a phasedev project explains the missing .phasedev directory", () => {
  const emptyDir = path.join(testTmpDir, "not-a-phasedev-project");
  fs.mkdirSync(emptyDir, { recursive: true });

  const result = runCli(["status", "--project-path", emptyDir, "--change", "some-change"]);

  expect(result.exitCode).toBe(1);
  expect(result.output).toContain("No .phasedev directory found at");
  expect(result.output).toContain("--project-path");
  expect(result.output).not.toContain("Unknown change");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli.test.ts -t "missing .phasedev"`
Expected: FAIL — output contains `Unknown change "some-change". Available changes: none.`
(If `status` with `--change` does not reach `resolveChangeDir` in this scenario, use `["check", ...]` instead — pick the command the existing UnknownChangeError tests in this file use.)

- [ ] **Step 3: Implement**

Append to `src/entities/change/change-errors.ts`:

```ts
export class MissingPhasedevDirError extends Error {
  constructor(readonly projectRoot: string) {
    super(`No .phasedev directory found at ${projectRoot}. Run from the project root or pass --project-path.`);
    this.name = "MissingPhasedevDirError";
  }
}
```

In `src/entities/change/active-change.ts`, import it alongside the other errors and change the unknown-name branch of `resolveChangeDir` (lines 33-41) to check for a missing `.phasedev` before throwing `UnknownChangeError`:

```ts
  if (changeName !== undefined) {
    if (names.includes(changeName)) {
      return path.join(projectRoot, SYSTEM_DIR, "changes", changeName);
    }
    if (findArchiveStateForChange(projectRoot, changeName)) {
      return null;
    }
    if (!fs.existsSync(path.join(projectRoot, SYSTEM_DIR))) {
      throw new MissingPhasedevDirError(projectRoot);
    }
    throw new UnknownChangeError(changeName, names);
  }
```

In `src/cli.ts`, import `MissingPhasedevDirError` next to the existing `UnknownChangeError` import and add a catch branch before the `UnknownChangeError` branch (line 888):

```ts
  } else if (error instanceof MissingPhasedevDirError) {
    if (globalJsonMode) {
      console.log(JSON.stringify({ ok: false, kind: "missing-phasedev-dir", message, data: { projectRoot: error.projectRoot } }));
    } else {
      console.error(`[PHASEDEV] FAILED: ${message}`);
    }
    process.exitCode = 1;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/cli.test.ts -t "missing .phasedev"` — PASS.
Run: `bun test test/multi-change.test.ts test/cli.test.ts` — all existing UnknownChange/Ambiguous tests still pass (they run inside a project that HAS `.phasedev`, so behavior is unchanged there).

- [ ] **Step 5: Commit**

```bash
git add src/entities/change/change-errors.ts src/entities/change/active-change.ts src/cli.ts test/cli.test.ts
git commit -m "fix: explain missing .phasedev directory instead of 'Unknown change ... none'"
```

---

### Task 5: Feedback template — cascading consistency check + sync-state

**Files:**
- Modify: `templates/feedback.md` (item 2 of the classification list, and the Completion section)
- Test: `test/cli.test.ts:3418` (`describe("feedback command")` — extend the existing render test)

**Interfaces:**
- Consumes: CLI command names from Tasks 1-2 (`phasedev sync-state`) and existing commands `validate-artifact`, `resolve-finding --resolution`, `set-iteration-status` (note: `resolve-finding` takes `--resolution <text>`, NOT `--evidence` — see `render-help.ts:168`).
- Produces: the rendered `phasedev feedback` contract instructs the cascade; asserted by tests on the CLI output.

- [ ] **Step 1: Extend the feedback render test (failing)**

In `test/cli.test.ts` inside `describe("feedback command")`, extend the assertions of `"feedback prints the feedback contract with live flow context"` (line 3422) — after its existing expectations add:

```ts
    expect(result.output).toContain("research_facts.md");
    expect(result.output).toContain("phasedev sync-state");
    expect(result.output).toContain("phasedev validate-artifact");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli.test.ts -t "feedback prints"`
Expected: FAIL — the current template never mentions `research_facts.md`.

- [ ] **Step 3: Update the template**

In `templates/feedback.md`, replace item 2 (lines 17-20):

```markdown
2. **Scope / design / plan feedback** (requirements change, different architecture, re-planning):
   - Walk the artifact chain IN THIS ORDER. For each artifact, first check whether the scope change affects it; update ONLY the affected ones:
     1. `prd.md` — apply the scope change.
     2. `execution_contract.md` — update if the contract is affected.
     3. `research_facts.md` — mandatory when prd.md changed: copy the new Intent values verbatim into the PRD Intent Trace and reconcile the Requirements & Success Criteria Trace with the new PRD R#/SC# IDs. Research new requirements honestly; never invent facts.
     4. `architecture/design.md` — update if it no longer covers the changed requirements (its validation depends on prd.md and research_facts.md).
     5. `iteration_plan.md` — update if it no longer reflects the work (including valid Check Evidence values; its validation depends on prd.md and design.md).
   - After each artifact you edit, run `phasedev validate-artifact <file>` and fix the reported issues until it passes.
   - Set `approved: false` on every artifact you changed so the flow re-enters approval.
   - Findings and iteration statuses: resolve findings obsoleted by the scope change with `phasedev resolve-finding <id> --resolution "obsoleted by scope change: <reason>"`; reset the status of completed iterations invalidated by the change with `phasedev set-iteration-status <id> <status>`. Never hand-edit validation_findings.md.
   - Do NOT write this kind of feedback into validation_findings.md.
```

Replace the Completion section (lines 27-29):

```markdown
Completion:
- If you set `approved: false` on any artifact, run `phasedev sync-state` FIRST — it non-destructively rolls state.json back to the artifact-derived phase (without it, `phasedev check` reports a state/route conflict).
- Run `phasedev check` after recording the feedback.
- Report: recorded finding IDs, changed artifacts and their approval status, whether sync-state changed the phase, and the `phasedev check` result.
```

Keep the rest of the template (items 1 and 3, write boundary, flow context) unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/cli.test.ts -t "feedback"` — PASS.
Also run `bun test test/template-validator-drift.test.ts test/code-fences.test.ts` — template lint suites still pass.

- [ ] **Step 5: Commit**

```bash
git add templates/feedback.md test/cli.test.ts
git commit -m "feat: feedback contract cascades artifact consistency and ends with sync-state"
```

---

### Task 6: Orchestrator skill + README docs, full verification

**Files:**
- Modify: `skills/phasedev-orchestrator/SKILL.md` (commands list ~line 36-40; "User Feedback Handling" ~line 146)
- Modify: `README.md` (Flow Control table ~line 124; reset-change row line 151)
- Test: existing suites only (`test/skill-md-drift.test.ts` guards SKILL.md route-kind tokens; no new tokens are introduced)

**Interfaces:**
- Consumes: command name `phasedev sync-state` (Task 2) and the conflict message's first line `state.json and the change artifacts disagree` (unchanged by Task 3).
- Produces: docs only.

- [ ] **Step 1: Update SKILL.md commands list**

In `skills/phasedev-orchestrator/SKILL.md`, after the `phasedev feedback` bullet (line 36), add:

```markdown
- `phasedev sync-state --change <change>` — non-destructively roll `state.json` back to the artifact-derived phase after feedback reset artifact approvals. This is the ONLY correct fix for a `state.json and the change artifacts disagree` blocker; NEVER use `reset-change` for it — `reset-change` moves the entire change to `.trash`.
```

- [ ] **Step 2: Update the feedback-handling loop rule**

In the same file, extend the paragraph at line 146 ("After the fast path or the sub-agent return, run `phasedev check` ...") by appending:

```markdown
If `phasedev check` reports `state.json and the change artifacts disagree`, the feedback sub-agent forgot its final sync: run `phasedev sync-state --change <change>` yourself (deterministic, no sub-agent, never `reset-change`), then re-run `phasedev check`. After a scope change the loop legitimately resumes from an earlier phase (approval gates for the re-edited artifacts) — that is normal convergence, not a failure.
```

- [ ] **Step 3: Update README command tables**

In `README.md` Flow Control table, add after the `reopen` row (line 124):

```markdown
| `phasedev sync-state [--project-path <path>] [--change <name>]` | Non-destructively roll `state.json` back to the artifact-derived phase when they disagree (artifacts untouched) |
```

Change the `reset-change` row (line 151) description to:

```markdown
| `phasedev reset-change [--project-path <path>] [--yes\|--force]` | Discard the active change (move to `.trash`). Destroys all change artifacts — NOT a state reset; use `sync-state` for that |
```

- [ ] **Step 4: Run the full verification**

```bash
bun test
npm run typecheck
```

Expected: all tests pass (including `skill-md-drift` and `template-validator-drift`), typecheck clean. Report any failure honestly and fix before committing.

- [ ] **Step 5: CLI smoke test**

```bash
cd /tmp && rm -rf phasedev-smoke && mkdir phasedev-smoke
phasedev init-project --project-path /tmp/phasedev-smoke
phasedev create-change --project-path /tmp/phasedev-smoke my-change
phasedev sync-state --project-path /tmp/phasedev-smoke
phasedev status --project-path /tmp/phasedev-smoke --change no-such-change; echo "exit: $?"
```

Expected: `sync-state` reports "already consistent" (fresh change: state and route both `change_intake`); the last command prints `Unknown change` (project HAS `.phasedev`); running the same `status` against a dir without `.phasedev` prints the new `No .phasedev directory found` message.

- [ ] **Step 6: Commit**

```bash
git add skills/phasedev-orchestrator/SKILL.md README.md
git commit -m "docs: orchestrator sync-state recovery rule and README command updates"
```
