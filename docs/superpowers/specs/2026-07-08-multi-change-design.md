# Multi-Change Support — Design Spec

Date: 2026-07-08
Status: approved design, pending implementation plan

## Problem

PhaseDev currently enforces a single unfinished change per project: `findActiveChangeDir` throws `MultipleActiveChangesError` when `.phasedev/changes/` holds more than one directory, and `create-change` refuses while any active change (or pending archive) exists. Users need several unfinished changes to coexist, a way to list them, and an orchestrator start protocol that asks the user which change to work on (or whether to create a new one).

## Decisions (agreed with the user)

1. Multiple unfinished changes may coexist in `.phasedev/changes/`.
2. One orchestrator session works on exactly one change; the change is chosen at session start by asking the user.
3. Change targeting is explicit: every change-scoped CLI command accepts `--change <name>`. No "current change" pointer file.
4. When `--change` is omitted and exactly one change exists, commands use it (backward compatible). With several changes and no flag, commands refuse with the list of names.
5. The list command shows unfinished changes with details (name, phase, iteration, task summary); completed archive only via `--archived`.
6. The orchestrator always asks when at least one unfinished change exists, regardless of whether a goal was passed.

## 1. CLI Surface

### `phasedev list` / `phasedev changes` (rework of existing command)

The existing command (`src/features/flow-status/list-changes.ts`) is single-change-centric: it resolves one global route via `resolveRoute` and stamps the same phase onto every directory. Rework:

- For each unfinished change directory in `.phasedev/changes/` (excluding `archive` and dot-directories), read that change's own `state.json` and report: slug, `activePhase`, `activeIteration`, and a one-line task summary (first heading or first non-empty line of `intake_task.md`; fall back to `prd.md`; empty when neither exists). No global `resolveRoute` call.
- (revised 2026-07-08: everything under `changes/archive/` — completed, pending, and broken — counts as archived and is hidden from the default list entirely; the default list only reads the active-change directories.) Pending archives (`changes/archive/<date>-<slug>` with `.phase-archive.json` `status: "in_progress"`) no longer appear in the main list. Their `--change` name (for `phase`/`check`/`advance`/etc. resolution) is still the original slug from `.phase-archive.json.changeName`.
- A change whose state cannot be read (broken `state.json`) still appears in the default list, with an error marker instead of phase details; the listing never crashes on one bad entry.
- (revised 2026-07-08) `--archived` lists ALL archive directories: completed (status + date), pending (original slug, status `in_progress`, date), and broken `.phase-archive.json` (directory name + error marker) — none of these appear without the flag.
- Empty list prints an explicit "No changes. Run create-change." message.
- `--json` output carries the same fields in `data.entries`.

### `--change <name>` on change-scoped commands

Commands: `phase`, `check`, `advance`, `approve`, `add-finding`, `resolve-finding`, `reopen-finding`, `set-verdict`, `set-iteration-status`, `validate-artifact`, `status`, `feedback`, `reset-change`, `reopen`, `check-validation`, `check-archive`. Not change-scoped: `init`, `init-project`, `config`, `log` (reads the project-wide `.phasedev/logs/ralph-log.jsonl`), `version`, `help`, `create-change` (takes a positional name).

Semantics (uniform across commands):

- `--change <name>` given → operate on that change; unknown name → error listing available names.
- Omitted, exactly one unfinished change → use it.
- Omitted, zero changes → current "no active change" behavior.
- Omitted, several changes → refuse: `Multiple changes exist: <a>, <b>. Pass --change <name>.`

### `create-change`

- Remove the "active change already exists" refusal.
- Remove the global pending-archive refusal: a pending archive of change X no longer blocks creating change Y (state is per-change; there is no forked source of truth once resolution is name-scoped).
- Add a refusal when a **pending archive with the same `changeName`** exists — otherwise `--change <name>` would be ambiguous between the new active directory and the pending archive.
- Keep: slug validation, collision with an existing active directory, collision with a same-day archive directory.
- A broken `.phase-archive.json` blocks `create-change` only when it collides with the requested name (matched by the `-<slug>` directory suffix, since `changeName` is unreadable); otherwise it is surfaced in `list`, not here.

## 2. Resolution Layer

### `src/entities/change/active-change.ts`

Replace `findActiveChangeDir(projectRoot)` with `resolveChangeDir(projectRoot, changeName?)` (all call sites updated; `listActiveChangeDirs` stays as the enumeration primitive):

- `changeName` given: return `.phasedev/changes/<slug>` if it exists; else find a pending archive whose `.phase-archive.json.changeName === slug` and return its directory; else throw `UnknownChangeError` (message includes available names).
- `changeName` omitted: 0 dirs → `null`; 1 dir → it; >1 → throw `AmbiguousChangeError` (replaces `MultipleActiveChangesError`) with names and the `--change` hint.

`cli.ts` parses `--change` once and threads it as an optional parameter into `checkFlow`, `advanceFlow`, `resolveRoute`, `getPhasePrompt`, `getFeedbackPrompt`, `getFlowStatus`, `resetChange`, `reopenPhase`, `setIterationStatus`, `approveArtifact` path resolution, and findings path resolution (~13 production call sites). All new parameters are optional — signatures stay backward compatible.

### Flow state (`src/entities/change/flow-state.ts`)

`locateFlowStatePath`, `loadFlowState`, `saveFlowState`, `locateChangeDir` gain the same optional `changeName` parameter. State is always read from the resolved change's own directory. The `state.json` shape (`{ activePhase, activeIteration, repairCycleCount }`) is unchanged — frozen contract preserved.

### Archive state (`src/entities/change/archive-state.ts`)

1. **Multiple pending archives are legal** (change X paused in archive phase while change Y also reaches archive). `findPendingArchiveState(projectPath, changeName?)`: with a name → the pending archive whose `changeName` matches; without → exactly one pending → return it; several → `AmbiguousChangeError`.
2. `--change` always refers to the **original slug**, matched against the `changeName` field, never against the date-prefixed directory name.
3. `findCompletedArchiveState` becomes name-scoped: completion is checked for a specific change; the current "any active change exists → null" guard is removed in favor of per-name resolution.
4. `findInvalidArchiveState(projectPath, changeName?)`: a broken `.phase-archive.json` blocks only operations on that change (and same-name `create-change`), not the whole project. Other changes keep working. `invalid_archive_state` remains a STOP for the affected change.

### Behavior-to-preserve check

Unchanged: `state.json` shape, iteration heading format, YAML keys, `config.yaml` shape, `ready_with_risks` semantics, phase routing before Archive, prompt templates by meaning. The single-active-change invariant itself is what the user explicitly asked to lift in this conversation.

## 3. Orchestrator Skill (`skills/phasedev-orchestrator/SKILL.md`)

### Start protocol (replaces the "create the change once" paragraph in Initialization)

1. Run `phasedev list`.
2. Empty → silently create a new change (`phasedev create-change <name>`, slug from the goal), as today.
3. Non-empty → **always stop and ask the user** one question: each unfinished change as an option (name, phase, iteration, task summary — all from `list` output, never from reading `.phasedev/` directly) plus "create a new change for the current goal". This applies with and without a goal.
4. The chosen name is fixed for the whole session as `<change>`: one orchestrator — one change. Switching changes mid-session is not supported; that is a new orchestrator run.
5. A change marked `archive (in progress)` or with an error marker may be selected; the normal loop handles it (`check`/`advance` resume the archive phase; `invalid_archive_state` is a STOP with report, as today).

### `--change <change>` in every orchestrator call

`phase`, `check`, `advance`, `approve`, `add-finding`, `feedback`, `status`, `reset-change` — the flag is passed **always**, even when only one change exists, so orchestrator behavior does not depend on whether a parallel change appeared between loop iterations. `config` is not change-scoped — no flag.

### Sub-agent prompts

Two changes to the canonical prompt (and the same for the feedback and archive sub-agent prompts):

- Command lines become `phasedev phase --change <change>` and `phasedev check --change <change>` (the orchestrator substitutes the name).
- One added constraint line: the sub-agent works only on this change and must not target other `--change` names.

The framework invariant is restated per-change: `phasedev phase --change X` returns the same contract for every sub-agent until `advance --change X`; an advance on another change does not affect X's contract.

### Fresh-session resume

"I have feedback on a change": run `phasedev list` first; if several unfinished changes exist and the user did not name one, ask which; then proceed as today (fast path / feedback sub-agent) with `--change`.

Everything else in the skill (loop, auto-approve, invalid-artifact recovery, termination, archive handling) is unchanged apart from flag substitution.

## 4. Testing

- `test/` suites to update: `active-change` resolution (new 0/1/N and named-resolution semantics, `UnknownChangeError`, `AmbiguousChangeError`), `create-change` (multi-change creation allowed; pending-archive same-name refusal; removal of global blocks), `list-changes` (per-change state, pending-archive entries, error markers, `--archived`), `cli` (`--change` parsing and refusal messages), `e2e-flow` (two changes advanced independently; advance on X does not touch Y's state).
- New edge-case tests: two pending archives resolved by name; `--change` naming a pending archive; broken `.phase-archive.json` blocking only its own change; omitted `--change` with several changes refusing with the name list.
- Locking note: `runWithStateLock` currently serializes all mutations behind one project-wide `state.lock`. This stays as-is in this design (correctness first); per-change locks are a possible later optimization, out of scope.

## Out of Scope

- Concurrent orchestrators coordinating with each other (each session independently owns one change; the project-wide state lock already prevents interleaved writes).
- A "current change" pointer/`switch` command (explicitly rejected in favor of `--change`).
- Per-change lock files.
- Any change to phase contracts, artifact formats, or `state.json` shape.
