---
name: phasedev-orchestrator
description: PhaseDev AI Framework orchestrator. Thin loop controller that spawns dedicated sub-agents for each PhaseDev stage. No stage work is done by the main agent itself.
---

# PhaseDev Orchestrator — AI Flow Controller for PhaseDev Framework

## Overview

The **PhaseDev Orchestrator** transforms the main agent into a strict **flow controller** that delegates every PhaseDev stage — setup, research, design, plan, implementation, validation, repair, archive — to a dedicated sub-agent.

The orchestrator is intentionally **thin**:
- It uses `phasedev check` to determine the current route and matches it to an action in the Route Action Table.
- It spawns a sub-agent with a minimal prompt, then verifies the route advanced.
- It does **not** execute stage contracts, collect context, validate artifacts, fix invalid artifacts, or pass data between stages. Artifact creation, self-validation, and self-repair belong to the owning sub-agent.

```
┌──────────────────────────────────────┐
│           Main Agent                 │
│     (PhaseDev Flow Controller)       │
│  LOOP:                               │
│  1. phasedev check → current route   │
│  2. Match Route Action Table → act   │
│  3. Spawn sub-agent or stop          │
│  4. Verify route advanced            │
└──────────────────────────────────────┘
```

## When to Use

- Running the full PhaseDev flow with strict stage separation and isolated context per stage.
- Large projects where a single context cannot hold all stages of the flow.

## How to Invoke

```
$phasedev-orchestrator [goal description]
```

If a goal is provided, it is passed to the first `setup` sub-agent. Otherwise the orchestrator resumes from the current PhaseDev state.

**Goal injection:** for the first `setup` sub-agent only, prepend the goal description to the prompt as intake context (the setup contract expects task/change intake). For every later stage, pass no goal — sub-agents read artifact files directly.

## Command Invocation (mandatory)

`phasedev` is a **globally installed CLI** on `PATH`. Always invoke it directly as `phasedev <command>` — e.g. `phasedev init`, `phasedev next`, `phasedev check`, `phasedev config <key>`. **NEVER** wrap it in `npx`, `bunx`, `npm exec`, `npm run`, `bun run`, or `bun run src/cli.ts`. There is nothing to resolve and no fallback to try. This applies to the orchestrator and to every sub-agent prompt.

All commands run from the **project root** (the current working directory). `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted everywhere in this skill.

## Initialization

Before the loop, read orchestrator-safe settings:

```bash
phasedev config loop.maxIterations
```
→ Safety iteration limit. Default to **10** if empty/invalid. Stop with "Max iterations reached" when reached.

```bash
phasedev config loop.runArchiveStage
```
→ Remember for the archive stage check below.

```bash
phasedev config loop.autoApprove
```
→ When `true`, automatically approve setup/design/plan artifacts at approval gates instead of stopping for user input. Default to `false` if empty/invalid. Remember for the Auto-Approval section below.

## The Loop

Each iteration:

1. **Detect route:** `phasedev check` → parse `route is <route_kind> (stage: <stage>)` (or `FAILED: <route_kind>` for invalid-artifact routes, which is normal).
2. **Match** the route kind in the Route Action Table → spawn sub-agent, recovery-spawn, or stop.
3. **Verify:** after a sub-agent returns, run `phasedev check` again and confirm the route advanced (see no-progress in Termination). Loop.

## Sub-Agent Spawning

For every executable stage, spawn a dedicated sub-agent via the `Agent` tool. Never execute stage work in the main agent.

**Minimal sub-agent prompt:**

```javascript
Agent(
  description: "<stage-name>: execute stage contract",
  prompt: `Execute the current PhaseDev stage (run from the project root).

<goal description — SETUP STAGE ONLY; omit this line for every other stage>

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>". NEVER use npx, bunx, npm exec, npm run, bun run, or bun run src/cli.ts to launch it — just run "phasedev ...".

1. Run: phasedev init
2. Run: phasedev next
3. Follow the stage contract it prints exactly.
4. Treat the contract — including the Configured Skill Policy — as executable instructions, not optional guidelines. For each configured skill: apply its method or record a concrete evidence-based reason it doesn't apply. Never silently skip a configured skill.
5. Self-validate before completing (mandatory): the contract contains a "Self-check command" (a phasedev check ... call). Run it. If it fails, read the reported issues, fix the artifact you produced, and rerun the same command until it passes. You create the artifact — you validate it; the orchestrator does not validate artifacts for you.
6. Do NOT report the stage as complete while the self-check is failing or has not been run. If it cannot pass after you fix the artifact, report a blocker with the exact failing command and output.
7. Do NOT run phasedev init or phasedev next again — they advance flow state. Only the Self-check command may be rerun.
8. Report: the stage completed, the EXACT self-check command and its final result (PASS/FAIL), and any blockers.`
)
```

That is the entire prompt. No context collection, no artifact paths, no previous stage data — the contract from `phasedev next` already contains artifact templates, allowlist, skill policy, and the mandatory self-check. The sub-agent owns artifact validation, not the orchestrator. Do not embed the full `phasedev init` / `phasedev next` output into the sub-agent prompt — the sub-agent runs them itself; this keeps the orchestrator's context thin.

**Artifact self-validation is the sub-agent's duty.** The orchestrator only reads the resulting route via `phasedev check`; it never inspects, judges, or fixes artifact content. A report without a passing self-check result is an incomplete stage. If `phasedev check` reports an `invalid_*` route after a sub-agent reported "complete", that sub-agent skipped its self-check — apply the Invalid-artifact recovery policy, not a silent re-spawn loop.

## Route Action Table

This is the core reference. Match the route kind from `phasedev check` to the action.

| Route kind | Stage | Action | Notes |
|------------|-------|--------|-------|
| `setup` | setup | Spawn sub-agent | First run. No PRD/rules yet. |
| `invalid_prd` | setup | Recovery spawn (once) | See Invalid-artifact recovery. |
| `invalid_rules` | setup | Recovery spawn (once) | See Invalid-artifact recovery. |
| `setup_approval` | setup | **STOP — ask user**\* | "Approve prd.md & rules.md, set approved: true"\* |
| `research` | research | Spawn sub-agent | |
| `invalid_research` | research | Recovery spawn (once) | See Invalid-artifact recovery. |
| `design` | design | Spawn sub-agent | |
| `invalid_design` | design | Recovery spawn (once) | See Invalid-artifact recovery. |
| `design_approval` | design | **STOP — ask user**\* | "Approve architecture/design.md, set approved: true"\* |
| `plan` | plan | Spawn sub-agent | |
| `invalid_plan` | plan | Recovery spawn (once) | See Invalid-artifact recovery. |
| `plan_approval` | plan | **STOP — ask user**\* | "Approve implementation_plan.md, set approved: true"\* |
| `phase` | implementation / phase_validation | Spawn sub-agent | Impl or validation depending on current phase state. See the phase-route note below. |
| `invalid_findings` | repair | Recovery spawn (once) | Structurally malformed validation_findings.md (not a `repair_required` verdict). Created by validation, fixed by a repair-stage agent. |
| `repair` | repair | Spawn sub-agent | |
| `final_validation` | final_validation | Spawn sub-agent | |
| `archive_readiness_blocked` | archive | **STOP — inform user** | "All phases must be [x]. Check implementation_plan.md" |
| `archive_ready` / `pending_archive` | archive | Spawn sub-agent (if config allows) | Check loop.runArchiveStage first. |
| `invalid_archive_state` | archive | **STOP — inform user** | Report the invalid archive state reason. |

\* When `loop.autoApprove` is `true` (from Initialization), instead of stopping and asking the user, follow the [Auto-Approval](#auto-approval) procedure below.

**`phase` route progress (important for the repair/validation cycle):** the kind `phase` legitimately repeats; `phasedev check` prints `route is phase (stage: implementation)` or `(stage: phase_validation)`. Compare **both kind and stage**, not kind alone:
- `implementation → phase_validation` (same phase), or `phase_validation → implementation` (next phase): stage changed → progress.
- `repair → phase` (re-validation after `repaired`) or `phase → repair` (`repair_required`): kind changed → progress.
- Same kind+stage for the same phase after a sub-agent (e.g. still `phase (stage: implementation)`, or still `repair`): no progress → stop.
- **Implementation blocked detection:** If the route is `phase (stage: implementation)` and the current phase's `checkEvidence` has `blocked` or `failed` rows, the spawned sub-agent's `phasedev next` prompt will reflect blocked evidence. After the sub-agent returns, the "Same kind+stage" rule above catches no-progress — one iteration is consumed to discover the block. This is correct behavior, not a bug.

## Invalid-artifact recovery policy

One of the artifact-invalid routes (`invalid_prd`, `invalid_rules`, `invalid_research`, `invalid_design`, `invalid_plan`, `invalid_findings`) means the owning stage's sub-agent reported completion without a passing self-check (or the state was already broken on resume: human edit, crashed session). `invalid_archive_state` is NOT included here — it is always a STOP. The orchestrator does NOT validate or fix the artifact; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning stage. Its `phasedev next` returns a fix contract listing the issues (no self-check embedded). Instruct it: fix the artifact, then run `phasedev check` and confirm the route is no longer `invalid_*`. The fix contract says "run 'phasedev next' again" — the recovery sub-agent must NOT; `phasedev next` would advance into the next stage and re-bloat context. Verify with `phasedev check` only, then report back.
2. After it returns, run `phasedev check`:
   - Route advanced beyond `invalid_*` → continue the loop.
   - Same `invalid_*` persists → **STOP**. Report "Sub-agent failed to self-validate `<artifact>` after one recovery attempt" with the route and issues. Do not spawn again.
3. Never turn this into a loop — the orchestrator is not the validation driver.

## Auto-Approval

When `phasedev config loop.autoApprove` (from Initialization) is `true`, the orchestrator automatically approves setup, design, and plan artifacts at approval gates instead of stopping to ask the user.

**How it works for each approval gate:**

| Route kind | Auto-approve action |
|------------|---------------------|
| `setup_approval` | Spawn a sub-agent that: reads `prd.md` and `rules.md`, sets `approved: true` in their YAML frontmatter, then runs `phasedev check` to confirm the route advanced beyond `setup_approval`. |
| `design_approval` | Spawn a sub-agent that: reads `architecture/design.md`, sets `approved: true` in its YAML frontmatter, then runs `phasedev check` to confirm the route advanced beyond `design_approval`. |
| `plan_approval` | Spawn a sub-agent that: reads `implementation_plan.md`, sets `approved: true` in its YAML frontmatter, then runs `phasedev check` to confirm the route advanced beyond `plan_approval`. |

**Auto-approve sub-agent prompt (use for all three gates, replace `<artifact-paths>` with the actual paths):**

```javascript
Agent(
  description: "auto-approve: set approved=true on artifacts",
  prompt: `Auto-approve PhaseDev artifacts.

phasedev is a GLOBAL CLI. Invoke it directly as "phasedev <command>". NEVER use npx, bunx, npm exec, npm run, or bun run.

1. Read each artifact file at: <artifact-paths>
2. For each file, set \`approved: true\` and \`approved_by: "PhaseDev Orchestrator"\` in its YAML frontmatter.
3. Run: phasedev check
4. Confirm the route advanced beyond the approval gate. If not, report the current route as a blocker.
5. Report: which files were approved and the final route.`
)
```

**After the auto-approve sub-agent returns:**
- Run `phasedev check` to confirm the route advanced beyond the approval gate.
- **Advanced** → continue the main loop normally (the route is now `research`, `plan`, `phase`, or whatever comes next).
- **Same approval gate persists** → **STOP**. Report "Auto-approve failed to advance route `<kind>` after updating artifacts." Do not loop.

## Termination

Stop when any is met:
- **Flow complete** — Archive is terminal. If you spawned an archive sub-agent this iteration (route was `archive_ready` or `pending_archive`) and the next `phasedev check` returns a **non**-archive route, the change was archived (it moved to `.phasedev/changes/archive/`, no active change remains, so the route fell back to `setup`). Treat the flow as complete: STOP and report success. Do **NOT** spawn a `setup` sub-agent for that `setup` route. (This mirrors how `runner.ts` detects completion via `hasCompletedArchivedChange`.)
- **Blocked** — approval gate, blocker, or invalid state. Approval gates (`setup_approval`, `design_approval`, `plan_approval`): when `loop.autoApprove` is true, follow [Auto-Approval](#auto-approval); otherwise tell the user to approve and wait.
- **No progress** — after a sub-agent, the route kind+stage is unchanged (same phase), or `invalid_*` persists after one recovery spawn.
- **Max iterations** — `loop.maxIterations` reached.
- **Unrecoverable error** — sub-agent error after one retry.
- **User interrupt**.

## Archive Handling

When `phasedev check` returns `archive_ready` (archive not started yet) or `pending_archive` (archive already started — resume of the same Archive prompt):
1. Check the `loop.runArchiveStage` value from Initialization.
2. If `false`, do NOT spawn the archive sub-agent. Stop and report:
   > "Archive execution is paused by config (loop.runArchiveStage=false). Run 'phasedev next' manually to start Archive, or set loop.runArchiveStage=true in config.yaml."
3. If `true` (or absent), spawn the archive sub-agent normally.
4. After the archive sub-agent returns, run `phasedev check` once:
   - **Non-archive route** → the change was archived → **flow complete** (see Termination) → STOP.
   - **`pending_archive` again** → the archive sub-agent did not finish `.flow-archive.json` (`status: completed`) → no-progress → STOP and report.
   - **`invalid_archive_state`** → STOP and report the reason.

## Error Handling

| Error | Action |
|-------|--------|
| Sub-agent error / timeout / API error | Retry once. If it fails again, stop and report. |
| Sub-agent reports a blocker | Run `phasedev check`. If still same route → stop, report block reason. |
| `invalid_*` after sub-agent reported "complete" | Sub-agent skipped its self-check. Apply Invalid-artifact recovery: one spawn, then stop if still invalid. |
| Unrecognized route kind | Stop and report the unknown route. |

## Important Rules

1. **NEVER execute stage work directly** — always spawn a sub-agent via `Agent`.
2. **ALWAYS invoke `phasedev` directly as a global command** — never `npx`/`bunx`/`npm exec`/`npm run`/`bun run`. Restate this in every sub-agent prompt.
3. **NEVER run `phasedev init` or `phasedev next` yourself** — the sub-agent does.
4. **ALWAYS use `phasedev check` to determine the route** — never read `.phasedev/` files to infer the stage.
5. **ALWAYS use `phasedev config` to read settings** — never read `config.yaml` directly.
6. **NEVER validate or fix stage artifacts yourself** — the owning sub-agent creates, self-checks, and self-heals each artifact. An `invalid_*` route after "complete" is a self-check violation: one recovery spawn, then stop.
7. **NEVER pass context between stages** — sub-agents read artifact files directly; the filesystem is the durable state.
8. **NEVER re-describe stage contracts** — sub-agents get them from `phasedev next`.
9. **NEVER log iterations to `.phasedev/logs/`** — the orchestrator is ephemeral; state is visible in chat.
10. **Report clearly** — after each iteration: stage completed, the sub-agent's self-check result, and the next route `phasedev check` reports.
