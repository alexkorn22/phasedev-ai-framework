---
name: phasedev-orchestrator
description: PhaseDev AI Framework orchestrator. Thin loop controller that spawns dedicated sub-agents for each PhaseDev phase. No phase work is done by the main agent itself.
---

# PhaseDev Orchestrator — AI Flow Controller for PhaseDev Framework

## Overview

The **PhaseDev Orchestrator** turns the main agent into a strict **flow controller** that delegates every PhaseDev phase — change_intake, code_research, technical_design, iteration_planning, implementation, iteration_validation, finding_repair, final_validation, archive — to a dedicated sub-agent. Use it to run the full flow with strict phase separation, especially when one context cannot hold every phase.

It is intentionally **thin**: it uses `phasedev check` to validate the active phase and `phasedev advance` to switch phases, and spawns sub-agents for phase work. It does **not** execute phase contracts, collect context, validate artifacts, fix invalid artifacts, or pass data between phases — artifact creation, self-validation, and self-repair belong to the owning sub-agent.

## How to Invoke

```
$phasedev-orchestrator [goal description]
```

With no goal, the orchestrator resumes from the current PhaseDev state.

**Goal injection:** for any `change_intake` sub-agent dispatch, prepend intake context to the prompt — the goal description on the first dispatch for a change, or the user's agreed decisions on a later dispatch after feedback resets the flow back to `change_intake`. For every other phase, pass no goal — sub-agents read artifact files directly.

## Command Invocation (mandatory)

`phasedev` is a **globally installed CLI** on `PATH`. Always invoke it directly as `phasedev <command>`. **NEVER** wrap it in `npx`, `bunx`, `npm exec`, `npm run`, `bun run`, or `bun run src/cli.ts`. There is nothing to resolve and no fallback to try, unless the phase controller's self-check fallback block gives explicit alternatives — then follow its instructions. This applies to the orchestrator and to every sub-agent prompt.

**Core orchestrator commands:**
- `phasedev create-change <name> [--task-file <path>]` — create a change directory with `state.json` (`activePhase: change_intake`). Run once before the first `phase`. `--task-file <path>` records the agreed task summary in `intake_task.md` and is how the task-definition decision point hands its result over (see [Decision Points](#decision-points)); it refuses on a missing, unreadable, or empty file. Adding `--quick` creates a Quick-mode change instead (`state.json` `flowMode: "quick"`, `activePhase: quick_plan`) — see [Quick Mode](#quick-mode).
- `phasedev list` — list active changes with phase, iteration, and task summary; archived changes are hidden by default, use `--archived` to see them. Run first at session start.
- `phasedev phase` — print the contract for the active phase (read-only, idempotent).
- `phasedev spawn-plan --harness <name>` — print the role catalog for sub-agent dispatch: one line per role with its mandatory skills and the model resolved for your harness. Read-only, not change-scoped. Pass the harness you are running in (`claude-code`, `opencode`, `cursor`, …). Run it once during initialization to cache the role catalog (`<name> | <model> | <skills>`) for all sub-agent dispatches throughout the session (re-run only if the user modifies roles/models configuration). If the model column shows a tier instead of a concrete model name for a role, that role's tier has no mapped model on this machine — run that sub-agent on the session model and say so in your report. The printed line per role has the format `<name> | <model> | <skills> [| <comment>]` — exactly 3 columns when the role has no comment, 4 when it does; the optional 4th column is the role's purpose comment, not a skill.
- `phasedev clarify` — print the decision-points contract for the active phase (read-only, orchestrator-facing). Run it before spawning sub-agents at `change_intake`, `technical_design` and `iteration_planning`; with no change yet it prints the pre-flow task-definition contract. See [Decision Points](#decision-points).
- `phasedev check [--phase <name>]` — validate artifacts of the active phase (or `--phase` override). Returns OK or issues list; `OK: phase <X> is complete; artifacts already resolve to <Y>. Run phasedev advance to move forward.` is normal forward progress: run `advance`, then spawn on the new phase.
- `phasedev advance` — validate the active phase, then switch `state.json` to the next phase, or refuse on invalid/approval/blocked. Drives every phase transition up to and including final validation; it does not touch the archive (see `phasedev archive` below). Entering `iteration_validation` or `final_validation` resets an inherited terminal verdict to `pending`; `Cannot leave phase …` or `Nothing to advance …` means the current phase's work is unfinished.
- `phasedev archive <change-name>` — the only command that mutates the archive: moves the change directory to `.phasedev/changes/archive/`, writes `.phase-archive.json`, switches `state.json` to `activePhase: archive`, and resumes/completes the archive phase on later calls (see [Archive Handling](#archive-handling)). Refuses before final validation passes.
- `phasedev approve <file>` — set `approved: true` and `approved_by` in an artifact's YAML frontmatter (see [Auto-Approval](#auto-approval)).
- `phasedev add-finding "<finding>" <severity> --required-fix <text> [--class <class>] [--iteration <label>]` — append a finding row to validation_findings.md; allocates the ID, creates the file when missing, and corrects the YAML `verdict`. The ONLY way to add a finding; never hand-edit the findings registry.
- `phasedev feedback` — print the user-feedback processing contract for a sub-agent.
- `phasedev sync-state --change <change>` — non-destructively roll `state.json` back to the artifact-derived phase after feedback reset artifact approvals. This is the ONLY correct fix for a `state.json and the change artifacts disagree` blocker; NEVER use `reset-change` for it — `reset-change` moves the entire change to `.trash`. As a side self-heal, `sync-state` (and `advance`) reset a stale terminal verdict left over from a scope change to a CLI-managed transient state, and normalize a stale findings `type` to match the locked validation phase; `advance` entering a newly added iteration's validation (or a `set-verdict` re-run under that lock) corrects the `type` for the new iteration. Neither the transient verdict nor `type` is ever hand-set by an agent.
- `phasedev status` — print a summary of the current flow state.
- `phasedev config <key>` — read config values.

Findings commands `reopen-finding`, `resolve-finding`, `set-verdict` are for sub-agents (see `phasedev help`); the orchestrator does not run them.

All commands run from the **project root**. `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted throughout.

**Framework questions go to `phasedev help` first.** When anything about framework behavior is ambiguous — locking/concurrency, exit codes, command semantics, findings lifecycle, approval gates — run `phasedev help` and read the relevant section; it is the authoritative, self-contained reference. Never open the framework's source code to answer such questions, and never guess: if `phasedev help` truly does not answer it, ask the user.

## Decision Points

Three points in the flow need the user's decision BEFORE a sub-agent writes an artifact: task definition (before the change exists), architecture (before `technical_design`), iteration split (before `iteration_planning`). At each one, run `phasedev clarify` and execute the contract it prints; `advance` reminds you when it switches into the last two.

Three rules the contract enforces, restated here because they are easy to lose:

1. **You present decisions, you do not invent them.** A sub-agent that read the artifacts and the code produces the facts, options and recommendations. You never read the repository in your own context to answer a decision question.
2. **Ask only what changes THIS phase's artifact.** Nothing survives the materiality filter otherwise, and a question belonging to a later phase is dropped, not asked early. "No open decisions" is a normal outcome — dispatch immediately.
3. **At `technical_design` and `iteration_planning`, dispatch in two stages.** Stage one returns the fork list with the artifact unwritten; you put the forks to the user; stage two writes the artifact with the decisions fixed. Assign stage one with the stage line of the canonical prompt ([Sub-Agent Spawning](#sub-agent-spawning)). Continue the SAME sub-agent for stage two via `SendMessage` so it keeps its context, and fall back to a fresh dispatch — the same canonical prompt with its decisions line filled in — only if that is unavailable.

The task-definition point runs before any command creates the change, so it also produces the mode proposal — see [Mode Selection](#mode-selection) — and ends with `phasedev create-change <slug> [--quick] --task-file <path>`, which records the agreed summary in `intake_task.md`. Both the Standard `change_intake` contract and the Quick `quick_plan` contract inject that file into their sub-agent's prompt directly from disk — see [Quick Mode](#quick-mode).

## Mode Selection

Mode selection happens BEFORE any artifacts exist for the change. The user may explicitly name a mode (Quick / Standard); otherwise assess the goal's complexity and PROPOSE one of the two — the user must CONFIRM before any command creates a change or artifact.

The task-definition decision point runs first and grounds this choice: propose Quick or Standard from the understanding it produced, not from the goal sentence alone.

- **Quick** — small but real change: needs a short plan and worklog but not the full phase-by-phase artifact set (best for surgical bugfixes, bounded 1-2 file changes, or compact enhancements without multi-phase architecture design). Created via `phasedev create-change <name> --quick --task-file <path>`.
- **Standard** — the full phase flow (`change_intake` → … → `archive`) described in the rest of this skill.

Both modes are available at the selection point.

**No Quick → Standard escalation mid-flow.** Complexity assessment is the first stage's job; once a change is in Quick mode, it finishes in Quick mode (see [Quick Mode](#quick-mode)).

**Resume.** When invoked with no goal, run `phasedev list` and honor whatever mode the selected/only unfinished change is already in (`flowMode` from its `state.json`) — do not re-run mode selection for an existing change.

## Quick Mode

1. Create the change: `phasedev create-change <name> --quick --task-file <path>` — the same command shape as Standard ([Initialization](#initialization) step 2), so the task-definition decision point hands its result over the same way and `intake_task.md` is written here too (`state.json`: `flowMode: "quick"`, `activePhase: quick_plan`). The `quick_plan` contract injects `intake_task.md` into the sub-agent's prompt from disk, the same way `change_intake` does — no need to also paste the summary into the dispatch prompt.
2. Drive the same primitives as Standard — `phasedev phase`, `phasedev check`, `phasedev advance` — but the phase sequence is the fixed linear chain `quick_plan → quick_implementation → quick_validation → quick_spec_revision → archive`; it branches before `resolveRoute` and does not use Standard's phase graph.
3. Delegate each quick phase to a dedicated sub-agent exactly as in [Sub-Agent Spawning](#sub-agent-spawning) — the sub-agent reads its own contract via `phasedev phase`.
4. **Single stop:** after `quick_plan`, the sub-agent fills `worklog.md` (`## Task` / `## Short Specification` / `## Plan`, English) — the orchestrator never writes the worklog itself. Stop and get the user's plan confirmation before `quick_implementation` starts.
5. **Validation fix loop stays in-session:** fix `quick_validation` issues by looping sub-agents in the orchestrator's own session — there is no findings artifact in Quick mode.
6. **`quick_spec_revision`** uses a fresh-context sub-agent that reports exactly one of three verdicts: nothing to change, fix the spec in place, or write a delta spec at archive time.
7. **Archive** is a full phase, same as Standard's — see [Archive Handling](#archive-handling); a delta spec is written only when `quick_spec_revision` returned the third verdict.

## Initialization

**Change selection.** Before the loop, select the change:

1. Run `phasedev list`.
2. If it reports no changes → run the task-definition decision point ([Decision Points](#decision-points)), then create the change: `phasedev create-change <name> [--quick] --task-file <path>` (`<name>` slugified from the agreed task summary).
3. If any unfinished changes exist → ALWAYS stop and ask the user one question: list each change (name, phase, iteration, task summary — from `list` output only) plus the option "create a new change for the current goal". This applies both with and without a goal argument.
4. Fix the selected name as `<change>` for the whole session: one orchestrator — one change. Switching changes mid-session is a new orchestrator run.
5. A change with an error marker in `list` may be selected; the normal loop handles it. A change pending archive is not in the default `list`; check `phasedev list --archived` (status `in_progress`) and select it by its original slug via `--change`.

Pass `--change <change>` on EVERY change-scoped command (`phase`, `clarify`, `check`, `advance`, `approve`, `add-finding`, `feedback`, `status`), even when only one change exists. `config` is not change-scoped.

After selecting the change, perform one-time setup for the session:

1. **Read settings:** read orchestrator-safe settings via `phasedev config <key>`:
   - `autoApprove` — default `false` if empty/invalid; remember for [Auto-Approval](#auto-approval).
2. **Cache role grid:** run `phasedev spawn-plan --harness <your harness>` once to resolve and cache the role catalog (`<name> | <model> | <skills>`) for the entire session. This avoids polluting context by repeating `spawn-plan` on every phase. Re-run only if the user modifies roles or model mappings mid-session.

## The Loop

Each iteration:

1. **Validate active phase:** `phasedev check` — checks artifact validity (approval is not checked here).
2. **Advance or work:**
   - If `check` returns OK → run `phasedev advance`. If advance succeeds, ALWAYS spawn sub-agents on the phase named by `Advanced to <X>` — never run `status` or archive first.
   - If `check` returns issues, or advance refuses with `invalid_*` (artifact issues) or `archive_readiness_blocked` (iterations not complete) → spawn sub-agents on the **current** active phase.
   - If advance refuses with `Cannot leave phase` or `Nothing to advance` → the phase is unfinished; spawn sub-agents on the **current** active phase.
   - If advance refuses with `*_approval` (needs approval), the phase work is already done and valid — do NOT spawn sub-agents; handle per [Auto-Approval](#auto-approval), otherwise stop per [Termination](#termination).
3. **Verify:** when all sub-agents for the active phase have reported with passing self-checks — for `iteration_validation` and `final_validation`, follow the wave recipe in [Canonical dispatch: validation phases (6A / 6B)](#canonical-dispatch-validation-phases-6a--6b) before treating the phase complete:
   - If leaving a passed iteration validation (Phase 6A), commit the iteration code and updated `.phasedev` artifacts (suggested commit message: `phasedev(<change>): iteration N — <name>`) before advancing. If `.phasedev/` is git-ignored, commit code only, state that in the report, and never edit `.gitignore`; this is not a blocker.
   - Run `phasedev advance`. If it accepts, spawn on the phase named by `Advanced to <X>`, then continue the loop. If it refuses (e.g. with a commit blocker), commit uncommitted changes and rerun `advance`, or handle per [Auto-Approval](#auto-approval), [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), or [Termination](#termination).

**N sub-agents per phase is dynamic.** How many (1 or more) is exclusively the orchestrator's decision, made per-phase per-change — no framework-level binding ties phases to agent counts or types. Whether the phase's sub-agents run **sequentially or in parallel** is also the orchestrator's per-phase decision — e.g., two sub-agents holding different roles may run concurrently on the same phase. Non-validation sub-agents read their phase contract via bare `phasedev phase --change <change>`; validation sub-agents (`iteration_validation`, `final_validation`) read role-scoped contracts via `phasedev phase --change <change> --role <role>` (the orchestrator does not transmit contract text). Every sub-agent self-validates with `phasedev check` before reporting. Several concurrent sub-agents may safely mutate the same registry (e.g., multiple `phasedev add-finding` writers on `validation_findings.md`): every mutating phasedev command is serialized by an exclusive framework lock, so parallel writers cannot corrupt state — never serialize writers for registry safety. The only obligation sits with each writer: check the command outcome and retry on `[PHASEDEV] BLOCKED` — a mutation counts as applied only after its `OK` line (the CLI already waits for a busy lock internally, so BLOCKED is a rare exception, not the normal parallel outcome). The framework guarantees only the invariant: `phasedev phase --change X` (or `phasedev phase --change X --role R` for validation roles) returns the same contract for every sub-agent with the same role until `advance --change X` is called — an advance on another change does not affect X's contract. This lock keeps N agents on a phase safe whether they run sequentially or in parallel.

What NOT to do:
- **Do not introduce** any phase→agent-count or phase→agent-type table, and do not hardcode per-phase counts ("for design — 3 agents").
- **Do not add** min/max agent limits per phase in config, code, or SKILL.md — the dynamic per-change decision must never become a static framework rule.

## Transition Integrity

`phasedev advance` output is the only source of truth for phase transitions. `Advanced to <X>` means spawn on `<X>`. The phased flow ends ONLY when `advance` itself prints `Final validation passed. Flow complete.` with `finished=true`.

If `phasedev status` or any other signal suggests archive readiness before `advance` prints that terminal phrase in this session, STOP. Report both outputs verbatim; do not call `phasedev archive` and do not guess.

`final_validation` is never skippable. A change is archivable only after a `final_validation` sub-agent ran in this session or, on resume, after idempotent `advance` re-prints the terminal phrase. Outside that explicit resume re-check, if the phrase appears without a `final_validation` dispatch in this session, STOP and report the contradiction.

## Sub-Agent Spawning

For every executable phase, spawn a dedicated sub-agent via the harness sub-agent tool (`Agent`, Cursor `Task`, or OpenCode `task`). Never execute phase work in the main agent.

**Two instruction layers.** The sub-agent works from two texts with distinct responsibilities. The **dispatch prompt** (below) owns the execution context: who the agent is (optional role), where it works (the change `<change>`, project root), how to invoke the CLI, what it must not do (no `advance`, no other `--change`), and how to report back. The **phase contract** (printed by `phasedev phase`) owns the work itself: the phase mission, artifacts and their formats, file write boundaries, methods and skill policy, readiness criteria, and the self-check. The two compose: the contract defines what "done" means and which self-check proves it; the dispatch prompt requires that proof before reporting.

**Role and model resolution:** use the cached role grid obtained from `phasedev spawn-plan --harness <your harness>` at session initialization (do not re-run `spawn-plan` on every phase). Which roles the phase needs, and how many sub-agents to spawn, remains your judgment — the catalog does not bind composition. But once you choose a role, its skills and its model are mandatory: copy them from the cached grid into the dispatch prompt's role slot and the `model` argument exactly as resolved. Never invent a skill name, never substitute a model, and never guess role parameters without referencing the cached grid.

**Spawn-plan line format.** Each role in the grid has the format `<name> | <model> | <skills> [| <comment>]`. Copy into the dispatch role slot only the `<name>` (as the role) and the `<skills>` column. The optional trailing `| <comment>` is the role's purpose for your orientation — it is NOT a skill, never list it in the role line's mandatory-skills slot.

**Agent type & harness dispatching:**
- In dynamic-model harnesses (e.g. `claude-code`, `codex`, `antigravity`), every dispatch is a generic sub-agent (`Agent` tool with no `subagent_type`) carrying the role, mandatory skills, and explicit `model` from the cached `spawn-plan` grid.
- In the Cursor harness, every PhaseDev dispatch is Cursor `Task` with `subagent_type: "generalPurpose"` and an explicit `model` copied verbatim from the spawn-plan grid. Never use Cursor built-ins (`explore`, `shell`, `bash`, `browser`, `bugbot`, `security-review`, `ci-investigator`, …): they pin their own models and ignore `models.yaml`.
- In static/tier-subagent harnesses (e.g. `opencode`), the runtime `task` tool configures models via pre-defined subagents in `opencode.json` rather than a dynamic `model` argument. Map the chosen role's tier (`cheap` | `standard` | `strong` — resolved from `spawn-plan`) to `subagent_type: "phasedev-<tier>"` (e.g. `phasedev-cheap`, `phasedev-standard`, `phasedev-strong`).

**Model selection:** in dynamic harnesses, every dispatch MUST pass an explicit `model` — an omitted model silently inherits the main agent's (typically the most expensive). In Cursor, `inherit` is the same failure: the sub-agent runs on the orchestrator's model, not the cheap/standard mapping. Never omit `model`, never pass `inherit`, never pass `"fast"`, never substitute a different slug because the session Task enum looks shorter than `models.yaml`. Copy the spawn-plan model string exactly. In OpenCode, selecting `subagent_type: "phasedev-<tier>"` activates the corresponding tier model configured in `opencode.json`.

The model comes from the chosen role's entry in the cached `spawn-plan` grid, not from your own guess: pick the role, pass its model (or select `phasedev-<tier>` in OpenCode). Your judgment sits one level up — in which roles a phase needs. When `spawn-plan` output has a tier instead of a concrete model name for a role, that role's tier has no mapped model on this machine — whether because the mapping is unset entirely or only partially covers this harness (other roles can still resolve to real model names in the same run): run that role on the session model and report that explicitly in your notes/report. If a report shows the work was harder than the role implies, re-dispatch the remainder under a role whose model is stronger — an underpowered model on multi-step work often takes 2-3× the turns and costs more overall.

**Sub-agent prompt** — two complete canonical bodies. Pick exactly one body for the active phase; copy the fixed body VERBATIM and fill only the optional slots. Adding ANY other instruction about phase work — artifact read order, changed-file inventories, review checklists, verdict policy, findings-command recipes — is a violation: those belong to the phase contract printed by `phasedev phase`, and a second copy in the dispatch prompt drifts out of date and conflicts with it (the contract itself tells the sub-agent to ignore such details on conflict).

### Canonical dispatch: non-validation phases

Use for every executable phase except `iteration_validation` and `final_validation` (`change_intake`, `code_research`, `technical_design`, `iteration_planning`, `implementation`, `finding_repair`, `archive`, and all Quick phases). Step 1 uses bare `phasedev phase --change <change>`.

*Dynamic harness (`Agent` tool):*
```javascript
Agent(
  description: "<phase-name>: execute phase contract",
  model: "<model resolved by `phasedev spawn-plan` for the chosen role — see Model selection; a tier only when that role's tier has no mapped model on this machine>",
  prompt: `Execute the current PhaseDev phase for change "<change>".

<intake context: the goal description on the first \`change_intake\` dispatch, or the agreed decisions on a later one after a feedback reset — CHANGE_INTAKE PHASE ONLY; omit this line for every other phase>
Your role: <role name from spawn-plan>. Mandatory skills: <the skills column from that role's spawn-plan line>.
<Stage: fork analysis only — OPTIONAL STAGE LINE for stage 1 at technical_design and iteration_planning; omit otherwise>
<Decisions already taken: <list> — OPTIONAL DECISIONS LINE for stage 2 fallback; omit otherwise>

You work ONLY on the change "<change>".

1. Run: phasedev phase --change <change> — to get the phase contract.
2. Follow your role's mandatory skills and execute the phase contract.
3. Stay strictly within the project workspace (never read, write, or run anything outside process.cwd(); no /tmp or home dir).
4. Do not search code via git history/logs; search files and symbols via grep/find/file reading.
5. Self-validate via the contract's check command before reporting.
6. Do NOT run phasedev advance. Report results, blockers, and applied skills.`
)
```

*Cursor harness (`Task` tool — model from spawn-plan is mandatory):* same prompt body as Dynamic harness above; use `subagent_type: "generalPurpose"` and the spawn-plan model.

*OpenCode harness (`task` tool with tier-based subagents):* same prompt body as Dynamic harness above; use `subagent_type: "phasedev-<tier>"`.

That is the entire non-validation prompt — the fixed body plus the four optional slots above, and nothing else.

### Canonical dispatch: validation phases (6A / 6B)

Use only for `iteration_validation` and `final_validation`. Validation roles from the cached spawn-plan grid: `code-review`, `security-review`, `implementation-check`. Never invent `final-validator` or any other validation role. Fill `<role>` in step 1 and the dispatch role slot with the same validation role.

#### Wave recipe

**`iteration_validation` (Phase 6A)**

| Wave | Roles | Runs project checks? | Owns |
|---|---|---|---|
| Wave 1 (may run in parallel) | one `code-review` + one `security-review` | zero — findings only | `phasedev add-finding` rows only |
| Wave 2 (sequential, after wave 1) | exactly one `implementation-check` | zero — consume Implementation `Check Evidence` | verdict, `phasedev check-validation`, iteration `[~]` → `[x]` |

Never dispatch two `implementation-check` agents for the same iteration validation scope.

**`final_validation` (Phase 6B)**

| Wave | Roles | Runs project checks? | Owns |
|---|---|---|---|
| Wave 1 (review roles may run in parallel) | one `code-review` + one `security-review` over the full change; plus a separate browser/manual validation sub-agent when PRD/plan requires browser evidence | zero — findings only | `phasedev add-finding` rows only |
| Wave 2 (sequential, after wave 1 complete with no blocking findings) | exactly one `implementation-check` | runs `execution_contract.md` `full` exactly once | verdict, `phasedev check-validation` |

Browser validation is a separate subagent when required, completes in wave 1 before the full gate, and never runs `unit`/`phase`/`full` unless its own browser contract explicitly requires browser tooling. Missing browser evidence is pending browser work, not a product finding; actual browser defects use `phasedev add-finding`.

Never run `full` in parallel with review or browser work. Never dispatch two `implementation-check` agents for the same final validation scope.

#### Execution receipt protocol (orchestrator)

Before dispatching any validation role or focused check sub-agent, claim the matching receipt and pass the returned `claim-id` in the dispatch prompt. The sub-agent completes its role with `phasedev complete-receipt` (or `cancel-receipt` on crash). Never hand-edit `runtime/execution_receipts.json`.

| Step | Orchestrator action | Sub-agent action |
|---|---|---|
| Wave 1 review/manual | `phasedev claim-receipt <role> --scope <scope>` then dispatch | `phasedev complete-receipt <role> --scope <scope> --claim-id <id> --result passed` after findings work |
| Wave 2 implementation-check | claim `implementation-check` after wave 1 receipts passed | while claimed, claim/complete `check:full` around the authorized full gate, then complete `implementation-check` passed |
| Implementation / repair checks | claim `check:unit` or `check:phase` with exact `--command` before rerunning unchanged commands | complete receipt with `passed|failed|blocked`; blocked infra failures do not add findings |

Rules:
- A current `passed` receipt returns `skip` — reuse evidence, do not rerun the exact command.
- An active `claimed` receipt fails closed; recover only with `phasedev cancel-receipt ... --reason <text>` using the same claim id.
- Final wave 2 order: claim `implementation-check` → claim/complete `check:full` while that claim is active → complete `implementation-check` passed.
- Browser auxiliary work uses `manual-acceptance` receipt when deferred manual acceptance is required by the approved plan.

*Dynamic harness (`Agent` tool):*
```javascript
Agent(
  description: "<phase-name>: execute phase contract",
  model: "<model resolved by `phasedev spawn-plan` for the chosen role — see Model selection; a tier only when that role's tier has no mapped model on this machine>",
  prompt: `Execute the current PhaseDev phase for change "<change>".

Your role: <role name from spawn-plan>. Mandatory skills: <the skills column from that role's spawn-plan line>.
Your receipt claim-id: <claim-id from phasedev claim-receipt>

You work ONLY on the change "<change>".

1. Run: phasedev phase --change <change> --role <role> — to get the phase contract.
2. Follow your role's mandatory skills and execute the phase contract, including the Execution receipt protocol section.
3. Complete your role receipt with phasedev complete-receipt <role> --scope <scope> --claim-id <claim-id> --result passed|failed|blocked before reporting.
4. Stay strictly within the project workspace (never read, write, or run anything outside process.cwd(); no /tmp or home dir).
5. Do not search code via git history/logs; search files and symbols via grep/find/file reading.
6. Self-validate via the contract's check command before reporting.
7. Do NOT run phasedev advance. Report results, blockers, and applied skills.`
)
```

*Cursor harness (`Task` tool — model from spawn-plan is mandatory):* same prompt body as Dynamic harness above; use `subagent_type: "generalPurpose"` and the spawn-plan model.

*OpenCode harness (`task` tool with tier-based subagents):* same prompt body as Dynamic harness above; use `subagent_type: "phasedev-<tier>"`.

That is the entire validation prompt — the fixed body plus the role slot above, and nothing else.

### Canonical dispatch: browser/manual auxiliary validation

Use during `final_validation` wave 1 when PRD/plan acceptance evidence requires browser or manual validation. This dispatch is separate from PhaseDev validation roles (`code-review`, `security-review`, `implementation-check`). Complete browser/manual work before wave-2 `implementation-check` runs the `full` gate.

*Dynamic harness (`Agent` tool):*
```javascript
Agent(
  description: "final_validation: browser/manual auxiliary validation",
  model: "<model resolved by `phasedev spawn-plan` for the chosen role — see Model selection; a tier only when that role's tier has no mapped model on this machine>",
  prompt: `Execute browser/manual validation for change "<change>".

Your role: <role name from spawn-plan>. Mandatory skills: <the skills column from that role's spawn-plan line>.
Your manual-acceptance receipt claim-id: <claim-id from phasedev claim-receipt manual-acceptance --scope final>

You work ONLY on the change "<change>".

1. Read PRD and implementation-plan acceptance evidence for browser/manual requirements; perform only browser or manual verification work required by that evidence.
2. Record actual product defects with phasedev add-finding; report missing browser evidence as pending browser work, not as a product finding.
3. Complete manual acceptance with phasedev complete-receipt manual-acceptance --scope final --claim-id <claim-id> --result passed before reporting.
4. Do not run unit, phase, or full project check commands and do not set a validation verdict.
5. Stay strictly within the project workspace (never read, write, or run anything outside process.cwd(); no /tmp or home dir).
6. Do not search code via git history/logs; search files and symbols via grep/find/file reading.
7. Do NOT run phasedev advance. Report results, blockers, and applied skills.`
)
```

*Cursor harness (`Task` tool — model from spawn-plan is mandatory):* same prompt body as Dynamic harness above; use `subagent_type: "generalPurpose"` and the spawn-plan model.

*OpenCode harness (`task` tool with tier-based subagents):* same prompt body as Dynamic harness above; use `subagent_type: "phasedev-<tier>"`.

That is the entire browser/manual auxiliary prompt — the fixed body plus the role slot above, and nothing else.

**Infrastructure vs product outcomes (orchestrator)**

- **Product full-gate failure** (command ran, tests failed): the `implementation-check` sub-agent records a concrete `MUST-FIX` finding with failing test/path evidence; `advance` may route to `finding_repair`.
- **Infrastructure unavailable** (sandbox/network/binary/access exit before a truthful full-gate result): report **blocked**, remain in `final_validation`, do **not** `add-finding`, do **not** route to `finding_repair`; retry only the `implementation-check` wave-2 sub-agent after environment or access changes.

**Sequential command deduplication (orchestrator)**

Reuse existing evidence instead of rerunning the exact command when a passed result still applies and no relevant code/test diff changed afterward. Rerun when code/commands changed or the previous result failed, blocked, or is unavailable.

- **Implementation:** runs focused `unit`/`phase` commands only.
- **6A:** consumes Implementation `Check Evidence`; reviewers and `implementation-check` run zero project checks.
- **Finding repair:** reruns focused commands only when repair changed code/tests.
- **Re-validation:** consumes repair evidence; no duplicate reruns of unchanged passed checks.
- **6B wave 1:** reviewers and browser work run no `unit`/`phase`/`full`.
- **6B wave 2:** `full` runs only once, owned solely by `implementation-check`.

Do not add `check_runs.md` or new state fields for deduplication.

**Finding repair dispatch (orchestrator)**

Route repair from the **open finding class and required fix**, not from phase name alone. Dispatch an implementer only for findings whose repair requires code/test/plan/design work. Do **not** dispatch an implementer when only validation-infrastructure retry or browser/manual validation work remains — handle those with environment access or a browser/manual subagent instead.

**Orchestrator boundary**

The orchestrator never performs phase work, project checks, browsers, dev servers, or validation commands itself.

Shared dispatch rules (both bodies): artifact self-validation and the final-response format are the sub-agent's duty under the contract; the orchestrator never inspects, judges, or fixes artifact content. A bare self-check returning `OK … Run phasedev advance` passes; a sub-agent must not switch to `--phase` to make a check pass, and the orchestrator must not accept a `--phase` self-check when bare `check` fails. If `phasedev check` returns issues after a sub-agent reported "complete", apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), not a silent re-spawn loop. Sub-agents report applied skills concisely (e.g. `Skills: <skill> (APPLIED)` or `Skills: <skill> (N/A: reason)`). The orchestrator transmits exactly the skills `spawn-plan` printed for the chosen role — never more, never invented.

## Sub-Agent Report Reconciliation

Read every sub-agent's final report in full; this is the orchestrator's only result channel and is not artifact inspection. `validation_findings.md` is state; report prose is not.

If a validation, review, or QA report names concrete defects or gaps while the registry has no matching row and the verdict is `ready` or `ready_with_risks`, the phase is NOT done. This includes missing or skipped tests, an unrun or failed gate, deferred `R#`/`SC#` requirements, an incomplete review pass, or "gaps but not findings." Do not run `advance` and never report "0 findings" from the table alone when prose says otherwise.

**Infrastructure blockers are not product findings.** When an `implementation-check` report says the full gate, sandbox, network, binary, or environment was unavailable, treat it as blocked in `final_validation` — do not `add-finding`, do not route to `finding_repair`, and retry wave 2 only after environment or access changes. Missing browser evidence is pending browser work, not a finding.

Either record every product item directly:

```bash
phasedev add-finding "<defect>" <severity> --required-fix "<fix>" --class <class> --change <change>
```

Use MUST-FIX for a failed product gate (command ran and tests failed) or an unmet `R#`/`SC#`; use RECOMMENDED for test gaps unless the report marks them blocking. Alternatively, re-dispatch the SAME role once to record the items. Then resume at `phasedev check`; `advance` routes to `finding_repair` only for product findings that require repair work.

A report that gates passed is sub-agent evidence. Quote it as such — for example, "sub-agent reports 159 passed" — never as the orchestrator's own verification.

## User Feedback Handling

At any STOP point (approval gate, blocker, or after user interrupt), the user may give feedback — a correction, new requirement, bug report, or rejection.

**Fast path (no sub-agent).** When the user, a sub-agent report, or any additional user-requested check (manual or browser QA, script run) supplies a concrete, already-formulated implementation defect, do NOT spawn a sub-agent. Record it yourself with a single deterministic call:

```bash
phasedev add-finding "<defect summary>" MUST-FIX --required-fix "<required fix>" --class implementation --change <change>
```

(Command semantics are in the `add-finding` entry under [Command Invocation](#command-invocation-mandatory).) Then continue the loop — `phasedev advance` routes to finding_repair where the fix is implemented. Never hand-edit the findings registry and never edit repository code to handle feedback.

The orchestrator never decides that a reported defect is out of scope; the approved PRD decides scope. If scope is unclear, use the delegated path. Never drop the defect or ask "archive?" while an unrecorded FAIL exists.

**Delegated path (feedback needs analysis).** When it is unclear whether the reported defect is in scope, whether feedback is an implementation defect or a scope/design/plan change, or it is mixed, pick an appropriate role's skills and model from the cached spawn-plan grid (e.g. intake-analyst or architect), then spawn a dedicated sub-agent (using `Agent`, Cursor `Task(subagent_type: "generalPurpose", model: "<spawn-plan model>", ...)`, or in OpenCode `task(subagent_type: "phasedev-<tier>", ...)`):

```javascript
Agent(
  description: "process user feedback on PhaseDev change",
  model: "<model from the cached spawn-plan grid for the chosen role — see Model selection; a tier only when that role's tier has no mapped model on this machine>",
  prompt: `Process user feedback for change "<change>".

Feedback: <user's full feedback text>
Your role: <role name from spawn-plan>. Mandatory skills: <the skills column from that role's spawn-plan line>.

You work ONLY on the change "<change>".

1. Run: phasedev feedback --change <change> — to get the feedback contract.
2. Follow your role's mandatory skills and execute the feedback contract.
3. Report results, blockers, and applied skills.`
)
```

After the fast path or the sub-agent return, run `phasedev check` and continue the main loop from that state — it guides the next action (`finding_repair` if findings were added, an approval gate if approvals were reset, iteration work if a phase is active). If `phasedev check` reports `state.json and the change artifacts disagree`, the feedback sub-agent forgot its final sync: run `phasedev sync-state --change <change>` yourself (deterministic, no sub-agent, never `reset-change`), then re-run `phasedev check`. After a scope change the loop legitimately resumes from an earlier phase (approval gates for the re-edited artifacts) — that is normal convergence, not a failure.

This applies equally on a fresh session where the user says "I have feedback on this change": run `phasedev list` first; if several unfinished changes exist and the user did not name one, ask which change the feedback targets. Then run `phasedev check` to determine the current state, then use the fast path or feedback sub-agent instead of the normal phase spawn.

## Invalid-artifact recovery policy

An artifact-invalid route (`invalid_prd`, `invalid_execution_contract`, `invalid_code_research`, `invalid_technical_design`, `invalid_iteration_planning`, `invalid_findings`) means the owning sub-agent reported completion without a passing self-check (or the state broke on resume: human edit, crashed session). `invalid_archive_state` is NOT included here — it is always a STOP. The orchestrator does NOT validate or fix the artifact; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning phase using the matching canonical dispatch body under the same role as the original dispatch, with the skills and model from the cached spawn-plan grid. Use the [validation canonical body](#canonical-dispatch-validation-phases-6a--6b) for `iteration_validation` / `final_validation`; otherwise use the [non-validation canonical body](#canonical-dispatch-non-validation-phases). Fix the artifact and self-validate via `phasedev check` before reporting. Do NOT run `phasedev advance`.
2. After it returns, call `phasedev check`:
   - Phase valid → continue the loop.
   - Same phase still invalid → **STOP**. Report "Sub-agent failed to self-validate `<artifact>` after one recovery attempt" with the issues. Do not spawn again.
3. Never turn this into a loop — the orchestrator is not the validation driver.

## Auto-Approval

When `phasedev config autoApprove` (from Initialization) is `true`, `phasedev advance` never auto-stamps an artifact at an approval gate. Instead, when it refuses with an `*_approval` refusal, it prints an auto-approval blocker naming the phase and listing the exact artifact path(s) for that gate (`prd.md` + `execution_contract.md` for `change_intake_approval`, `design.md` for `technical_design_approval`, `iteration_plan.md` for `iteration_planning_approval`). The orchestrator MUST NOT approve manually under `autoApprove` — approval requires content review.

On that blocker, pick a role (e.g. `approval-reviewer`) from the cached spawn-plan grid with its skills and model, then spawn exactly ONE dedicated validation sub-agent (using `Agent`, Cursor `Task(subagent_type: "generalPurpose", model: "<spawn-plan model>", ...)`, or in OpenCode `task(subagent_type: "phasedev-<tier>", ...)`):

```javascript
Agent(
  description: "auto-approve validation: review <phase> artifacts",
  model: "<model from the cached spawn-plan grid for the chosen role — see Model selection; a tier only when that role's tier has no mapped model on this machine>",
  prompt: `Review the following PhaseDev artifact(s) for change "<change>" on their merits before approving.

Artifacts:
<one line per artifact path from the blocker>
Your role: <role name from spawn-plan>. Mandatory skills: <the skills column from that role's spawn-plan line>.

You work ONLY on the change "<change>".

1. Read the FULL content of every listed artifact.
2. Evaluate each on the merits against the phase contract — completeness, coherence, fidelity to the original task.
3. If — and only if — every artifact is genuinely good, approve each with: phasedev approve <file> --by "auto-approve-subagent" --change <change>
4. If any artifact has a problem, do NOT approve it; report concrete findings.
5. Report which artifacts were approved, which were not and why, and applied skills.`
)
```

After the sub-agent returns:
- If it approved every listed artifact → retry `phasedev advance --change <change>`. If advance succeeds → continue the main loop. If it still refuses with the same `*_approval` or with "Approval integrity" (an artifact is `approved: true` but has empty `approved_by`) → **STOP**, report "Auto-approve failed to advance after sub-agent review." Do not loop.
- If it did not approve (found problems) → apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy): spawn the owning phase sub-agent once with the reported findings, then retry from `phasedev check`.

## Termination

Stop when any is met:
- **Final validation passed (advance's terminal state)** — `phasedev advance` returns `finished=true` with message "Final validation passed. Flow complete." This is the end of the phased flow that `advance` drives; `advance` no longer touches the archive. Continue with [Archive Handling](#archive-handling) to actually archive the change.
- **Flow complete (archived)** — `phasedev archive <change>` reports the change is archived (`.phase-archive.json` `status: completed`). Stop and report success.
- **Blocked** — approval gate, blocker (verify with `phasedev check`), or invalid state. At a manual approval gate (`autoApprove: false`), tell the user the exact artifact paths from the blocker to review, then wait. For `change_intake`, also direct the user to verify that the `unit`, `phase`, and `full` gate commands in `execution_contract.md` match the repository's actual runners (including per-file versus full-suite runners); every later validation depends on them. Do not judge artifact content yourself.
- **Contradictory state** — STOP and follow [Transition Integrity](#transition-integrity).
- **No progress** — after sub-agents, `phasedev advance` (or `phasedev archive`) still refuses with the same reason; for a repeated `invalid_*` this is the stop step of the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy).
- **CLI limit reached** — `advance` refuses with "Max iterations (N) reached" (fixed CLI constant: 10 iterations, not configurable) — stop and report the refusal.
- **Unrecoverable error** — sub-agent error after one retry.
- **User interrupt**.

## Archive Handling

Archive starts once `phasedev advance` reports "Final validation passed. Flow complete." (all iterations `[x]`, final validation passed). From that point, `phasedev advance` has nothing further to do for this change — the archive mutation and the archive phase itself are driven entirely by `phasedev archive <change>`.

1. Call `phasedev archive <change>`. On a change that just finished final validation, this performs the archive mutation (moves the change directory to `.phasedev/changes/archive/`, creates `.phase-archive.json` with `status: "in_progress"`) and switches `state.json` to `activePhase: archive`. Called again later, it resumes a pending archive or recovers a pre-move crash — it is safe to call repeatedly.
2. Call `phasedev phase --change <change>` to get the archive contract, then spawn an archive sub-agent using the [non-validation canonical dispatch body](#canonical-dispatch-non-validation-phases) with an appropriate role (e.g. `spec_sync`, using skills and model from the cached spawn-plan grid) to execute the contract, write delta specs, and set `.phase-archive.json` `status: "completed"`.
3. After the sub-agent returns, call `phasedev archive <change>` again:
   - If it reports the archive is complete → **flow complete** → STOP.
   - If it refuses or reports the archive still in progress → sub-agent did not finish → no-progress → STOP and report.

## Important Rules

1. **NEVER execute phase work directly** — always spawn a dedicated sub-agent (via `Agent` or `task`).
2. **ALWAYS invoke `phasedev` directly as a global command** — per [Command Invocation](#command-invocation-mandatory); restate the ban in every sub-agent prompt.
3. **Sub-agents NEVER run `phasedev advance`** — only the orchestrator calls it, after sub-agents report passing self-checks.
4. **ALWAYS use `phasedev check` to validate the active phase** — never read `.phasedev/` files directly. Answer factual questions about change state from `phasedev status --change <change>`, `phasedev check`, and `phasedev list` output.
5. **ALWAYS use `phasedev config` to read settings** — never read `config.yaml` directly.
6. **NEVER validate or fix phase artifacts yourself** — the owning sub-agent creates, self-checks, and self-heals each artifact; on `invalid_*` after "complete", apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy).
7. **NEVER pass context between phases** — sub-agents read artifact files directly; the filesystem is the durable state.
8. **NEVER re-describe phase contracts** — non-validation sub-agents get them from bare `phasedev phase --change <change>`; validation sub-agents get them from `phasedev phase --change <change> --role <role>`.
9. **NEVER write random log or trace files under `.phasedev/`** — the orchestrator is ephemeral; durable state lives exclusively in standard phase artifacts and git history.
10. **Report phase status, never product readiness** — `check OK` or accepted `advance` means only that phase's gate passed. Before `advance` prints the terminal phrase, never say "implementation is ready/complete," "feature done," or "ready to archive." After it, say "final validation passed" and name archive as the remaining step. Every report states which gates ran, attributed to the sub-agent's report, and which have not run yet (for example, "full gate runs in `final_validation` — not executed yet").
11. **Commit iteration changes** — when Phase 6A (iteration validation) passes, the validation sub-agent is read-only and does NOT commit code. The orchestrator commits the iteration code and updated `.phasedev` artifacts before running `phasedev advance`. If `.phasedev/` is git-ignored, commit code only, state that in the report, and never edit `.gitignore`; this is not a blocker.
