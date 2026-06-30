---
name: phasedev-orchestrator
description: PhaseDev AI Framework orchestrator. Thin loop controller that spawns dedicated sub-agents for each PhaseDev stage. No stage work is done by the main agent itself.
---

# PhaseDev Orchestrator — AI Flow Controller for PhaseDev Framework

## Overview

The **PhaseDev Orchestrator** is a skill for the [PhaseDev AI Framework](https://github.com/ag-dev-flow/ag-dev-flow). It transforms the main agent into a strict **flow controller** that delegates every PhaseDev stage — setup, research, design, plan, implementation, validation, repair, archive — to a dedicated sub-agent.

The orchestrator is intentionally **thin**:
- It knows the PhaseDev flow model and uses `phasedev check` to determine the current route.
- It spawns a sub-agent with a minimal prompt: "run `phasedev init`, then `phasedev next`, follow the stage contract, report completion."
- It does **not** parse stage contracts, collect context, validate stage artifacts, fix invalid artifacts, log iterations, or pass artifact data between stages. Artifact creation, self-validation, and self-repair belong to the owning sub-agent; the orchestrator only reads the resulting route via `phasedev check`.

```
┌──────────────────────────────────────┐
│           Main Agent                 │
│     (PhaseDev Flow Controller)       │
│                                      │
│  LOOP:                               │
│  1. phasedev check → current route   │
│  2. Interpret route → action         │
│  3. Spawn sub-agent or stop          │
│  4. Verify completion via check      │
└──────────────────────────────────────┘
         │                    ▲
         ▼                    │
  ┌──────────────┐   ┌──────────────┐
  │ Sub-agent 1  │   │ Sub-agent 2  │
  │  (setup)     │   │ (research)   │  ...
  └──────────────┘   └──────────────┘
```

## When to Use

- Running the full PhaseDev development flow (PRD → research → design → plan → implement → validate → repair → archive)
- Tasks that require strict stage separation with isolated context per stage
- Large projects where a single context cannot hold all stages of the PhaseDev flow
- Any PhaseDev project where each stage should run in a dedicated sub-agent

## How to Invoke

```
$phasedev-orchestrator [goal description]
```

If a goal is provided, it will be passed to the first `setup` sub-agent. Otherwise the orchestrator resumes from the current PhaseDev state.

## PhaseDev Flow Model

The orchestrator embeds the PhaseDev stage sequence:

```
setup → research → design → plan → implementation  ←→  phase_validation
                                                               ↓
                                                           repair
                                                               ↓
                                                       final_validation → archive
```

Each stage produces an artifact. The next stage is determined by which artifacts exist and pass validation — this state is read via `phasedev check`.

### Stage Artifacts

| Stage | Produces | Read by next stage |
|-------|----------|--------------------|
| `setup` | `prd.md`, `rules.md` | research |
| `research` | `research_facts.md` | design |
| `design` | `architecture/design.md` | plan |
| `plan` | `implementation_plan.md` | implementation |
| `implementation` | Production code + plan updates | phase_validation |
| `phase_validation` | `validation_findings.md` (type: phase) | repair or next phase |
| `repair` | Fixed code + updated findings | phase_validation or final_validation |
| `final_validation` | `validation_findings.md` (type: final) | archive |
| `archive` | Archived change | done |

### Approval Gates

After `setup`, `design`, and `plan`, the flow pauses for human approval of the artifact (`approved: true` in YAML frontmatter).

## Flow Phases

### 1. Initialization

All `phasedev` commands (orchestrator and sub-agents) run from the **project root**, which is the current working directory. `phasedev` defaults to `process.cwd()`, so `--project-path` is omitted everywhere in this skill.

Before any stage execution, read orchestrator-safe settings:

```bash
phasedev config loop.maxIterations
```

→ Use the returned number as the safety iteration limit. Default to **10** if the CLI returns nothing or an invalid value. If the orchestrator loop reaches this limit, stop with "Max iterations reached" and report.

```bash
phasedev config loop.runArchiveStage
```

→ Remember this value for the archive stage check below.

### 2. Stage Detection

At the start of each loop iteration, resolve the current PhaseDev route:

```bash
phasedev check
```

Parse the route kind from the output:
- `[PHASEDEV CHECK] OK: current route is <route_kind> (stage: <stage>).`
- `[PHASEDEV CHECK] FAILED: <route_kind> (stage: <stage>)` (this is normal for invalid-artifact routes)

The route kind determines what to do next. See the Route Action Table below.

### 3. Route Resolution

Match the route kind from `phasedev check` to one of these actions:

| Category | Action |
|----------|--------|
| **Executable stage** | Spawn sub-agent |
| **Approval gate** | Stop, tell user to approve |
| **Invalid artifact** | Spawn sub-agent for owning stage |
| **Blocker** | Stop, report reason |
| **Archive** | Check config, then sub-agent or stop |
| **Flow complete** | Report success |

See the full **Route Action Table** section below for the exact mapping of all 19 route kinds.

### 4. Sub-Agent Spawning

For every executable stage, spawn a dedicated sub-agent via the `Agent` tool. Never execute stage work directly in the main agent.

**Minimal sub-agent prompt:**

```javascript
Agent(
  description: "<stage-name>: execute stage contract",
  prompt: `Execute the current PhaseDev stage (run from the project root).

1. Run: phasedev init
2. Run: phasedev next
3. Follow the stage contract it prints exactly.
4. Self-validate before completing (mandatory): the contract contains a "Self-check command" (a phasedev check ... call). Run it. If it fails, read the reported issues, fix the artifact you produced, and rerun the same command until it passes. You create the artifact — you validate it; the orchestrator does not validate artifacts for you.
5. Do NOT report the stage as complete while the self-check is failing or has not been run. If it cannot pass after you fix the artifact, report a blocker with the exact failing command and output.
6. Do NOT run phasedev init or phasedev next again — they advance flow state. Only the Self-check command may be rerun.
7. Report: the stage completed, the EXACT self-check command and its final result (PASS/FAIL), and any blockers.`
)
```

That is the entire prompt. No context collection, no artifact paths, no previous stage data. The sub-agent:
1. Reads the state via `phasedev init` (acknowledges the handshake)
2. Gets the executable contract via `phasedev next`
3. Follows that contract — the contract itself contains artifact templates, allowlist, skill policy, and the mandatory self-check command
4. Runs the self-check and self-heals (fix + rerun) until it passes — the sub-agent owns artifact validation, not the orchestrator
5. Reports the stage, the exact self-check command and its final result, and any blockers

**Important:** Do not embed the full `phasedev init` or `phasedev next` output in the sub-agent prompt. The sub-agent runs those commands itself. This is what keeps the orchestrator's context from bloating.

**Self-validation is the sub-agent's duty, not the orchestrator's.** The orchestrator only reads the resulting route via `phasedev check`; it never inspects, judges, or fixes artifact content. If a sub-agent reports "complete" but `phasedev check` still reports an `invalid_*` route, that sub-agent skipped its self-check — handle it via the Invalid-artifact recovery policy below, not by silently re-spawning fix agents in a loop.

### 4.1 Artifact Self-Validation Ownership

Artifact validation belongs to the sub-agent that creates the artifact, never to the orchestrator:

- Every executable stage contract embeds a **Self-check command** (a `phasedev check ...` or `phasedev check-validation ...` invocation). The sub-agent MUST run it and self-heal (fix + rerun) until it passes before reporting completion.
- The sub-agent's final report MUST include the exact self-check command and its result (PASS/FAIL). A report that lacks a passing self-check result is treated as an incomplete stage.
- The orchestrator does NOT open artifact files to judge validity, does NOT run the self-check on the sub-agent's behalf, and does NOT silently loop fix-sub-agents. It only reads the route via `phasedev check` and applies the Invalid-artifact recovery policy when an `invalid_*` route appears.

### 5. Error Handling

| Error | Action |
|-------|--------|
| Sub-agent error / timeout / API error | Retry once. If it fails again, stop and report. |
| Sub-agent reports a blocker | Run `phasedev check` to confirm. If still in same route → stop, report block reason. |
| `invalid_*` route after sub-agent reported "complete" | Sub-agent skipped its self-check. Apply the Invalid-artifact recovery policy: one recovery spawn, then stop if the same `invalid_*` persists. |
| Unrecognized route kind | Stop and report the unknown route. |

### 6. Termination Conditions

The orchestrator stops when any of these is met:

- **Flow complete**: Archive stage was completed and `phasedev check` no longer returns an archive route.
- **Blocked**: Route is an approval gate, blocker, or invalid state — stop and report reason.
- **No progress**: After sub-agent completion, `phasedev check` reports the same route kind AND stage as before with no phase advancement (e.g., still `phase (stage: implementation)` for the same phase), or an `invalid_*` route persists after one recovery spawn — warn and stop. See the note on the `phase` route below.
- **Max iterations**: Safety limit from `loop.maxIterations` reached — stop.
- **User interrupt**: User asks to stop.
- **Unrecoverable error**: Sub-agent error after retry.

### 7. Archive Handling

When `phasedev check` returns `archive_ready`:

1. Check the `loop.runArchiveStage` value obtained during Initialization.
2. If `false`, do NOT spawn the archive sub-agent. Stop and report:
   > "Archive execution is paused by config (loop.runArchiveStage=false). The change has been prepared. Run 'phasedev next' manually to start the Archive stage, or set loop.runArchiveStage=true in config.yaml."
3. If `true` (or value was absent), spawn a sub-agent for the archive stage normally.

## Route Action Table

This is the reference table for every route kind from `phasedev check`. The orchestrator matches the route kind to the action below.

| Route kind | Stage | Action | Notes |
|------------|-------|--------|-------|
| `setup` | setup | Spawn sub-agent | First run. No PRD/rules yet. |
| `invalid_prd` | setup | Recovery spawn (once) | Owning sub-agent skipped self-check. See Invalid-artifact recovery. |
| `invalid_rules` | setup | Recovery spawn (once) | Owning sub-agent skipped self-check. See Invalid-artifact recovery. |
| `setup_approval` | setup | **STOP — ask user** | "Approve prd.md & rules.md, set approved: true" |
| `research` | research | Spawn sub-agent | |
| `invalid_research` | research | Recovery spawn (once) | Owning sub-agent skipped self-check. See Invalid-artifact recovery. |
| `design` | design | Spawn sub-agent | |
| `invalid_design` | design | Recovery spawn (once) | Owning sub-agent skipped self-check. See Invalid-artifact recovery. |
| `design_approval` | design | **STOP — ask user** | "Approve architecture/design.md, set approved: true" |
| `plan` | plan | Spawn sub-agent | |
| `invalid_plan` | plan | Recovery spawn (once) | Owning sub-agent skipped self-check. See Invalid-artifact recovery. |
| `plan_approval` | plan | **STOP — ask user** | "Approve implementation_plan.md, set approved: true" |
| `phase` | implementation / phase_validation | Spawn sub-agent | Impl or validation depending on current phase state. |
| `invalid_findings` | repair | Recovery spawn (once) | Structurally malformed validation_findings.md (not the same as a `repair_required` verdict). Created by a validation stage, fixed by a repair-stage agent. See Invalid-artifact recovery. |
| `repair` | repair | Spawn sub-agent | |
| `final_validation` | final_validation | Spawn sub-agent | |
| `archive_readiness_blocked` | archive | **STOP — inform user** | "All phases must be [x]. Check implementation_plan.md" |
| `archive_ready` / `pending_archive` | archive | Spawn sub-agent (if config allows) | Check loop.runArchiveStage first. |
| `invalid_archive_state` | archive | **STOP — inform user** | Report the invalid archive state reason. |

After every sub-agent, run `phasedev check` again to verify the route advanced. If the route did not advance, or it is still an `invalid_*` route after a recovery spawn, warn about no progress and stop (see Invalid-artifact recovery policy).

**Note on the `phase` route (important for the repair/validation cycle):** the route kind `phase` legitimately repeats — `phasedev check` prints `route is phase (stage: implementation)` or `route is phase (stage: phase_validation)`. Compare BOTH the route kind and the stage, plus the active phase, not the kind alone:
- `implementation → phase_validation` (same phase): stage changed → this is progress.
- `phase_validation → implementation` (next phase, after a `ready`/`ready_with_risks` verdict): stage changed and phase advanced → this is progress.
- `repair → phase` (re-validation after a `repaired` verdict): kind changed → progress.
- `phase → repair` (phase_validation returned `repair_required`): kind changed → progress.
- Still `phase (stage: implementation)` for the SAME phase after a sub-agent, or still `repair` after a repair sub-agent: no progress → stop and report.

## Invalid-artifact recovery policy

An `invalid_*` route means the owning stage's sub-agent reported completion without a passing self-check — or the state was already broken when the orchestrator resumed (human edit, crashed session). The orchestrator does NOT validate or fix the artifact itself; it gives the owning sub-agent exactly **one** recovery attempt:

1. Spawn ONE sub-agent for the owning stage. Its `phasedev next` returns a fix contract listing the exact issues. The fix contract does **not** embed a self-check command, so instruct the sub-agent explicitly: fix the artifact, then run `phasedev check` and confirm the route is no longer `invalid_*` before reporting. The fix contract ends with "run 'phasedev next' again" — the recovery sub-agent must NOT do that; `phasedev next` would advance into the next stage's contract and re-bloat context. Verify with `phasedev check` only, then report back to the orchestrator.
2. After the recovery sub-agent returns, run `phasedev check`:
   - Route advanced beyond `invalid_*` → continue the loop.
   - Same `invalid_*` route persists → **STOP**. Report "Sub-agent failed to self-validate `<artifact>` after one recovery attempt" with the route and the reported issues. Do not spawn again.
3. This single recovery attempt also covers resume-from-broken-state and human-edited-artifact cases. Never turn it into a loop — the orchestrator is not the validation driver.

## Stage Contracts Reference

The orchestrator does not execute stage contracts — sub-agents do. However, the orchestrator knows the expected shape of each stage to correctly match routes and understand the flow. Every executable contract embeds a mandatory Self-check command that the owning sub-agent must pass before reporting completion; the orchestrator never runs these checks itself.

### Setup Stage

```
Stage contract (from phasedev next):
- Complete intake (task description + constraints)
- Create prd.md: requirements, success criteria, scope
- Create rules.md: test commands, conventions
- Run artifact self-check
Allowlist: prd.md, rules.md only
```

### Research Stage

```
Stage contract:
- Analyze PRD for research needs
- Create research_facts.md with findings
Allowlist: research_facts.md only
```

### Design Stage

```
Stage contract:
- Design architecture based on PRD + research
- Create architecture/design.md
Allowlist: architecture/*.md (depth 1 only)
```

### Plan Stage

```
Stage contract:
- Decompose design into implementation phases
- Create implementation_plan.md
Allowlist: implementation_plan.md only
```

### Implementation Stage (per-phase)

```
Stage contract:
- Execute current implementation phase
- Update task checkboxes and Check Evidence
- Run checks
Allowlist: production/test code + implementation_plan.md
```

### Phase Validation Stage

```
Stage contract:
- Review implementation against PRD + design + plan
- Create/update validation_findings.md
Allowlist: validation_findings.md only
```

### Repair Stage

```
Stage contract:
- Address blocking issues from validation_findings.md
- Fix code or update artifacts
Allowlist: findings, plan, design, PRD + non-flow-state files
```

### Final Validation Stage

```
Stage contract:
- Full review against all artifacts
- Create validation_findings.md (type: final)
Allowlist: validation_findings.md only
```

### Archive Stage

```
Stage contract:
- Archive the completed change
- Move to .phasedev/changes/archive/<YYYY-MM-DD>-<name>/
- Update .flow-archive.json
Allowlist: archive dirs, .flow-archive.json, specs
```

## Important Rules for the Main Agent

1. **NEVER execute stage work directly** — always spawn a sub-agent via `Agent` tool.
2. **NEVER run `phasedev init` or `phasedev next` yourself** — the sub-agent runs these.
3. **ALWAYS use `phasedev check` to determine the current route** — do not read files under `.phasedev/` to infer the stage.
4. **ALWAYS use `phasedev config` to read orchestrator settings** — do not read `config.yaml` directly.
5. **ALWAYS verify after sub-agent** — run `phasedev check` again after sub-agent returns to confirm the route advanced (not just changed).
6. **NEVER pass context between stages** — sub-agents read artifact files from the project directly. Trust the filesystem as the durable state.
7. **NEVER validate allowlists** — the stage contract inside `phasedev next` already restricts the sub-agent. If a sub-agent violates it, report as a blocker.
8. **NEVER validate or fix stage artifacts yourself** — the owning sub-agent creates, self-checks, and self-heals each artifact before reporting completion. The orchestrator only reads the route via `phasedev check`. An `invalid_*` route after a sub-agent reported completion is a self-check violation: apply the Invalid-artifact recovery policy (one recovery spawn, then stop).
9. **NEVER log iterations to `.phasedev/logs/`** — the orchestrator is ephemeral. Current state is visible in chat.
10. **STOP on approval gates** — do not spawn a sub-agent for `setup_approval`, `design_approval`, or `plan_approval`. Tell the user to approve and wait.
11. **Report clearly** — after each iteration, summarize what stage the sub-agent completed, the self-check result the sub-agent reported, and what route `phasedev check` reports next.
