# B25 + B26 — Standalone `archive` Command & Auto-Approval Validation Blocker — Design

**Date:** 2026-07-15
**Status:** Approved (both designs fully resolved and explicitly approved by the user in-conversation,
including explicit approval to change the frozen "Behavior To Preserve" / "Archive Phase" contracts and
their docs).
**Repository:** PhaseDev AI Framework (TypeScript + Bun)
**Base branch:** `develop`
**Frozen contracts touched (pre-approved this conversation):** "Archive Phase" (archive mutation moves
out of `advance` into a dedicated command), "Behavior To Preserve" (autoApprove no longer auto-stamps),
plus the matching docs (`AGENTS.md`, `README.md`, `skills/phasedev-orchestrator/SKILL.md`).

---

## 1. Problem

Two independent bugs, one design cycle.

### B25 — Archive is welded into `advance`

The archive mutation (move change dir → `.phasedev/changes/archive/<date>-<name>`, write
`.phase-archive.json` `in_progress`, set `state.json` `activePhase: archive`) is performed *inside*
`advance`:

- `advance-flow.ts` `archive_ready` branch (lines 368–399): checks `runArchiveStage`, checks
  `commitGateBlocks`, removes the findings baseline, calls `startArchiveStage`, returns
  `ok(state, "Advanced to archive phase. Run: phasedev phase …")`.
- `advance-flow.ts` pre-move crash recovery (lines 257–274).
- `quick-advance.ts` duplicates all of this for quick mode: the archive-state block (lines 44–62:
  resume + crash-recovery + completion) and the `quick_spec_revision → archive` mutation (lines 75–83).

Consequences: `advance` conflates "step the phased flow forward" with "run the terminal archive
side-effect"; the archive resume/crash-recovery logic is duplicated across two files; and `advance`'s
success message *points the operator at archive* on every clean completion. The user wants archiving to
be an explicit, separately-invoked step and wants `advance` to say **nothing** about archive.

### B26 — Auto-approval rubber-stamps un-reviewed artifacts

When `autoApprove: true`, `advance` itself deterministically stamps `approved: true` on the gated
artifacts (`advance-flow.ts` lines 300–313, calling `approveArtifact(path, "PhaseDev autoApprove")`) and
re-resolves the route. Nothing ever *reads* the artifact content: a structurally-valid-but-wrong
`design.md` sails through the gate. `autoApprove` was meant to remove a human wait, not remove review.
The approval should instead be performed by a dedicated validation sub-agent that reads each artifact's
content and judges it on the merits, approving only genuinely-good artifacts.

---

## 2. Goals / Non-Goals

**Goals**

- B25: a new `phasedev archive <change-name>` CLI command owns the entire archive lifecycle
  (mutation, resume, pre-move crash recovery, readiness/commit/disabled refusals) for both Standard
  and Quick changes. `advance` performs **no** archive work and mentions archive **nowhere** on the
  normal completion path.
- B25: the mutation core (`startArchiveStage`, archive-state entities) is unchanged and shared; the new
  command is a thin feature+CLI wrapper. No new root scripts.
- B26: under `autoApprove`, `advance` stops auto-stamping and instead returns a distinct
  auto-approval **blocker whose text is the instruction** to spawn a content-reading validation
  sub-agent that approves via `phasedev approve <file> --by "auto-approve-subagent"`.
- B26: a minimal integrity check — under `autoApprove`, an `approved: true` with empty/missing
  `approved_by` is not trusted and re-emits the auto-approval blocker.
- Docs and the orchestrator skill updated to match; `autoApprove: false` (default) behavior unchanged.

**Non-Goals**

- No change to `startArchiveStage`, `archive-state`, `resolveRoute`, Standard/Quick *phase* routing,
  the archive contract template, orphan checks, or `check-archive`. `resolveRoute` stays pure.
- No new config keys, no new persistent files, no change to `approveArtifact`'s frontmatter format.
- No change to `autoApprove: false` manual-approval behavior.
- Quick routing sequence (`quick_plan → … → quick_spec_revision → archive`) is preserved; only *who*
  performs the `→ archive` mutation moves (from `quickAdvance` to the archive command).

---

## 3. Key insight that bounds the risk

`phasedev archive <change>` reproduces **exactly** the post-state that `advance`'s `archive_ready`
branch produces today — same `startArchiveStage` call, same commit-gate, same findings-baseline
removal, same `state.json`/`.phase-archive.json` result. The *only* behavioral change is **which
command triggers the mutation**. Therefore everything downstream of the mutation — the archive phase
contract (`getPhasePrompt` → `renderArchiveContract`), pending-archive resume, completion detection,
orphan checks, `check-archive`, `findPendingArchiveState` `--change` scoping — is **untouched**. The
`advance` change is pure *removal* plus a terminal message. Most existing archive tests migrate by
swapping the trigger `advance → runArchive` with minimal assertion edits.

---

## 4. Architecture — B25 (`phasedev archive <change-name>`)

### 4.1 New feature module

`src/features/phase-control/archive-command.ts` (next to `archive-stage.ts`), exporting:

```ts
export interface ArchiveCommandResult {
  ok: boolean;        // false ⇒ refused/blocked
  done: boolean;      // archive fully complete (terminal success)
  started: boolean;   // mutation or resume performed; archive contract now available via phasedev phase
  message: string;
  reason?: string;    // short reason on refusal (for reportCliResult)
}

export function runArchive(projectPath: string, config: Config, changeName: string): ArchiveCommandResult;
```

`changeName` is **required** (the CLI enforces the positional). `runArchive` consolidates the archive
logic removed from `advance-flow.ts` and `quick-advance.ts`.

**Algorithm** (mode-aware, mirrors the two removed code paths):

1. `if (!config.runArchiveStage)` → refuse `"Archive is disabled (runArchiveStage=false)."`.
2. Load flow state (`loadFlowState(projectPath, changeName)`).
   - No active state: if `findCompletedArchiveState(projectPath, changeName)` → `done("Archive complete
     for <change>. Flow finished.")`; else refuse `"No change named <change> to archive."`
     (`resolveChangeDir` throwing `UnknownChangeError`/`AmbiguousChangeError` propagates to the CLI's
     top-level handler, same as other commands).
3. **Already inside the archive lifecycle** (`state.activePhase === "archive"`), for either mode:
   - `findInvalidArchiveState` → refuse with its reason.
   - Pre-move crash (still-active `changeDir`, `readArchiveState` `in_progress` && `!movedAt`) →
     `startArchiveStage(...)`; blocked ⇒ refuse; else `started` "recovered from pre-move crash".
   - `findPendingArchiveState` (moved, `in_progress`) → if `checkArchiveCompletion(archivePath).ok` →
     `done`; else `started` "Archive in progress. Run: phasedev phase --change <change> for the archive
     contract, execute it, then rerun phasedev archive <change>."
   - `findCompletedArchiveState` → `done`.
4. **Quick change at its terminal** (`state.flowMode === "quick"`):
   - `state.activePhase === "quick_spec_revision"` → `startArchiveStage(projectPath, changeDir, new
     Date(), config)`; blocked ⇒ refuse; else `started`. (No commit-gate, no baseline removal — exactly
     the removed `quick-advance.ts` lines 75–83; the commit gate already fired at `quick_implementation`.)
   - any earlier quick phase → refuse `"Change <change> has not reached the final quick phase
     (quick_spec_revision); nothing to archive yet."`
5. **Standard change**: `route = resolveRoute(projectPath, changeName, config.blockingSeverity)`:
   - `archive_ready` → commit-gate: `if (commitGateBlocks) return refuse(finalCommitBlocker(...))`;
     `fs.rmSync(paths.findingsBaselinePath, { force: true })`; `startArchiveStage(...)`; blocked ⇒
     refuse; else `started`. (Exactly the removed `advance-flow.ts` lines 369–398.)
   - `archive_readiness_blocked` → refuse via `archiveReadinessBlocker(...)`.
   - `invalid_archive_state` / `pending_archive` → handled by step 3 already (state is `archive`);
     defensively map to refuse/started here too.
   - any other route (flow not at the archive boundary) → refuse `"Change <change> has not reached
     final validation; nothing to archive yet (current route: <route.kind>)."`

`runArchive` imports only from entities/shared and sibling phase-control modules
(`startArchiveStage`, `resolveRoute`, `check-archive`, `advance-shared.commitGateBlocks`,
`prompt-blockers`) — dependency direction preserved; no new cross-feature cycle.

### 4.2 CLI wiring (`src/cli.ts`)

- `handleArchive(ctx)`: read the positional via `firstPositional(ctx.args)` (same pattern as
  `handleCreateChange`). Missing ⇒ usage error
  `"[PHASEDEV ARCHIVE] FAILED: <change-name> is required.\nUsage: phasedev archive <change-name>
  [--project-path <path>]"`. Otherwise `runWithStateLock(ctx.projectPath, () => { const r =
  runArchive(ctx.projectPath, config, name); reportCliResult(..., kind: "archive", ok: r.ok,
  humanMessage: r.message, data: { done: r.done, started: r.started }); })`.
- Register `archive: handleArchive` in `COMMANDS`.
- `--change` is not consulted for this command (positional name is authoritative); document that.

### 4.3 `advance` after B25 (removal only)

- **Standard** (`advance-flow.ts`):
  - Delete the pre-move crash-recovery block (lines 257–274).
  - Replace the whole `archive_ready` branch (369–399) with
    `return done("Final validation passed. Flow complete.");` — **no archive word, no pointer**.
  - `archive_readiness_blocked` branch: reword to iteration-completion language, no "archive" word,
    e.g. `refuse("Final validation reported ready, but not every iteration is completed / some
    iterations still have open readiness blockers. Complete each iteration and mark it [x] in
    iteration_plan.md, then run advance again.")`.
  - `pending_archive`: remove from `ADVANCEABLE_ROUTE_KINDS`; add to `NON_ADVANCEABLE_ROUTE_KIND_CHECK`;
    the `routeToState` `pending_archive` case is deleted (it becomes unreachable in advance).
  - `state.activePhase === "archive"` early handling (the `locateChangeDir` null branch at 246–255):
    keep the honest terminals — `findCompletedArchiveState → done` (Assumption A1) — but advance no
    longer *recovers* or *resumes* archive.
- **Quick** (`quick-advance.ts`):
  - Delete the entire `state.activePhase === "archive"` block (44–62).
  - Replace the `quick_spec_revision` mutation block (75–83) with `return done("Quick flow complete.
    Final quick phase reached.");` — no archive word.

### 4.4 Assumptions (B25 edge policy)

- **A1 (core, certain):** the "advance says NOTHING about archive" mandate is enforced on the forward
  completion path — `archive_ready` (Standard) and `quick_spec_revision` (Quick) both return a
  `done(...)` terminal message with no archive reference. The pre-existing
  `findCompletedArchiveState → done("Archive complete. Flow finished.")` terminals (fired only when the
  archive is *already fully done*) are retained as honest terminal reports the orchestrator relies on;
  they are not a hint toward archiving. If the user wants even those stripped, it is a one-line follow-up.
- **A2 (edge, assumption):** for a change *already inside* the archive lifecycle
  (`state.activePhase === "archive"`, or a `pending_archive`/`invalid_archive_state` route) — a state
  only reachable *after* `phasedev archive` has already run — `advance` no longer resumes/recovers it.
  In the new orchestrator loop `advance` is never called there (the orchestrator switches to
  `phasedev archive`). The generic existing refusals ("Cannot locate change directory …") remain for a
  stray manual `advance`; use `phasedev archive <change>` instead. Documented, low-impact.

---

## 5. Architecture — B26 (auto-approval validation blocker)

### 5.1 New blocker (`src/features/phase-control/prompt-blockers.ts`)

```ts
export function autoApprovalBlocker(
  phase: Phase, title: string, artifactPaths: string[], changeName?: string
): Prompt
```

Text (a controller stop message — allowed to carry instructions; frozen skill-policy contract only bars
*external skill policy* in blockers, which this has none of):

- `[FLOW CONTROLLER] BLOCKED: <title> — auto-approval requires content review`
- Lists each artifact path (as file URLs) — the concrete files for this phase.
- Instructs the orchestrator to **spawn one dedicated validation sub-agent** that:
  (a) reads the full content of each listed artifact;
  (b) evaluates each on the merits against the phase contract — completeness, coherence, fidelity to
  the original task — **not merely `phasedev check`**;
  (c) approves only genuinely-good artifacts via
  `phasedev approve <file> --by "auto-approve-subagent" --change <change>`;
  (d) on any problem, does **not** approve, and returns concrete findings so the orchestrator re-runs
  the owning phase sub-agent and retries.
- States the orchestrator MUST NOT approve manually without this sub-agent review, then rerun
  `phasedev advance --change <change>`.

Phase → artifact-path mapping (same as today's auto-stamp targets):
- `change_intake_approval` → `[prdPath, executionContractPath]`
- `technical_design_approval` → `[designPath]`
- `iteration_planning_approval` → `[iterationPlanPath]`

### 5.2 `advance` changes (`advance-flow.ts`)

- **Delete** the auto-stamp block (300–313) and its trailing `route = resolveRoute(...)` re-resolve.
- In each `*_approval` handler (342–356): branch on `config.autoApprove`:
  - `autoApprove` → return `autoApprovalBlocker(phase, <title>, <paths>, changeName)`.
  - else → return the existing `approvalBlocker(...)` (unchanged manual path).
- **Integrity check** (B26.2): after the `*_approval` handlers (i.e. the route has *passed* every gate),
  `if (config.autoApprove)` scan the four approval artifacts. For each that **exists** and is
  `approved: true`, require non-empty `approved_by`; on the first violation, return
  `autoApprovalBlocker(state.activePhase-relevant phase, "Approval integrity", [offendingPath], changeName)`
  and do not advance.

**Exact B26.2 semantics (documented):** under `autoApprove`, "approved" means `approved: true` **and**
`approved_by` non-empty. `resolveRoute`'s approval predicates (`isSetupApproved` / `isDesignApproved` /
`isPlanApproved`) still check only `approved: true`, so an `approved: true` + empty `approved_by`
passes the route gate; the integrity scan re-blocks it. Rationale: under `autoApprove` every approval
must have been performed by the validation sub-agent, which always passes `--by`; a bare `approved: true`
means an un-reviewed approval and must be re-gated. Minimal: no new files, no new config.

### 5.3 New entity helper (`src/entities/change/approval.ts`)

Add a small pure reader co-located with the existing approval predicates:

```ts
export function approvedByValue(artifactPath: string): string | null; // trimmed approved_by, or null
```

Used by the integrity scan. Keeps frontmatter parsing at the entity boundary; `advance-flow` holds only
the policy loop.

### 5.4 Quick mode

Quick phases have no `*_approval` routes; B26 does not touch `quick-advance.ts`.

---

## 6. Files touched

**Production**
- NEW `src/features/phase-control/archive-command.ts` — `runArchive` + `ArchiveCommandResult`.
- MODIFY `src/features/phase-control/advance-flow.ts` — remove archive mutation, crash-recovery,
  `pending_archive` from advanceable set; `archive_ready`/`archive_readiness_blocked` reworded;
  remove auto-stamp; wire `autoApprovalBlocker` + integrity scan.
- MODIFY `src/features/phase-control/quick-advance.ts` — remove archive block + mutation; return
  archive-free `done(...)`.
- MODIFY `src/features/phase-control/prompt-blockers.ts` — add `autoApprovalBlocker`.
- MODIFY `src/entities/change/approval.ts` — add `approvedByValue`.
- MODIFY `src/cli.ts` — `handleArchive`, register `archive`.
- (No change to `archive-stage.ts`, `flow-route.ts`, `approve-artifact.ts`, `config.ts`.)

**Tests** (see §8)
- MODIFY `test/controller.test.ts`, `test/cli.test.ts`, `test/e2e-flow.test.ts`,
  `test/multi-change.test.ts`, `test/advance-commit-gate.test.ts`.
- NEW `test/archive-command.test.ts` (feature-level `runArchive`), plus prompt-blocker + integrity cases
  (may live in `controller.test.ts` or a small new file).

**Docs / contract**
- MODIFY `AGENTS.md` (CLAUDE.md is a symlink to it — edit `AGENTS.md`): "Archive Phase" section
  (mutation now via `phasedev archive`, not `advance`; resume/crash-recovery owned by the command);
  "Behavior To Preserve" (autoApprove no longer auto-stamps; emits auto-approval blocker); "Commands"
  smoke list add `phasedev archive`.
- MODIFY `README.md` — command reference (add `archive <change-name>`), the "Repeat phase/check/advance
  until archived" loop text, the mermaid flow diagram (advance no longer archives), the archive step
  (§8 of the phase list), the `autoApprove` config comment.
- MODIFY `skills/phasedev-orchestrator/SKILL.md` — rewrite "## Auto-Approval" (validation sub-agent
  discipline; recommend `general-purpose`, `model: sonnet` minimum / `opus` for high-stakes, per the
  repo delegation rules; orchestrator never runs manual approve under autoApprove) and "## Archive
  Handling" + "## Termination" (archive via `phasedev archive <change>`; advance `finished=true` now
  means final validation passed, not archived).

---

## 7. Edge cases

- **Resume / crash-recovery ownership:** now solely the archive command's (§4.1 step 3). `advance` no
  longer recovers (A2).
- **Non-existent / wrong change name:** `runArchive` → `resolveChangeDir` throws
  `UnknownChangeError` (lists available) / `AmbiguousChangeError`, surfaced by the CLI top-level
  handler exactly like other commands.
- **Multi-change scoping:** the positional name is passed straight through as `changeName` to
  `resolveChangeDir` / `resolveRoute` / archive-state finders — same scoping used by `--change`
  elsewhere; concurrent changes are isolated by the state lock.
- **`runArchiveStage: false`:** archive command refuses `"Archive is disabled (runArchiveStage=false)."`;
  `advance` says nothing (it just reports "Flow complete").
- **Quick-mode archive removal:** the `quick_spec_revision → archive` mutation and quick archive
  resume/recovery move wholesale into `runArchive`; `startArchiveStage` already preserves `flowMode`,
  so the archived quick change stays `flowMode: quick`.
- **autoApprove + `approved_by` semantics:** `approved: true` with empty/missing `approved_by`
  re-emits the auto-approval blocker (§5.2). `approved: true` + non-empty `approved_by` passes.
- **What `phasedev phase` shows after "Flow complete" but before archiving:** because `advance` does
  **not** mutate state at `archive_ready`, `state.json` stays at `final_validation` (verdict `ready`,
  approved). `getPhasePrompt` re-renders the (passed) final-validation contract idempotently. The
  orchestrator must invoke `phasedev archive`, **not** `phasedev phase`, at this point — documented in
  SKILL.md "## Archive Handling".
- **Commit gate before archive:** the `finalCommitBlocker` gate moves from `advance` into `runArchive`
  (Standard `archive_ready` path). `advance-commit-gate.test.ts` must assert it fires on
  `phasedev archive`, and that `advance` reaches "Flow complete" without the gate.

---

## 8. Testing strategy

TDD: write/adjust the failing test, then implement. Run focused files per task, full `bun test` +
`npm run typecheck` at the end.

**Migrate (trigger swap `advance → phasedev archive`/`runArchive`, assertions mostly intact):**
- `test/controller.test.ts` archive suite (~1205–1939): each test that drives `advanceFlow` to
  `archive_ready` and asserts the mutation/`.phase-archive.json`/`state.json activePhase: archive` →
  call `runArchive` instead. Add: `advanceFlow` at `archive_ready` now returns `done("Final validation
  passed. Flow complete.")` and does **not** mutate/mention archive. Pre-move crash-recovery tests →
  moved to `runArchive`.
- `test/controller.test.ts` autoApprove suite (~1496–1521): flip from "advance stamps `approved: true`
  / `approved_by: PhaseDev autoApprove`" to "advance returns the auto-approval blocker; nothing
  stamped". Add integrity cases: `approved: true` + empty `approved_by` re-blocks; + non-empty passes.
- `test/cli.test.ts` (~1877–1929, ~1116–1129): advance-archive CLI assertions → new
  `phasedev archive` command assertions (missing positional usage error; happy-path mutation; blocked
  exit code). Keep advance CLI test asserting the archive-free "Flow complete" message.
- `test/e2e-flow.test.ts` (~776, 941, 1189, 1305): full-flow drivers that archive via `advance` → drive
  final `advance` to "Flow complete", then `phasedev archive <change>` to mutate, then archive sub-agent
  simulation + `phasedev archive` again → `done`. Assert no archive wording from `advance`.
- `test/multi-change.test.ts` (~278–502): archive-via-advance scoping → archive-via-command scoping;
  assert `phasedev archive <name>` archives only the named change; wrong name → `UnknownChangeError`.
- `test/advance-commit-gate.test.ts` (~327): the pre-archive `finalCommitBlocker` now fires in
  `phasedev archive`, not `advance`; assert both (advance clean-completes; archive command blocks until
  committed).

**New:**
- `test/archive-command.test.ts` — `runArchive` unit/behavior matrix: `archive_ready` mutation;
  `runArchiveStage:false` refusal; `archive_readiness_blocked` refusal; `pending_archive` resume;
  pre-move crash recovery; not-at-boundary refusal; unknown-change error; already-completed → `done`;
  Quick change at `quick_spec_revision` → mutation; Quick change earlier-phase → refusal.
- Auto-approval blocker text tests (in `controller.test.ts` or a small new file): each phase lists the
  right artifact paths; instructs the validation sub-agent + `--by "auto-approve-subagent"`; forbids
  manual approve.

---

## 9. Rollout / verification

Per-task focused `bun test <file>`; final task: full `bun test`, `npm run typecheck`, and a CLI smoke
(`init` → `create-change` → drive to final validation → `advance` shows "Flow complete" →
`phasedev archive <name>` → `phasedev phase` archive contract → complete → `phasedev archive <name>`
→ `done`). Commit design + plan, then implement per the plan; commit after each task; do not push.
