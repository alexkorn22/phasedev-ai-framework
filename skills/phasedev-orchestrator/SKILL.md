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
- `phasedev create-change <name>` — create a change directory with `state.json` (`activePhase: change_intake`). Run once before the first `phase`.
- `phasedev list` — list active changes with phase, iteration, and task summary; archived changes are hidden by default, use `--archived` to see them. Run first at session start.
- `phasedev phase` — print the contract for the active phase (read-only, idempotent).
- `phasedev check [--phase <name>]` — validate artifacts of the active phase (or `--phase` override). Returns OK or issues list.
- `phasedev advance` — validate the active phase, then switch `state.json` to the next phase, or refuse on invalid/approval/blocked. The single mutation point for flow state.
- `phasedev approve <file>` — set `approved: true` and `approved_by` in an artifact's YAML frontmatter (see [Auto-Approval](#auto-approval)).
- `phasedev add-finding "<finding>" <severity> --required-fix <text> [--class <class>] [--iteration <label>]` — append a finding row to validation_findings.md; allocates the ID, creates the file when missing, and corrects the YAML `verdict`. The ONLY way to add a finding; never hand-edit the findings registry.
- `phasedev feedback` — print the user-feedback processing contract for a sub-agent.
- `phasedev status` — print a summary of the current flow state.
- `phasedev config <key>` — read config values.

Findings commands `reopen-finding`, `resolve-finding`, `set-verdict` are for sub-agents (see `phasedev help`); the orchestrator does not run them.

All commands run from the **project root**. `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted throughout.

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
   - If `check` returns issues, or advance refuses with `invalid_*` (artifact issues), `*_approval` (needs approval), or `archive_readiness_blocked` (iterations not complete) → spawn sub-agents on the **current** active phase.
3. **Verify:** when all sub-agents for the phase have reported with passing self-checks, run `phasedev advance`. If it accepts, loop from step 1. If it refuses, handle per [Auto-Approval](#auto-approval), [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), or [Termination](#termination).

**N sub-agents per phase is dynamic.** How many (1 or more) is exclusively the orchestrator's decision, made per-phase per-change — no framework-level binding ties phases to agent counts or types. Sub-agents run **sequentially**; each reads the same phase contract itself via `phasedev phase` (the orchestrator does not transmit the contract text) and self-validates with `phasedev check` before reporting. The framework guarantees only the invariant: `phasedev phase --change X` returns the same contract for every sub-agent until `advance --change X` is called — an advance on another change does not affect X's contract. This lock enables N sequential agents on any phase.

What NOT to do:
- **Do not introduce** any phase→agent-count or phase→agent-type table, and do not hardcode per-phase counts ("for design — 3 agents").
- **Do not add** min/max agent limits per phase in config, code, or SKILL.md — the dynamic per-change decision must never become a static framework rule.

## Sub-Agent Spawning

For every executable phase, spawn a dedicated sub-agent via the `Agent` tool. Never execute phase work in the main agent.

**Two instruction layers.** The sub-agent works from two texts with distinct responsibilities. The **dispatch prompt** (below) owns the execution context: who the agent is (optional role), where it works (the change `<change>`, project root), how to invoke the CLI, what it must not do (no `advance`, no other `--change`), and how to report back. The **phase contract** (printed by `phasedev phase`) owns the work itself: the phase mission, artifacts and their formats, file write boundaries, methods and skill policy, readiness criteria, and the self-check. The two compose: the contract defines what "done" means and which self-check proves it; the dispatch prompt requires that proof before reporting.

**Agent type selection:** Before the first spawn, review the list of available agent types for the `Agent` tool in the current session environment (the tool's agent-type list itself — NOT a directory on disk; `.claude/agents/` may not reflect what the running session actually exposes). For each phase, prefer the custom agent type whose description matches that phase's work over the default general-purpose type; fall back to general-purpose only when no available custom type fits. This is a per-phase, per-change judgment, made fresh each time — never fixed into a static phase→type table.

**Model selection:** When dispatching a `subagent_type` that has no pinned model (general-purpose and similar catch-all types), the `Agent` dispatch MUST pass an explicit `model` — an omitted model silently inherits the main agent's (typically the most expensive). When dispatching a custom agent that pins its model in its own definition, do NOT pass or override `model` for it.

The tier is the orchestrator's per-phase, per-change judgment (like agent count), sized to the complexity the phase contract actually requires — never a static phase→model table. Guidance: `"haiku"` for mechanical, narrowly-scoped work (e.g. archive delta specs); `"sonnet"` for routine single-phase artifact work; the strongest available tier (`"opus"`) for design-heavy, validation-heavy, or repair work needing real analysis. If a report shows the work was harder than expected, re-dispatch the remainder on a stronger model — an underpowered model on multi-step work often takes 2-3× the turns and costs more overall.

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
2. Do the phase work per your role and the contract. The contract defines the artifacts, the self-check that gates completion, and your final-response format — follow it exactly; do not report success while its self-check fails.
3. Do NOT run phasedev advance — that is the orchestrator's job.
4. Report back with the contract's final response (it already includes the self-check command and result); state any blockers explicitly.`
)
```

That is the entire prompt — no context collection, no artifact paths, no previous phase data, and no embedded `phasedev phase` output (every sub-agent runs it itself, keeping the orchestrator's context thin). Artifact self-validation and the final-response format are the sub-agent's duty under the contract; the orchestrator never inspects, judges, or fixes artifact content. If `phasedev check` returns issues after a sub-agent reported "complete", apply the [Invalid-artifact recovery policy](#invalid-artifact-recovery-policy), not a silent re-spawn loop.

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

Run: phasedev feedback --change <change> — and follow the printed contract exactly. It defines how to classify the feedback, which phasedev commands to use, the write boundary, and your final report.`
)
```

After the fast path or the sub-agent return, run `phasedev check` and continue the main loop from that state — it guides the next action (`finding_repair` if findings were added, an approval gate if approvals were reset, iteration work if a phase is active).

This applies equally on a fresh session where the user says "I have feedback on this change": run `phasedev list` first; if several unfinished changes exist and the user did not name one, ask which change the feedback targets. Then run `phasedev check` to determine the current state, then use the fast path or feedback sub-agent instead of the normal phase spawn.

## Invalid-artifact recovery policy

An artifact-invalid route (`invalid_prd`, `invalid_execution_contract`, `invalid_code_research`, `invalid_technical_design`, `invalid_iteration_planning`, `invalid_findings`) means the owning sub-agent reported completion without a passing self-check (or the state broke on resume: human edit, crashed session). `invalid_archive_state` is NOT included here — it is always a STOP. The orchestrator does NOT validate or fix the artifact; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning phase. Instruct it: run `phasedev phase` to get the fix contract (it lists the issues), fix the artifact, then run `phasedev check` until it passes. Do NOT run `phasedev advance`; report back.
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
3. Spawn an archive sub-agent that reads the archive contract via `phasedev phase --change <change>`, writes delta specs, and sets `.phase-archive.json` `status: "completed"`. The sub-agent works only on the change `<change>` and must never pass a different `--change` value.
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
