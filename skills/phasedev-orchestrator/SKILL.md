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

**Goal injection:** for the first `change_intake` sub-agent only, prepend the goal description to the prompt as intake context. For every later phase, pass no goal — sub-agents read artifact files directly.

## Command Invocation (mandatory)

`phasedev` is a **globally installed CLI** on `PATH`. Always invoke it directly as `phasedev <command>`. **NEVER** wrap it in `npx`, `bunx`, `npm exec`, `npm run`, `bun run`, or `bun run src/cli.ts`. There is nothing to resolve and no fallback to try, unless the phase controller's self-check fallback block gives explicit alternatives — then follow its instructions. This applies to the orchestrator and to every sub-agent prompt.

**Core orchestrator commands:**
- `phasedev create-change <name>` — create a change directory with `state.json` (`activePhase: change_intake`). Run once before the first `phase`. `phasedev create-change --quick <name>` creates a Quick-mode change instead (`state.json` `flowMode: "quick"`, `activePhase: quick_plan`) — see [Quick Mode](#quick-mode).
- `phasedev list` — list active changes with phase, iteration, and task summary; archived changes are hidden by default, use `--archived` to see them. Run first at session start.
- `phasedev phase` — print the contract for the active phase (read-only, idempotent).
- `phasedev check [--phase <name>]` — validate artifacts of the active phase (or `--phase` override). Returns OK or issues list.
- `phasedev advance` — validate the active phase, then switch `state.json` to the next phase, or refuse on invalid/approval/blocked. The single mutation point for flow state.
- `phasedev approve <file>` — set `approved: true` and `approved_by` in an artifact's YAML frontmatter (see [Auto-Approval](#auto-approval)).
- `phasedev add-finding "<finding>" <severity> --required-fix <text> [--class <class>] [--iteration <label>]` — append a finding row to validation_findings.md; allocates the ID, creates the file when missing, and corrects the YAML `verdict`. The ONLY way to add a finding; never hand-edit the findings registry.
- `phasedev feedback` — print the user-feedback processing contract for a sub-agent.
- `phasedev sync-state --change <change>` — non-destructively roll `state.json` back to the artifact-derived phase after feedback reset artifact approvals. This is the ONLY correct fix for a `state.json and the change artifacts disagree` blocker; NEVER use `reset-change` for it — `reset-change` moves the entire change to `.trash`.
- `phasedev status` — print a summary of the current flow state.
- `phasedev config <key>` — read config values.

Findings commands `reopen-finding`, `resolve-finding`, `set-verdict` are for sub-agents (see `phasedev help`); the orchestrator does not run them.

All commands run from the **project root**. `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted throughout.

## Mode Selection

Mode selection happens BEFORE any artifacts exist for the change. The user may explicitly name a mode (Express / Quick / Standard); otherwise assess the goal's complexity and PROPOSE one of the three — the user must CONFIRM before any command creates a change or artifact.

- **Express** — trivial, well-understood change: a few files, no unclear investigation, no spec/behavior implications beyond the obvious. Fully stateless: no `.phasedev/changes` directory, no worklog.
- **Quick** — small but real change: needs a short plan and worklog but not the full phase-by-phase artifact set. Created via `phasedev create-change --quick <name>`.
- **Standard** — the full phase flow (`change_intake` → … → `archive`) described in the rest of this skill.

All three modes are available at the selection point — Quick is never reached only by escalation.

**No Quick → Standard escalation mid-flow.** Complexity assessment is the first stage's job; once a change is in Quick mode, it finishes in Quick mode (see [Quick Mode](#quick-mode)). Express MAY escalate to Quick (see [Express Mode](#express-mode)) — that is the only cross-mode transition.

**Resume.** When invoked with no goal, run `phasedev list` and honor whatever mode the selected/only unfinished change is already in (`flowMode` from its `state.json`) — do not re-run mode selection for an existing change.

## Express Mode

Express is fully stateless — no `.phasedev/changes` directory, no worklog; the only lasting trace is the eventual git commit.

1. Run `phasedev express` — prints the Express contract (mission, guardrails, escalation criteria, self-check).
2. Follow the printed contract. There is a single stop: plan confirmation with the user before implementation starts.
3. After the user confirms the plan, spawn an implementer sub-agent (dev-core discipline, test-first) that proves its work with an actual run of the relevant command/test — not by assertion alone.
4. Spawn a separate reviewer sub-agent (fresh context) that performs code and security review and checks whether the change touches anything under `specs/` or otherwise implies a behavior/spec change.
5. **Escalate to Quick** when, during planning or review, any of: the change touches more than a handful of files; the behavior is described in `specs/` or a change directory; or the bug's root cause is unclear without further investigation. On hitting one of these, STOP and ask the user; on confirmation, abandon Express and run `phasedev create-change --quick <name>` to continue in Quick mode. These are textual criteria only — no numeric thresholds, nothing configurable.

## Quick Mode

1. Create the change: `phasedev create-change --quick <name>` (`state.json`: `flowMode: "quick"`, `activePhase: quick_plan`).
2. Drive the same primitives as Standard — `phasedev phase`, `phasedev check`, `phasedev advance` — but the phase sequence is the fixed linear chain `quick_plan → quick_implementation → quick_validation → quick_spec_revision → archive`; it branches before `resolveRoute` and does not use Standard's phase graph.
3. Delegate each quick phase to a dedicated sub-agent exactly as in [Sub-Agent Spawning](#sub-agent-spawning) — the sub-agent reads its own contract via `phasedev phase`.
4. **Single stop:** after `quick_plan`, the sub-agent fills `worklog.md` (`## Task` / `## Short Specification` / `## Plan`, English) — the orchestrator never writes the worklog itself. Stop and get the user's plan confirmation before `quick_implementation` starts.
5. **Validation fix loop stays in-session:** fix `quick_validation` issues by looping sub-agents in the orchestrator's own session — there is no findings artifact in Quick mode.
6. **`quick_spec_revision`** uses a fresh-context sub-agent that reports exactly one of three verdicts: nothing to change, fix the spec in place, or write a delta spec at archive time.
7. **Archive** is a full phase, same as Standard's — see [Archive Handling](#archive-handling); a delta spec is written only when `quick_spec_revision` returned the third verdict.

## Initialization

**Change selection.** Before the loop, select the change:

1. Run `phasedev list`.
2. If it reports no changes → create one: `phasedev create-change <name>` (`<name>` slugified from the user's goal).
3. If any unfinished changes exist → ALWAYS stop and ask the user one question: list each change (name, phase, iteration, task summary — from `list` output only) plus the option "create a new change for the current goal". This applies both with and without a goal argument.
4. Fix the selected name as `<change>` for the whole session: one orchestrator — one change. Switching changes mid-session is a new orchestrator run.
5. A change with an error marker in `list` may be selected; the normal loop handles it. A change pending archive is not in the default `list`; check `phasedev list --archived` (status `in_progress`) and select it by its original slug via `--change`.

Pass `--change <change>` on EVERY change-scoped command (`phase`, `check`, `advance`, `approve`, `add-finding`, `feedback`, `status`), even when only one change exists. `config` is not change-scoped.

After selecting the change, read orchestrator-safe settings via `phasedev config <key>`:

- `runArchiveStage` — remember for [Archive Handling](#archive-handling).
- `autoApprove` — default `false` if empty/invalid; remember for [Auto-Approval](#auto-approval).

## The Loop

Each iteration:

1. **Validate active phase:** `phasedev check` — checks artifact validity (approval is not checked here).
2. **Advance or work:**
   - If `check` returns OK → run `phasedev advance`. If advance succeeds, the phase switched — spawn sub-agents on the **new** phase.
   - If `check` returns issues, or advance refuses with `invalid_*` (artifact issues) or `archive_readiness_blocked` (iterations not complete) → spawn sub-agents on the **current** active phase.
   - If advance refuses with `*_approval` (needs approval), the phase work is already done and valid — do NOT spawn sub-agents; handle per [Auto-Approval](#auto-approval), otherwise stop per [Termination](#termination).
3. **Verify:** when all sub-agents for the phase have reported with passing self-checks, run `phasedev advance`. If it accepts, loop from step 1. If it refuses, handle per [Auto-Approval](#auto-approval), [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), or [Termination](#termination).

**N sub-agents per phase is dynamic.** How many (1 or more) is exclusively the orchestrator's decision, made per-phase per-change — no framework-level binding ties phases to agent counts or types. Whether the phase's sub-agents run **sequentially or in parallel** is also the orchestrator's per-phase decision — e.g., during a validation phase a code-review agent and a security-review agent may run concurrently. Each sub-agent reads the same phase contract itself via `phasedev phase` (the orchestrator does not transmit the contract text) and self-validates with `phasedev check` before reporting. When several concurrent sub-agents would mutate the same artifact or registry (e.g., multiple `phasedev add-finding` writers on `validation_findings.md`), account for write races: either run those writers sequentially, or have the agents analyze in parallel and serialize the recording step. The framework guarantees only the invariant: `phasedev phase --change X` returns the same contract for every sub-agent until `advance --change X` is called — an advance on another change does not affect X's contract. This lock keeps N agents on a phase safe whether they run sequentially or in parallel.

What NOT to do:
- **Do not introduce** any phase→agent-count or phase→agent-type table, and do not hardcode per-phase counts ("for design — 3 agents").
- **Do not add** min/max agent limits per phase in config, code, or SKILL.md — the dynamic per-change decision must never become a static framework rule.

## Sub-Agent Spawning

For every executable phase, spawn a dedicated sub-agent via the `Agent` tool. Never execute phase work in the main agent.

**Two instruction layers.** The sub-agent works from two texts with distinct responsibilities. The **dispatch prompt** (below) owns the execution context: who the agent is (optional role), where it works (the change `<change>`, project root), how to invoke the CLI, what it must not do (no `advance`, no other `--change`), and how to report back. The **phase contract** (printed by `phasedev phase`) owns the work itself: the phase mission, artifacts and their formats, file write boundaries, methods and skill policy, readiness criteria, and the self-check. The two compose: the contract defines what "done" means and which self-check proves it; the dispatch prompt requires that proof before reporting.

**Agent type selection:** On EVERY run, review the list of available agent types for the `Agent` tool in the current session environment (the tool's agent-type list itself — NOT a static on-disk agent-definition folder, which may not reflect what the running session actually exposes). For each phase you MUST use a custom agent type whose description matches that phase's work when one exists; fall back to the generic/general-purpose type only when no available custom type fits. This is a per-phase, per-change judgment, made fresh each time — never fixed into a static phase→type table. If a custom agent's reports show it cannot access skills and the phase materially benefits from skills, you MAY prefer a generic agent (which has skill access by default) for that phase on the next dispatch — a per-phase judgment, not a fixed rule.

**Model selection:** When dispatching a `subagent_type` that has no pinned model (general-purpose and similar catch-all types), the `Agent` dispatch MUST pass an explicit `model` — an omitted model silently inherits the main agent's (typically the most expensive). When dispatching a custom agent that pins its model in its own definition, do NOT pass or override `model` for it.

The tier is the orchestrator's per-phase, per-change judgment (like agent count), sized to the complexity the phase contract actually requires — never a static phase→model table. When dispatching a generic type, always pass an explicit model and pick the CHEAPEST tier the task complexity allows: mechanical, narrowly-scoped work (e.g. archive delta specs) → the cheapest tier; routine single-phase artifact work → the mid tier; design-heavy, validation-heavy, or repair work needing real analysis → the strongest available tier. If a report shows the work was harder than expected, re-dispatch the remainder on a stronger model — an underpowered model on multi-step work often takes 2-3× the turns and costs more overall.

**Sub-agent prompt** (the single canonical prompt; goal and role lines are optional slots):

```javascript
Agent(
  description: "<phase-name>: execute phase contract",
  subagent_type: "<custom agent type matching the phase — see Agent type selection; OMIT for general-purpose>",
  model: "<explicit tier — see Model selection; OMIT when subagent_type pins its own model>",
  prompt: `Execute the current PhaseDev phase (run from the project root).

<goal description — CHANGE_INTAKE PHASE ONLY; omit this line for every other phase>

<Your role: <Architect | API Designer | Code Reviewer | DB Designer | ...>. The contract describes the ENTIRE phase; your role covers only your part — do not do others' work. — OPTIONAL ROLE LINE; omit for single-agent phases>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>". NEVER use npx, bunx, npm exec, npm run, bun run, or bun run src/cli.ts to launch it — just run "phasedev ...".

You work ONLY on the change "<change>". Never pass a different --change value.

1. Run: phasedev phase --change <change> — get the active phase contract.
2. Review the skills available in YOUR OWN runtime environment and select those whose purpose matches this phase's work; apply their methods as execution-method instructions. If the contract's skill policy lists configured skills, those configured skills take priority and any environment-discovered skill only supplements them under the same boundary; when it lists none, the policy itself directs environment discovery — skills never control Flow state (artifact formats, phase transitions, approvals, verdicts, archive state); PhaseDev owns those. If no skills list is visible in your context or the skill mechanism is unavailable, state "skills unavailable in environment" and complete the work strictly per the phase contract, which is self-sufficient.
3. Do the phase work per your role and the contract. The contract defines the artifacts, the self-check that gates completion, and your final-response format — follow it exactly; do not report success while its self-check fails.
4. Do NOT run phasedev advance — that is the orchestrator's job.
5. Report back with the contract's final response (it already includes the self-check command and result) and the per-skill compliance section it requires — one entry per environment-selected skill as APPLIED or NOT_APPLICABLE(evidence-specific reason), or the line "skills unavailable in environment" when none were visible. State any blockers explicitly.`
)
```

That is the entire prompt — no context collection, no artifact paths, no previous phase data, and no embedded `phasedev phase` output (every sub-agent runs it itself, keeping the orchestrator's context thin). Artifact self-validation and the final-response format are the sub-agent's duty under the contract; the orchestrator never inspects, judges, or fixes artifact content. If `phasedev check` returns issues after a sub-agent reported "complete", apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), not a silent re-spawn loop. The orchestrator never enumerates or transmits a skill list — each sub-agent discovers skills from its own runtime environment, keeping the orchestrator's context thin and harness-agnostic; the orchestrator only requires the compliance section to be present in the report.

## User Feedback Handling

At any STOP point (approval gate, `archive_ready` with `runArchiveStage=false`, blocker, or after user interrupt), the user may give feedback — a correction, new requirement, bug report, or rejection.

**Fast path (no sub-agent).** When the feedback is a concrete, already-formulated implementation defect ("here is a bug, put it into the findings"), do NOT spawn a sub-agent. Record it yourself with a single deterministic call:

```bash
phasedev add-finding "<defect summary>" MUST-FIX --required-fix "<required fix>" --class implementation --change <change>
```

(Command semantics are in the `add-finding` entry under [Command Invocation](#command-invocation-mandatory).) Then continue the loop — `phasedev advance` routes to finding_repair where the fix is implemented. Never hand-edit the findings registry and never edit repository code to handle feedback.

**Delegated path (feedback needs analysis).** When it is unclear whether the feedback is an implementation defect or a scope/design/plan change, or it is mixed, spawn a dedicated sub-agent:

```javascript
Agent(
  description: "process user feedback on PhaseDev change",
  subagent_type: "<custom agent type matching this work — see Agent type selection; OMIT for general-purpose>",
  model: "<explicit tier — see Model selection; OMIT when subagent_type pins its own model>",
  prompt: `The user has feedback on the current PhaseDev change.

Feedback: <user's full feedback text>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>".

You work ONLY on the change "<change>". Never pass a different --change value.

Run: phasedev feedback --change <change> — and follow the printed contract exactly. It defines how to classify the feedback, which phasedev commands to use, the write boundary, and your final report.

Before acting, review the skills available in your own runtime environment and apply those matching this work; include a per-skill compliance section in your final report (APPLIED / NOT_APPLICABLE(reason), or "skills unavailable in environment" when none are visible). Skills are method instructions only — they never change Flow state, approvals, or verdicts.`
)
```

After the fast path or the sub-agent return, run `phasedev check` and continue the main loop from that state — it guides the next action (`finding_repair` if findings were added, an approval gate if approvals were reset, iteration work if a phase is active). If `phasedev check` reports `state.json and the change artifacts disagree`, the feedback sub-agent forgot its final sync: run `phasedev sync-state --change <change>` yourself (deterministic, no sub-agent, never `reset-change`), then re-run `phasedev check`. After a scope change the loop legitimately resumes from an earlier phase (approval gates for the re-edited artifacts) — that is normal convergence, not a failure.

This applies equally on a fresh session where the user says "I have feedback on this change": run `phasedev list` first; if several unfinished changes exist and the user did not name one, ask which change the feedback targets. Then run `phasedev check` to determine the current state, then use the fast path or feedback sub-agent instead of the normal phase spawn.

## Invalid-artifact recovery policy

An artifact-invalid route (`invalid_prd`, `invalid_execution_contract`, `invalid_code_research`, `invalid_technical_design`, `invalid_iteration_planning`, `invalid_findings`) means the owning sub-agent reported completion without a passing self-check (or the state broke on resume: human edit, crashed session). `invalid_archive_state` is NOT included here — it is always a STOP. The orchestrator does NOT validate or fix the artifact; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning phase. Instruct it: run `phasedev phase` to get the fix contract (it lists the issues), review and apply matching skills from its own runtime environment, fix the artifact, then run `phasedev check` until it passes; include the per-skill compliance section in its report. Do NOT run `phasedev advance`; report back.
2. After it returns, call `phasedev check`:
   - Phase valid → continue the loop.
   - Same phase still invalid → **STOP**. Report "Sub-agent failed to self-validate `<artifact>` after one recovery attempt" with the issues. Do not spawn again.
3. Never turn this into a loop — the orchestrator is not the validation driver.

## Auto-Approval

When `phasedev config autoApprove` (from Initialization) is `true`, the orchestrator automatically approves change_intake, technical_design, and iteration_planning artifacts at approval gates instead of stopping to ask the user.

When `phasedev advance` refuses with an `*_approval` refusal, run `phasedev approve <file> --by "PhaseDev Orchestrator" --change <change>` (from the project root; filenames auto-resolve to the active change directory) instead of spawning a sub-agent, then retry `phasedev advance --change <change>`:
- `change_intake_approval` → approve `prd.md` and `execution_contract.md`.
- `technical_design_approval` → approve `design.md`.
- `iteration_planning_approval` → approve `iteration_plan.md`.

If advance then succeeds → continue the main loop. If it still refuses with the same `*_approval` → **STOP**, report "Auto-approve failed to advance after approving artifacts." Do not loop.

## Termination

Stop when any is met:
- **Flow complete** — `phasedev advance` returns `finished=true` (archive complete: `state.json` `activePhase: archive`, `.phase-archive.json` `status: completed`). Stop and report success.
- **Blocked** — approval gate, blocker (verify with `phasedev check`), or invalid state. At an approval gate: follow [Auto-Approval](#auto-approval) when `autoApprove` is true, otherwise tell the user to approve and wait.
- **No progress** — after sub-agents, `phasedev advance` still refuses with the same reason; for a repeated `invalid_*` this is the stop step of the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy).
- **CLI limit reached** — `advance` refuses with "Max iterations (N) reached" or "Repair cycle limit reached" (both enforced by the CLI from config.yaml `maxIterations` / `maxRepairCycles`); stop and report the refusal — raising the limit in config.yaml is the user's call.
- **Unrecoverable error** — sub-agent error after one retry.
- **User interrupt**.

## Archive Handling

Archive is entered when `phasedev advance` transitions to the archive phase (after final validation passes and all iterations are `[x]`).

1. Check the `runArchiveStage` value from Initialization before calling `advance`. If `false`, **do not call advance** — stop and report:
   > "Archive execution is paused by config (runArchiveStage=false). Set runArchiveStage=true in config.yaml to enable archive."
2. If `true`, call `phasedev advance --change <change>`. It performs the archive mutation (moves the change directory to `.phasedev/changes/archive/`, creates `.phase-archive.json` with `status: "in_progress"`), and switches `state.json` to `activePhase: archive`.
3. Spawn an archive sub-agent that reads the archive contract via `phasedev phase --change <change>`, applies any matching skills from its own runtime environment (including the per-skill compliance section in its report), writes delta specs, and sets `.phase-archive.json` `status: "completed"`. The sub-agent works only on the change `<change>` and must never pass a different `--change` value.
4. After the sub-agent returns, call `phasedev advance --change <change>`:
   - If it returns `finished=true` → the archive is complete → **flow complete** → STOP.
   - If it refuses ("Archive not complete") → sub-agent did not finish → no-progress → STOP and report.

## Important Rules

1. **NEVER execute phase work directly** — always spawn a sub-agent via `Agent`.
2. **ALWAYS invoke `phasedev` directly as a global command** — per [Command Invocation](#command-invocation-mandatory); restate the ban in every sub-agent prompt.
3. **Sub-agents NEVER run `phasedev advance`** — only the orchestrator calls it, after sub-agents report passing self-checks.
4. **ALWAYS use `phasedev check` to validate the active phase** — never read `.phasedev/` files directly.
5. **ALWAYS use `phasedev config` to read settings** — never read `config.yaml` directly.
6. **NEVER validate or fix phase artifacts yourself** — the owning sub-agent creates, self-checks, and self-heals each artifact; on `invalid_*` after "complete", apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy).
7. **NEVER pass context between phases** — sub-agents read artifact files directly; the filesystem is the durable state.
8. **NEVER re-describe phase contracts** — sub-agents get them from `phasedev phase`.
9. **NEVER log iterations to `.phasedev/logs/`** — the orchestrator is ephemeral; state is visible in chat.
10. **Report clearly** — after each iteration: phase completed, the model each phase sub-agent ran on, the sub-agent's self-check result, and the next phase `phasedev check` reports.
