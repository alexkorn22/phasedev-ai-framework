# B25 + B26 — Standalone `archive` Command & Auto-Approval Validation Blocker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (or
> `superpowers:executing-plans`) to run this plan task-by-task. Steps use `- [ ]` checkboxes.
> **Every coding task MUST invoke the `dev-core` skill before writing or editing any code**, and every
> coding delegation prompt MUST carry the same `dev-core` instruction.

**Goal:** (B25) move the archive mutation out of `advance`/`quickAdvance` into a new standalone
`phasedev archive <change-name>` command that owns the whole archive lifecycle for Standard and Quick
changes, leaving `advance` archive-free and archive-silent; (B26) stop `autoApprove` from auto-stamping
approvals and instead emit an auto-approval blocker instructing a content-reading validation sub-agent,
plus a minimal `approved_by` integrity gate.

**Design doc (read first):**
`docs/superpowers/specs/2026-07-15-b25-b26-archive-command-and-autoapprove-blocker-design.md`

**Tech stack:** TypeScript, Bun test runner. Repo root `/Users/oleksandr/WORK/ag-dev-flow`. Run all
commands from repo root. Base branch `develop`.

## Key insight (read before editing)

`phasedev archive <change>` must reproduce the **exact** post-state of `advance`'s current
`archive_ready` branch (same `startArchiveStage`, commit-gate, baseline removal). Only the *trigger*
command moves. Everything downstream of the mutation (archive contract, resume, completion detection,
orphan checks, `check-archive`, `--change` scoping) is untouched. The `advance` changes are pure
*removal* + a terminal message.

## Global constraints

- CLAUDE.md/AGENTS.md is the binding contract. Logic only in `src/features` / `src/entities` /
  `src/shared`; root `src/` stays thin. Dependency direction: entrypoints → features → entities/shared;
  `feature → feature` acyclic. No new root scripts. `resolveRoute` and `startArchiveStage` MUST stay
  unchanged.
- The "Archive Phase" and "Behavior To Preserve" contract changes and their doc edits are **pre-approved
  this conversation** (design doc §1 header). Do NOT change any other frozen contract (`ready_with_risks`
  semantics, YAML keys, `state.json` shape, iteration-heading format, Quick routing sequence, the
  `sync-state` archive carve-out).
- Explicit return types on exported functions; self-documenting code; minimal comments; English only.
- Approval/blocker prompts stay free of external skill policy (the auto-approval blocker's instruction
  text is the controller's own stop message — allowed).
- Focused `bun test <files>` per task; final task runs full `bun test` + `npm run typecheck` + CLI smoke.
- Commit after each task; end every commit message with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  Do NOT push. Work on branch `develop` (or a feature branch off it if the executor prefers isolation).

## File map (new / modified)

- NEW `src/features/phase-control/archive-command.ts` — `runArchive` + `ArchiveCommandResult` (Task A1).
- MODIFY `src/features/phase-control/prompt-blockers.ts` — `autoApprovalBlocker` (Task C1).
- MODIFY `src/entities/change/approval.ts` — `approvedByValue` (Task C1).
- MODIFY `src/features/phase-control/advance-flow.ts` — remove archive + auto-stamp; add blocker +
  integrity (Tasks A2, C2).
- MODIFY `src/features/phase-control/quick-advance.ts` — remove archive (Task A2).
- MODIFY `src/cli.ts` — `handleArchive`, register command (Task A3).
- NEW `test/archive-command.test.ts` (Task B1); MODIFY the migration test files (Tasks B2, D2).
- Docs: `AGENTS.md`, `README.md`, `skills/phasedev-orchestrator/SKILL.md` (Task E1).

---

# Group A — B25 production

## Task A1: `runArchive` feature module (mutation core wrapper)

- [ ] Invoke `dev-core`. Read design §4.1.
- [ ] Create `src/features/phase-control/archive-command.ts` exporting `ArchiveCommandResult` and
      `runArchive(projectPath: string, config: Config, changeName: string): ArchiveCommandResult`.
- [ ] Implement the mode-aware algorithm (design §4.1 steps 1–5), reusing (do not reimplement):
      `startArchiveStage`, `resolveRoute`, `checkArchiveCompletion`, `commitGateBlocks`,
      `findPendingArchiveState` / `findCompletedArchiveState` / `findInvalidArchiveState` /
      `readArchiveState`, `resolveChangeDir`, `loadFlowState`, `buildChangePaths`,
      `archiveReadinessBlocker` / `finalCommitBlocker`.
- [ ] Standard `archive_ready` path must be byte-for-byte behavior-equivalent to the removed
      `advance-flow.ts` 369–398 (commit-gate refuse → baseline `rmSync` → `startArchiveStage` → blocked
      refuse / started). Quick path equivalent to removed `quick-advance.ts` 75–83 (no commit-gate, no
      baseline removal).
- [ ] `done`/`started`/refuse helpers local to the module (mirror `advance-flow`'s `done`/`refuse`
      shape adapted to `ArchiveCommandResult`).
- [ ] **Verify:** `npm run typecheck` clean (tests come in Group B).

## Task A2: strip archive from `advance` and `quickAdvance`

- [ ] Invoke `dev-core`. Read design §4.3.
- [ ] `advance-flow.ts`:
  - Delete pre-move crash-recovery block (257–274).
  - Replace `archive_ready` branch (369–399) with `return done("Final validation passed. Flow complete.");`.
  - Reword `archive_readiness_blocked` branch to iteration-completion language, no "archive" word
    (design §4.3).
  - Remove `pending_archive` from `ADVANCEABLE_ROUTE_KINDS`; add it to
    `NON_ADVANCEABLE_ROUTE_KIND_CHECK`; delete the `pending_archive` case in `routeToState`.
  - Remove now-unused imports (`startArchiveStage`, `readArchiveState`, `fs`/`path` if no longer used,
    `finalCommitBlocker`/`archiveReadinessBlocker` if no longer referenced — check first). Keep
    `findCompletedArchiveState`/`findInvalidArchiveState` for the retained terminals (A1/A2 policy).
- [ ] `quick-advance.ts`:
  - Delete the `state.activePhase === "archive"` block (44–62).
  - Replace the `quick_spec_revision` mutation block (75–83) with
    `return done("Quick flow complete. Final quick phase reached.");`.
  - Remove now-unused imports (`startArchiveStage`, `checkArchiveCompletion`,
    `findPendingArchiveState`/`findCompletedArchiveState`/`readArchiveState`, `commitGateBlocks` if
    unused, `fs` if unused).
- [ ] **Verify:** `npm run typecheck` clean; `NON_ADVANCEABLE_ROUTE_KIND_CHECK` still typechecks
      (totality proof). Focused: `bun test test/controller.test.ts` will now have failures — expected,
      fixed in Group B.

## Task A3: CLI `archive` command

- [ ] Invoke `dev-core`. Read design §4.2.
- [ ] Add `handleArchive(ctx)` in `src/cli.ts`: positional via `firstPositional(ctx.args)`; missing ⇒
      usage-error `reportCliResult` (kind `"archive"`, `ok: false`); else `runWithStateLock` →
      `runArchive` → `reportCliResult` (kind `"archive"`, `ok: r.ok`, `humanMessage: r.message`,
      `jsonMessage: r.reason ?? r.message`, `data: { done: r.done, started: r.started }`).
- [ ] Register `archive: handleArchive` in `COMMANDS`.
- [ ] **Verify:** `bun run src/cli.ts archive` (no name) prints the usage error; `npm run typecheck`.

---

# Group B — B25 tests

## Task B1: new `runArchive` behavior matrix

- [ ] Invoke `dev-core` + `superpowers:test-driven-development`.
- [ ] Create `test/archive-command.test.ts` covering (AAA): `archive_ready` mutation (dir moved,
      `.phase-archive.json` `in_progress`, `state.json activePhase: archive`); `runArchiveStage:false`
      refusal; `archive_readiness_blocked` refusal; `pending_archive` resume (`started`, then `done`
      once `.phase-archive.json` = completed); pre-move crash recovery; not-at-boundary refusal;
      unknown-change error (throws `UnknownChangeError`); already-completed → `done`; Quick
      `quick_spec_revision` → mutation (preserves `flowMode: quick`); Quick earlier-phase → refusal.
- [ ] **Verify:** `bun test test/archive-command.test.ts` green.

## Task B2: migrate existing archive/advance tests

- [ ] Invoke `dev-core`. For each file, swap the archive trigger and update assertions per design §8:
  - `test/controller.test.ts` archive suite (~1205–1939) + pre-move crash tests → drive via
    `runArchive`; add `advanceFlow` at `archive_ready` returns `done("Final validation passed. Flow
    complete.")` and does not mutate/mention archive.
  - `test/cli.test.ts` (~1877–1929, ~1116–1129) → `phasedev archive` command assertions; keep an
    advance test asserting the archive-free "Flow complete" message.
  - `test/e2e-flow.test.ts` (~776, 941, 1189, 1305) → final `advance` = "Flow complete", then
    `phasedev archive <change>` mutate → archive sub-agent simulation → `phasedev archive` = `done`.
  - `test/multi-change.test.ts` (~278–502) → archive-via-command scoping; wrong name →
    `UnknownChangeError`.
  - `test/advance-commit-gate.test.ts` (~327) → `finalCommitBlocker` now fires in `phasedev archive`;
    `advance` clean-completes.
- [ ] **Verify:** `bun test test/controller.test.ts test/cli.test.ts test/e2e-flow.test.ts
      test/multi-change.test.ts test/advance-commit-gate.test.ts` green.

---

# Group C — B26 production (blocker + advance change)

## Task C1: `autoApprovalBlocker` + `approvedByValue`

- [ ] Invoke `dev-core`. Read design §5.1, §5.3.
- [ ] `prompt-blockers.ts`: add
      `autoApprovalBlocker(phase: Phase, title: string, artifactPaths: string[], changeName?: string): Prompt`
      — controller stop message per design §5.1 (lists each artifact file URL; instructs a single
      content-reading validation sub-agent; approve only good artifacts via
      `phasedev approve <file> --by "auto-approve-subagent" --change <change>`; on problems do NOT
      approve, return findings for a phase re-run; forbid manual approve; end with rerun
      `phasedev advance --change <change>`). Reuse `advanceCommand`/`toFileUrl` helpers.
- [ ] `entities/change/approval.ts`: add `approvedByValue(artifactPath: string): string | null`
      (trimmed `approved_by`, or null) using the existing frontmatter parse boundary.
- [ ] **Verify:** `npm run typecheck`; a focused blocker-text test (may sit in `controller.test.ts`)
      asserting per-phase paths + `--by "auto-approve-subagent"` + manual-approve ban.

## Task C2: rewire `advance` autoApprove path

- [ ] Invoke `dev-core`. Read design §5.2.
- [ ] `advance-flow.ts`: delete the auto-stamp block (300–313) and its trailing `route =
      resolveRoute(...)` re-resolve; remove the now-unused `approveArtifact` import.
- [ ] In each `*_approval` handler (342–356): `if (config.autoApprove)` return
      `autoApprovalBlocker(...)` with that phase's artifact paths, else return existing
      `approvalBlocker(...)`.
- [ ] After the `*_approval` handlers, add the integrity scan (design §5.2): `if (config.autoApprove)`
      loop the four approval artifacts; for each existing + `approved: true`, require
      `approvedByValue(...)` non-empty; first violation → return `autoApprovalBlocker(...)` for that
      artifact; do not advance.
- [ ] **Verify:** `npm run typecheck`; focused `bun test test/controller.test.ts` (autoApprove cases
      after Group D).

---

# Group D — B26 tests

## Task D1: new autoApprove behavior tests

- [ ] Invoke `dev-core` + `superpowers:test-driven-development`.
- [ ] Add cases (AAA) in `test/controller.test.ts` (or a small new file): at each `*_approval` gate
      with `autoApprove: true`, `advanceFlow` returns the auto-approval blocker and stamps **nothing**;
      with `autoApprove: false`, returns the ordinary `approvalBlocker`; `approved: true` + empty
      `approved_by` + `autoApprove` → re-blocks; `approved: true` + non-empty `approved_by` → advances.
- [ ] **Verify:** `bun test test/controller.test.ts` green.

## Task D2: reconcile any remaining autoApprove assertions

- [ ] Invoke `dev-core`. Grep for `PhaseDev autoApprove` / auto-stamp expectations across `test/` and
      update any stragglers to the new blocker semantics.
- [ ] **Verify:** `bun test test/controller.test.ts test/cli.test.ts` green.

---

# Group E — docs / contract updates

## Task E1: AGENTS.md, README.md, SKILL.md

- [ ] Invoke `dev-core` (docs drive behavior). Read design §6 doc list.
- [ ] `AGENTS.md` (edit this file; CLAUDE.md is a symlink): rewrite "## Archive Phase" (mutation now via
      `phasedev archive <change-name>`, not `advance`; resume + pre-move crash-recovery owned by the
      command; `advance` archive-silent); update "## Behavior To Preserve" (autoApprove no longer
      auto-stamps — emits the auto-approval blocker; archive-mutation-in-`advance` clause replaced by
      archive-mutation-in-`archive`-command); add `phasedev archive` to the "## Commands" CLI smoke list.
- [ ] `README.md`: add `archive <change-name>` to the command reference (Flow loop / Archive rows);
      update the "Repeat `phase`/`check`/`advance` until archived" text to include the archive command;
      update the mermaid diagram (advance no longer performs the archive transition); update the
      Archive phase-list item; update the `autoApprove` config comment (validation sub-agent, not
      auto-stamp).
- [ ] `skills/phasedev-orchestrator/SKILL.md`: rewrite "## Auto-Approval" (spawn one validation
      sub-agent at approval gates that reads content and approves only good artifacts via
      `phasedev approve <file> --by "auto-approve-subagent"`; recommend `general-purpose`,
      `model: "sonnet"` minimum / `"opus"` for high-stakes per the repo delegation rules; orchestrator
      never runs manual approve under autoApprove); rewrite "## Archive Handling" (use
      `phasedev archive <change>` for the mutation, then `phasedev phase` for the contract, then archive
      sub-agent, then `phasedev archive <change>` again → complete); update "## Termination" so
      `advance finished=true` = final validation passed (flow-complete of the phased flow) and the
      archive command drives the terminal archive.
- [ ] **Verify:** re-read each edited section for internal consistency with the new command behavior.

---

# Group F — full-suite verification

## Task F1: full test + typecheck + CLI smoke

- [ ] Invoke `dev-core` + `superpowers:verification-before-completion`.
- [ ] Run `bun test` (full) and `npm run typecheck`; both must pass. Report real output.
- [ ] CLI smoke (design §9): `init` → `create-change` → drive to final validation → `advance` prints
      "Final validation passed. Flow complete." (no archive word) → `phasedev archive <name>` mutates →
      `phasedev phase` shows the archive contract → complete `.phase-archive.json` → `phasedev archive
      <name>` → `done`.
- [ ] Confirm the Exit Checklist in AGENTS.md; report failures honestly.

---

## Task count: 11 tasks (A1–A3, B1–B2, C1–C2, D1–D2, E1, F1) across 6 groups.
