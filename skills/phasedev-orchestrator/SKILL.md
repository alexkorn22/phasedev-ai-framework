---
name: phasedev-orchestrator
description: PhaseDev AI Framework orchestrator. The main agent acts as a strict flow controller, spawning dedicated sub-agents for each PhaseDev stage (setup/research/design/plan/impl/validation/repair/archive) with isolated context. No stage work is done by the main agent itself.
---

# PhaseDev Orchestrator — AI Flow Controller for PhaseDev Framework

## Overview

The **PhaseDev Orchestrator** is a skill for the [PhaseDev AI Framework](https://github.com/ag-dev-flow/ag-dev-flow). It transforms the main agent into a strict **flow controller** that never executes stage work directly. Every PhaseDev stage — setup, research, design, plan, implementation, validation, repair, archive — is delegated to a dedicated sub-agent spawned via the `Agent` tool.

```
┌─────────────────────────────────────────────┐
│               Main Agent                     │
│         (PhaseDev Flow Controller)           │
│                                              │
│  1. phasedev init → resolve current stage    │
│  2. Spawn sub-agent → wait                   │
│  3. Validate results (allowlist, diff)       │
│  4. Log iteration                            │
│  5. phasedev next → continue or exit         │
└─────────────────────────────────────────────┘
         │                    ▲
         ▼                    │
  ┌─────────────┐    ┌──────────────┐
  │ Sub-agent 1 │    │ Sub-agent 2  │
  │  (setup)    │    │ (research)   │  ...
  └─────────────┘    └──────────────┘
```

## When to Use

- Running the full PhaseDev AI Framework development flow (PRD → research → design → plan → implement → validate → repair → archive)
- Tasks that require strict stage separation with different context windows per stage, per PhaseDev convention
- Any PhaseDev project where each stage should be isolated from the others
- Large projects where a single context cannot hold all stages of the PhaseDev flow

## How to Invoke

```
$phasedev-orchestrator [goal description]
```

If a goal is provided, it will be passed to the `setup` stage. Otherwise the orchestrator resumes from the current PhaseDev state.

## The PhaseDev Flow

The PhaseDev AI Framework defines a strict multi-stage development flow:

```
setup  →  research  →  design  →  plan  →  implementation  ←→  validation
                                                                      ↓
                                                                   repair
                                                                      ↓
                                                                  archive
```

Each stage has:
- A **stage contract** — what must be produced
- An **allowlist** — which files may be modified
- A **validation gate** — how to verify correctness before advancing

This skill automates this flow by spawning a fresh sub-agent per stage.

## Flow Phases

### 1. Initialization

Before any stage execution, determine the current PhaseDev state:

```bash
phasedev init --project-path <absolute_cwd>
phasedev next --project-path <absolute_cwd>
```

→ Read both prompts to understand the current stage contract.

The init prompt provides bootstrap context. The next prompt is the executable stage contract — it tells you:
- What stage we're in
- What files need to exist or be created
- What blockers exist

### 2. Read orchestrator config

Read orchestrator-safe settings from `.phasedev/config.yaml`:

```bash
phasedev config --project-path <absolute_cwd> loop.maxIterations
```

→ Use the returned number as the safety iteration limit. Default to 10 if the CLI returns nothing or an invalid value. If the orchestrator loop reaches this limit, stop with "Max iterations reached" and report.

```bash
phasedev config --project-path <absolute_cwd> loop.runArchiveStage
```

→ Remember this value for the archive stage check below.

### 3. Stage Resolution

After each sub-agent completes, re-resolve the next stage:

```bash
phasedev next --project-path <absolute_cwd>
```

If the prompt starts with `.blocked`, stop and report the block reason.

### 4. Sub-Agent Spawning

For **every** PhaseDev stage, spawn a dedicated sub-agent via the `Agent` tool. Never execute stage work directly in the main agent.

**General spawn pattern:**

```javascript
Agent(
  description="<stage-name>: <brief>",
  prompt="""Stage: <stage>
Contract: <contract from phasedev next>

Context:
- Project at: <absolute_cwd>
- Previous artifacts: <paths>
- Active change: <change_dir>
- Init context: <key context from phasedev init>

PhaseDev Run Rules:
- Execute only the printed stage contract
- Create/modify only the files listed in the PhaseDev allowlist for this stage
- Stop when the stage contract requires stopping
- Do not run `phasedev next`, `phasedev init`, or the flow controller
- Do not move to the next stage
- Do not set human approval automatically

Files to modify:
<file1>
<file2>

Return: a JSON summary of what was created/modified
"""
)
```

### 5. Stage Allowlist Validation

After each sub-agent completes, validate that **only** the allowed files were modified. This is the orchestrator's most important responsibility.

| Stage | Allowed Files |
|-------|---------------|
| `setup` | `<change_dir>/prd.md`, `<change_dir>/rules.md` |
| `research` | `<change_dir>/research_facts.md` |
| `design` | `<change_dir>/architecture/*.md` (depth 1 only) |
| `plan` | `<change_dir>/implementation_plan.md` |
| `implementation` | Any file outside `.phasedev/` + `<change_dir>/implementation_plan.md` |
| `phase_validation` / `final_validation` | `<change_dir>/validation_findings.md` |
| `repair` | findings, plan, design, PRD + non-flow-state files |
| `archive` | Archive dirs, `.flow-archive.json`, `.phasedev/specs/` |

If any sub-agent modified a disallowed file:
1. Report the violation with the exact paths
2. Do NOT advance to the next stage
3. Stop and ask the user what to do

### 6. Context Passing Between Stages

Sub-agents are ephemeral — the only durable state is the filesystem under `.phasedev/`. The orchestrator passes context between stages by:

1. **Before spawning**: include relevant PhaseDev artifact context in the sub-agent prompt
2. **After completion**: validate that expected PhaseDev artifacts exist and have correct content
3. **Re-resolve**: run `phasedev next` again to determine the next PhaseDev stage

Example context passing for a design sub-agent:

```
Previous PhaseDev stages completed:
- setup: PRD approved at <change_dir>/prd.md
- research: Research facts at <change_dir>/research_facts.md

Contract (from phasedev next): Create architecture/design.md
that addresses the PRD requirements from prd.md and research findings.
```

### 7. Iteration Logging

After each sub-agent completes, log the iteration:

```json
{
  "stage": "<stage>",
  "status": "completed|blocked|no_progress|violation",
  "filesChanged": ["..."],
  "allowlistViolations": ["..."],
  "durationMs": <ms>,
  "error": "<if any>"
}
```

Write logs to `.phasedev/logs/orchestrator-log.jsonl`.

### 8. Error Handling

| Error | Action |
|-------|--------|
| Sub-agent error / timeout | Report and ask user whether to retry or stop |
| Allowlist violation | Stop flow, report exact paths, ask user |
| Stage returns "no_progress" | Warn user, offer to re-run or stop |
| `.blocked` prompt | Report the block reason and stop |
| `phasedev` CLI not found | Report and ask user to install PhaseDev |

### 9. Termination Conditions

The orchestrator stops when any of these is met:

- **Paused before archive**: When `phasedev next` returns an archive stage prompt, first check the `loop.runArchiveStage` value obtained earlier from `phasedev config`. If it is `false`, do NOT spawn the archive sub-agent. Instead, stop and report:
  "Archive execution is paused by config (loop.runArchiveStage=false). The change has been prepared at <archive_path>. Run 'phasedev next' manually to start the Archive stage, or set loop.runArchiveStage=true in config.yaml to auto-archive."
  If the value is `true` (or was absent), proceed with spawning the archive sub-agent normally.
- **Archived**: PhaseDev archive state was completed → report success
- **Blocked**: stage returned `.blocked` → report reason
- **No progress**: stage completed without changing PhaseDev state → warn and stop
- **Max iterations**: safety limit from config (`loop.maxIterations`) reached → stop
- **User interrupt**: user asks to stop
- **Violation**: allowlist violation detected → stop

## Stage Contracts (PhaseDev Reference)

### Setup Stage

```
Contract from phasedev next:
- Create prd.md: problem, goals, scope, requirements, out-of-scope
- Create rules.md: conventions, patterns, constraints
Allowlist: prd.md, rules.md only
```

### Research Stage

```
Contract from phasedev next:
- Analyze PRD for research needs
- Create research_facts.md with findings
Allowlist: research_facts.md only
```

### Design Stage

```
Contract from phasedev next:
- Design architecture based on PRD + research
- Create architecture/design.md
Allowlist: architecture/*.md (depth 1 only)
```

### Plan Stage

```
Contract from phasedev next:
- Decompose design into implementation phases
- Create implementation_plan.md
Allowlist: implementation_plan.md only
```

### Implementation Stage (per-phase)

```
Contract from phasedev next:
- Execute current implementation phase
- Follow rules from rules.md
Allowlist: any file outside .phasedev/ + implementation_plan.md
```

### Validation Stage (phase / final)

```
Contract from phasedev next:
- Review implementation against PRD + design + plan
- Create validation_findings.md
Allowlist: validation_findings.md only
```

### Repair Stage

```
Contract from phasedev next:
- Address blocking issues from validation_findings.md
- Fix code or update artifacts
Allowlist: findings, plan, design, PRD + non-flow-state files
```

### Archive Stage

```
Contract from phasedev next:
- Archive the completed change
Allowlist: archive dirs, .flow-archive.json, specs
```

## PhaseDev Directory Structure

```
<project>/
  .phasedev/
    config.yaml
    changes/
      <change-name>/
        prd.md
        rules.md
        research_facts.md
        architecture/
          design.md
        implementation_plan.md
        validation_findings.md
      archive/
        <timestamp>-<change-name>/
```

## Important Rules for the Main Agent

1. **NEVER execute stage work directly** — always spawn a sub-agent via `Agent` tool
2. **ALWAYS validate allowlist** after sub-agent completion — this is your primary safety check
3. **ALWAYS re-resolve stage** after each iteration via `phasedev next`
4. **ALWAYS log iteration** with outcome, files changed, and any violations
5. **NEVER advance stages** that have validation issues or allowlist violations
6. **STOP when `.blocked`** — report the reason and wait for the user
7. **ALWAYS respect config** — read `loop.maxIterations` and `loop.runArchiveStage` via `phasedev config` at initialization and use them throughout the flow
8. **Report clearly** — after each iteration, summarize what was done, what stage is next, and what the contract requires
9. **ALWAYS use `phasedev init`, `phasedev next`, and `phasedev config`** — do not try to resolve the PhaseDev stage or config yourself by reading files