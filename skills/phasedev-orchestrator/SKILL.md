---
name: phasedev-orchestrator
description: PhaseDev AI Framework orchestrator. Thin loop controller that spawns dedicated sub-agents for each PhaseDev phase. No phase work is done by the main agent itself.
---

# PhaseDev Orchestrator — AI Flow Controller for PhaseDev Framework

## Overview

The **PhaseDev Orchestrator** transforms the main agent into a strict **flow controller** that delegates every PhaseDev phase — change_intake, code_research, technical_design, iteration_planning, implementation, validation, finding_repair, archive — to a dedicated sub-agent.

The orchestrator is intentionally **thin**:
- It uses `phasedev check` to validate the active phase, `phasedev advance` to switch phases, and spawns sub-agents for phase work.
- It spawns a sub-agent with a minimal prompt, then verifies the phase advanced.
- It does **not** execute phase contracts, collect context, validate artifacts, fix invalid artifacts, or pass data between phases. Artifact creation, self-validation, and self-repair belong to the owning sub-agent.

```
┌──────────────────────────────────────┐
│           Main Agent                 │
│     (PhaseDev Flow Controller)       │
│  LOOP:                               │
│  1. phasedev check → phase valid?    │
│  2. advance or spawn sub-agents      │
│  3. verify phase switched            │
└──────────────────────────────────────┘
```

## When to Use

- Running the full PhaseDev flow with strict phase separation and isolated context per phase.
- Large projects where a single context cannot hold all phases of the flow.

## How to Invoke

```
$phasedev-orchestrator [goal description]
```

If a goal is provided, it is passed to the first `change_intake` sub-agent. Otherwise the orchestrator resumes from the current PhaseDev state.

**Goal injection:** for the first `change_intake` sub-agent only, prepend the goal description to the prompt as intake context (the change_intake contract expects task/change intake). For every later phase, pass no goal — sub-agents read artifact files directly.

## Command Invocation (mandatory)

`phasedev` is a **globally installed CLI** on `PATH`. Always invoke it directly as `phasedev <command>` — e.g. `phasedev create-change`, `phasedev phase`, `phasedev check`, `phasedev advance`, `phasedev approve`, `phasedev config <key>`. **NEVER** wrap it in `npx`, `bunx`, `npm exec`, `npm run`, `bun run`, or `bun run src/cli.ts`. There is nothing to resolve and no fallback to try (except when the phase controller's self-check fallback block provides explicit alternatives — in that case, follow the controller's instructions). This applies to the orchestrator and to every sub-agent prompt.

**Core orchestrator commands:**
- `phasedev create-change <name>` — create a change directory with `state.json` (`activePhase: change_intake`). Run once before the first `phase`.
- `phasedev phase` — print the contract for the active phase (read-only, idempotent). The same contract is returned for all sub-agents until `advance` is called.
- `phasedev check [--phase <name>]` — validate artifacts of the active phase (or `--phase` override). Returns OK or issues list.
- `phasedev advance` — validate active phase, compute next phase via `resolveRoute`, and switch `state.json`. Refuses on invalid/approval/blocked. Single mutation point for flow state.
- `phasedev approve <file>` — set `approved: true` and `approved_by` in an artifact's YAML frontmatter. Used for auto-approval (see [Auto-Approval](#auto-approval)).
- `phasedev add-finding "<finding>" <severity> --required-fix <text> [--class <class>] [--iteration <label>]` — append a finding row to validation_findings.md. Allocates the ID automatically, creates the file when missing, and corrects the YAML `verdict` (e.g. ready -> repair_required for an open MUST-FIX). The ONLY way to add a finding; never hand-edit the findings registry.
- `phasedev reopen-finding <id> --evidence <text>` — reopen a resolved finding with new evidence.
- `phasedev resolve-finding <id> --resolution <text>` — mark a finding resolved with repair evidence (used by repair sub-agents; listed for completeness).
- `phasedev set-verdict <verdict>` — record the validation verdict in validation_findings.md (validates consistency with the current rows; used by validation sub-agents).
- `phasedev feedback` — print the user-feedback processing contract for a sub-agent.
- `phasedev status` — print a summary of the current flow state (active change, phase, artifacts, iteration statuses, validation findings).
- `phasedev config <key>` — read config values.

All commands run from the **project root** (the current working directory). `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted everywhere in this skill.

## Initialization

Before the loop, create the change (one time) and read orchestrator-safe settings:

```bash
phasedev create-change <name>
```
→ Create a change directory with `state.json` (`activePhase: change_intake`). Derive `<name>` from the user's goal (slugify). This must be done **before** the first `phase`. Subsequent invocations in the same change skip this step.

```bash
phasedev config maxIterations
```
→ Safety iteration limit. Default to **10** if empty/invalid. Stop with "Max iterations reached" when reached.

```bash
phasedev config runArchiveStage
```
→ Remember for the archive phase check below.

```bash
phasedev config autoApprove
```
→ When `true`, automatically approve change_intake/technical_design/iteration_planning artifacts at approval gates instead of stopping for user input. Default to `false` if empty/invalid. Remember for the Auto-Approval section below.

## The Loop

Each iteration:

1. **Validate active phase:** `phasedev check` — is the active phase ready to advance? (checks artifact validity, approval not required here)
2. **Advance or work:**
   - If `check` returns OK and no approval is needed → run `phasedev advance`. If advance succeeds, the phase switched. Spawn sub-agents on the **new** phase.
   - If `check` returns issues (work needed) or advance refused (`*_approval`) → spawn sub-agents on the **current** active phase. Each sub-agent reads the same phase contract via `phasedev phase`, does its work, self-validates (`phasedev check`), and reports.
3. **Verify:** after sub-agents complete and self-check passes, run `phasedev advance`. If it accepts, loop from step 1. If it refuses (approval gate, invalid artifact, archive blocked), handle accordingly.

## N Sub-Agents Per Phase

The orchestrator decides **dynamically** how many sub-agents (1 or more) to spawn for any phase. There is no framework-level table binding phases to agent counts or agent types. The orchestrator evaluates the change context and chooses N per-phase per-change.

- Sub-agents run **sequentially**, each reading the **same** phase contract via `phasedev phase`.
- The orchestrator does not transmit the contract text — every sub-agent calls `phasedev phase` itself.
- Each sub-agent works on its assigned portion, runs `phasedev check` (self-validates the active phase), and reports results.
- When all sub-agents for the current phase have reported with passing self-checks, the orchestrator calls `phasedev advance`.

Key invariant: `phasedev phase` returns the same contract for every sub-agent until `advance` is called. This lock enables N sequential agents on any phase.

### ⚠️ What NOT to do

- **Do not introduce a table** mapping phases to agent counts or agent types — there is no such binding.
- **Do not hardcode** "for design — 3 agents" or "for final_validation — 2 reviewers" or similar per-phase counts.
- **Do not add** min/max agent limits per phase in config, code, or SKILL.md.
- **Do not replace** the dynamic-per-change decision with a static framework rule.

The framework guarantees only the invariant: `phasedev phase` returns the same contract for all agents until `advance` is called. How many agents to spawn is exclusively the orchestrator's decision, made per-phase per-change, without any framework-level binding.

## Sub-Agent Spawning

For every executable phase, spawn a dedicated sub-agent via the `Agent` tool. Never execute phase work in the main agent.

**Agent type selection:** The orchestrator decides which agent type best suits each phase. Check the available agent types in the environment — if a custom user agent (e.g. a project-specific agent defined in `.claude/agents/` or listed in the available agent types) is a better fit for the current phase than the default general-purpose agent, pass its name as `subagent_type`. This lets project teams define specialized agents with their own system prompts, tools, and model preferences for each phase, while the orchestrator picks the right one per phase at runtime.

### Role prompt (for orchestrator to inject when spawning sub-agents)

When spawning a sub-agent, the orchestrator selects an optional role description based on the phase and context. The role prompt is injected into the sub-agent's instructions as a separate block.

**Role prompt block** (add before the numbered steps when a specific role is needed):

```
Your role: <Architect | API Designer | Code Reviewer | DB Designer | ...>. Execute the current PhaseDev phase.

1. Run: phasedev phase — get the contract for the active phase.
2. The contract describes the ENTIRE phase. Your role covers only your part. Do not do others' work.
3. Work on the artifacts of the active phase according to your role and the contract.
4. Run: phasedev check — self-check the active phase. Fix → re-run until OK.
5. Do NOT run phasedev advance (that is the orchestrator's job).
6. Report: phase completed, self-check result (PASS/FAIL), blockers.
```

**Base sub-agent prompt** (always used, role prompt appended when applicable):

```javascript
Agent(
  description: "<phase-name>: execute phase contract",
  prompt: `Execute the current PhaseDev phase (run from the project root).

<goal description — CHANGE_INTAKE PHASE ONLY; omit this line for every other phase>

<OPTIONAL ROLE PROMPT BLOCK — see above. Omit for single-agent phases.>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>". NEVER use npx, bunx, npm exec, npm run, bun run, or bun run src/cli.ts to launch it — just run "phasedev ...".

1. Run command: phasedev phase — get the active phase contract.
2. Work on the artifacts of the active phase according to your role and the contract.
3. Self-validate before reporting (mandatory): run phasedev check. If it fails, read the reported issues, fix the artifact, and rerun phasedev check until it passes. You create the artifact — you validate it; the orchestrator does not validate artifacts for you.
4. Do NOT report the phase as complete while the self-check is failing or has not been run. If it cannot pass after you fix the artifact, report a blocker with the exact failing command and output.
5. Do NOT run phasedev advance — that is the orchestrator's job. Only the self-check command (phasedev check) may be rerun.
6. Report: the phase completed, the EXACT self-check command and its final result (PASS/FAIL), and any blockers.`
)
```

That is the entire prompt. No context collection, no artifact paths, no previous phase data — the contract from `phasedev phase` already contains artifact templates, allowlist, configured skill policy if present, and the mandatory self-check. The sub-agent owns artifact validation, not the orchestrator. Do not embed the full `phasedev phase` output into the sub-agent prompt — the sub-agent runs it itself; this keeps the orchestrator's context thin.

**Artifact self-validation is the sub-agent's duty.** The orchestrator only checks the phase state via `phasedev check`; it never inspects, judges, or fixes artifact content. A report without a passing self-check result is an incomplete phase. If `phasedev check` returns issues after a sub-agent reported "complete", that sub-agent skipped its self-check — apply the Invalid-artifact recovery policy, not a silent re-spawn loop.

## Phase-Driven Actions

The orchestrator does not use a route-action table. Instead, it follows the loop above:

- `phasedev check` tells whether the active phase's artifacts are valid.
- `phasedev advance` tells whether the flow can move to the next phase (it validates, computes the next phase via `resolveRoute`, and mutates `state.json`).
- When advance refuses — whether due to `invalid_*` (artifact issues), `*_approval` (needs approval), or `archive_readiness_blocked` (iterations not complete) — the orchestrator spawns sub-agents on the **current** active phase to fix the issue.
- When advance succeeds and switches the phase, the orchestrator spawns sub-agents on the **new** phase.

The orchestrator chooses N sub-agents (1 or more) for the current phase dynamically, without any framework-level binding between phases and agent counts. Each sub-agent reads the same phase contract via `phasedev phase`.

## User Feedback Handling

At any STOP point (approval gate, `archive_ready` with `runArchiveStage=false`, blocker, or after user interrupt), the user may give feedback — a correction, a new requirement, a bug report, or a rejection of the current output.

**Fast path (no sub-agent).** When the feedback is a concrete, already-formulated implementation defect ("here is a bug, put it into the findings"), do NOT spawn a sub-agent. Record it yourself with a single deterministic call (same precedent as Auto-Approval — a controller operation without interpretation):

```bash
phasedev add-finding "<defect summary>" MUST-FIX --required-fix "<required fix>" --class implementation
```

The command allocates the ID, creates validation_findings.md when missing, and corrects the verdict (e.g. ready -> repair_required). Then continue the loop — `phasedev advance` routes to finding_repair where the fix is implemented. Never hand-edit the findings registry and never edit repository code to handle feedback.

**Delegated path (feedback needs analysis).** When it is unclear whether the feedback is an implementation defect or a scope/design/plan change, or it is mixed, spawn a dedicated sub-agent:

```javascript
Agent(
  description: "process user feedback on PhaseDev change",
  prompt: `The user has feedback on the current PhaseDev change.

Feedback: <user's full feedback text>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>".

Run: phasedev feedback — and follow the printed contract exactly. It defines how to classify the feedback, which phasedev commands to use, and the write boundary.
Do NOT run phasedev advance — the orchestrator continues the loop after you finish.
Report: recorded finding IDs, changed artifacts and their approval status, and the result of phasedev check.`
)
```

After the fast path or the sub-agent return, run `phasedev check` and continue the main loop from that state — `phasedev check` will guide the next action (e.g. `finding_repair` if findings were added, approval gate if approvals were reset, iteration work if a phase is active).

The same mechanism applies whether the orchestrator stopped at an approval gate, before archive, or after user interrupt. It also applies when a new session starts and the user says "I have feedback on this change" — the orchestrator runs `phasedev check` to determine the current state, then uses the fast path or the feedback sub-agent instead of the normal phase spawn.

**No special state needed.** The framework's existing flow handles the rest.

## Invalid-artifact recovery policy

One of the artifact-invalid routes (`invalid_prd`, `invalid_execution_contract`, `invalid_code_research`, `invalid_technical_design`, `invalid_iteration_planning`, `invalid_findings`) means the owning phase's sub-agent reported completion without a passing self-check (or the state was already broken on resume: human edit, crashed session). `invalid_archive_state` is NOT included here — it is always a STOP. The orchestrator does NOT validate or fix the artifact; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning phase. Instruct it: run `phasedev phase` to get the fix contract (it lists the issues), fix the artifact, then run `phasedev check` until it passes. Do NOT run `phasedev advance`. Verify with `phasedev check` only, then report back.
2. After it returns, call `phasedev check`:
   - Phase valid → continue the loop.
   - Same phase still invalid → **STOP**. Report "Sub-agent failed to self-validate `<artifact>` after one recovery attempt" with the issues. Do not spawn again.
3. Never turn this into a loop — the orchestrator is not the validation driver.

## Auto-Approval

When `phasedev config autoApprove` (from Initialization) is `true`, the orchestrator automatically approves change_intake, technical_design, and iteration_planning artifacts at approval gates instead of stopping to ask the user.

**How it works for each approval gate:**

When `phasedev advance` refuses with an `*_approval` refusal:
- `change_intake_approval` → Run `phasedev approve prd.md --by "PhaseDev Orchestrator"` and `phasedev approve execution_contract.md --by "PhaseDev Orchestrator"`, then retry `phasedev advance`.
- `technical_design_approval` → Run `phasedev approve design.md --by "PhaseDev Orchestrator"`, then retry `phasedev advance`.
- `iteration_planning_approval` → Run `phasedev approve iteration_plan.md --by "PhaseDev Orchestrator"`, then retry `phasedev advance`.

**Auto-approve procedure (use `phasedev approve` instead of spawning a sub-agent):**

1. Run `phasedev approve <file>` for each approval artifact (from the project root; filenames auto-resolve to the active change directory).
2. Run `phasedev advance` to move past the approval gate.
3. If advance succeeds → continue the main loop normally.
4. If advance still refuses with the same `*_approval` → **STOP**. Report "Auto-approve failed to advance after approving artifacts." Do not loop.

## Termination

Stop when any is met:
- **Flow complete** — `phasedev advance` returns `finished=true` (archive phase completion). The archive `state.json` has `activePhase: archive` and `.phase-archive.json` has `status: completed`. The orchestrator stops and reports success.
- **Blocked** — approval gate, blocker, or invalid state. Approval gates (`change_intake_approval`, `technical_design_approval`, `iteration_planning_approval`): when `autoApprove` is true, follow [Auto-Approval](#auto-approval); otherwise tell the user to approve and wait.
- **No progress** — after sub-agents, `phasedev advance` still refuses with the same reason (invalid artifact, approval gate, or blocked). `phasedev check` returns same issues after a sub-agent reported "complete" — apply Invalid-artifact recovery policy.
- **Max iterations** — `maxIterations` reached.
- **Unrecoverable error** — sub-agent error after one retry.
- **User interrupt**.

## Archive Handling

Archive is entered when `phasedev advance` transitions to the archive phase (after final validation passes and all iterations are `[x]`). The archive phase contract is printed via `phasedev phase`.

1. Check the `runArchiveStage` value from Initialization before calling `advance`. If `false`, **do not call advance** — stop and report:
   > "Archive execution is paused by config (runArchiveStage=false). Set runArchiveStage=true in config.yaml to enable archive."
2. If `true`, call `phasedev advance`. It performs the archive mutation (moves the change directory to `.phasedev/changes/archive/`, creates `.phase-archive.json` with `status: "in_progress"`), and switches `state.json` to `activePhase: archive`.
3. Spawn an archive sub-agent that reads the archive contract via `phasedev phase`, writes delta specs, and sets `.phase-archive.json` `status: "completed"`.
4. After the sub-agent returns, call `phasedev advance`:
   - If it returns `finished=true` → the archive is complete → **flow complete** → STOP.
   - If it refuses ("Archive not complete") → sub-agent did not finish → no-progress → STOP and report.

## Error Handling

| Error | Action |
|-------|--------|
| Sub-agent error / timeout / API error | Retry once. If it fails again, stop and report. |
| Sub-agent reports a blocker | Run `phasedev check`. If still same phase issues → stop, report block reason. |
| `invalid_*` after sub-agent reported "complete" | Sub-agent skipped its self-check. Apply Invalid-artifact recovery: one spawn, then stop if still invalid. |
| `phasedev advance` refuses unexpectedly | Check the refusal message. If `*_approval` and autoApprove enabled, approve and retry. Otherwise stop and report. |

## Important Rules

1. **NEVER execute phase work directly** — always spawn a sub-agent via `Agent`.
2. **ALWAYS invoke `phasedev` directly as a global command** — never `npx`/`bunx`/`npm exec`/`npm run`/`bun run`. Restate this in every sub-agent prompt.
3. **NEVER run `phasedev advance` yourself** — the orchestrator does.
4. **ALWAYS use `phasedev check` to validate the active phase** — never read `.phasedev/` files directly.
5. **ALWAYS use `phasedev config` to read settings** — never read `config.yaml` directly.
6. **NEVER validate or fix phase artifacts yourself** — the owning sub-agent creates, self-checks, and self-heals each artifact. An `invalid_*` phase after "complete" is a self-check violation: one recovery spawn, then stop.
7. **NEVER pass context between phases** — sub-agents read artifact files directly; the filesystem is the durable state.
8. **NEVER re-describe phase contracts** — sub-agents get them from `phasedev phase`.
9. **NEVER log iterations to `.phasedev/logs/`** — the orchestrator is ephemeral; state is visible in chat.
10. **Report clearly** — after each iteration: phase completed, the sub-agent's self-check result, and the next phase `phasedev check` reports.
