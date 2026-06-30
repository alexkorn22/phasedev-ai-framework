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
- It does **not** parse stage contracts, collect context, validate allowlists, log iterations, or pass artifact data between stages.

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

Before any stage execution, read orchestrator-safe settings:

```bash
phasedev config --project-path <absolute_cwd> loop.maxIterations
```

→ Use the returned number as the safety iteration limit. Default to **10** if the CLI returns nothing or an invalid value. If the orchestrator loop reaches this limit, stop with "Max iterations reached" and report.

```bash
phasedev config --project-path <absolute_cwd> loop.runArchiveStage
```

→ Remember this value for the archive stage check below.

### 2. Stage Detection

At the start of each loop iteration, resolve the current PhaseDev route:

```bash
phasedev check --project-path <absolute_cwd>
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
  prompt: `Execute a PhaseDev stage in project <absolute_cwd>.

1. cd <absolute_cwd>
2. Run: phasedev init
3. Run: phasedev next
4. Follow the stage contract from phasedev next exactly
5. Do NOT run phasedev init or phasedev next again — one iteration only
6. Report: which stage was completed, any blockers found`
)
```

That is the entire prompt. No context collection, no artifact paths, no previous stage data. The sub-agent:
1. Reads the state via `phasedev init` (acknowledges the handshake)
2. Gets the executable contract via `phasedev next`
3. Follows that contract — the contract itself contains artifact templates, allowlist, skill policy, and self-check commands
4. Reports which stage was completed and any blockers

**Important:** Do not embed the full `phasedev init` or `phasedev next` output in the sub-agent prompt. The sub-agent runs those commands itself. This is what keeps the orchestrator's context from bloating.

### 5. Error Handling

| Error | Action |
|-------|--------|
| Sub-agent error / timeout / API error | Retry once. If it fails again, stop and report. |
| Sub-agent reports a blocker | Run `phasedev check` to confirm. If still in same route → stop, report block reason. |
| Unrecognized route kind | Stop and report the unknown route. |

### 6. Termination Conditions

The orchestrator stops when any of these is met:

- **Flow complete**: Archive stage was completed and `phasedev check` no longer returns an archive route.
- **Blocked**: Route is an approval gate, blocker, or invalid state — stop and report reason.
- **No progress**: After sub-agent completion, `phasedev check` returns the same route as before — warn and stop.
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
| `invalid_prd` | setup | Spawn sub-agent | Sub-agent will fix prd.md. |
| `invalid_rules` | setup | Spawn sub-agent | Sub-agent will fix rules.md. |
| `setup_approval` | setup | **STOP — ask user** | "Approve prd.md & rules.md, set approved: true" |
| `research` | research | Spawn sub-agent | |
| `invalid_research` | research | Spawn sub-agent | Sub-agent will fix research_facts.md. |
| `design` | design | Spawn sub-agent | |
| `invalid_design` | design | Spawn sub-agent | Sub-agent will fix design.md. |
| `design_approval` | design | **STOP — ask user** | "Approve architecture/design.md, set approved: true" |
| `plan` | plan | Spawn sub-agent | |
| `invalid_plan` | plan | Spawn sub-agent | Sub-agent will fix implementation_plan.md. |
| `plan_approval` | plan | **STOP — ask user** | "Approve implementation_plan.md, set approved: true" |
| `phase` | implementation / phase_validation | Spawn sub-agent | Impl or validation depending on current phase state. |
| `invalid_findings` | repair | Spawn sub-agent | Sub-agent will fix validation_findings.md. |
| `repair` | repair | Spawn sub-agent | |
| `final_validation` | final_validation | Spawn sub-agent | |
| `archive_readiness_blocked` | archive | **STOP — inform user** | "All phases must be [x]. Check implementation_plan.md" |
| `archive_ready` / `pending_archive` | archive | Spawn sub-agent (if config allows) | Check loop.runArchiveStage first. |
| `invalid_archive_state` | archive | **STOP — inform user** | Report the invalid archive state reason. |

After every sub-agent, run `phasedev check` again to verify the route changed. If it didn't change, warn about no progress and stop.

## Stage Contracts Reference

The orchestrator does not execute stage contracts — sub-agents do. However, the orchestrator knows the expected shape of each stage to correctly match routes and understand the flow.

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
5. **ALWAYS verify after sub-agent** — run `phasedev check` again after sub-agent returns to confirm the route changed.
6. **NEVER pass context between stages** — sub-agents read artifact files from the project directly. Trust the filesystem as the durable state.
7. **NEVER validate allowlists** — the stage contract inside `phasedev next` already restricts the sub-agent. If a sub-agent violates it, report as a blocker.
8. **NEVER log iterations to `.phasedev/logs/`** — the orchestrator is ephemeral. Current state is visible in chat.
9. **STOP on approval gates** — do not spawn a sub-agent for `setup_approval`, `design_approval`, or `plan_approval`. Tell the user to approve and wait.
10. **Report clearly** — after each iteration, summarize what stage the sub-agent completed and what route `phasedev check` reports next.
