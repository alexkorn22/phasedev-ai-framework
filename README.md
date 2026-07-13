<p align="center">
  <img src="docs/banner.png" alt="PhaseDev — phase-based flow controller for AI coding agents" width="100%">
</p>

# ⚙️ PhaseDev AI Framework

[![Bun Supported](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**PhaseDev** is a state-driven flow controller for AI software engineering. It takes one unit of work — a **change** — and splits it into strict, isolated phases: requirements, research, design, planning, implementation, validation, archive. All flow state lives in plain files inside your project (`.phasedev/`), and for every phase the CLI prints an exact work order — a **phase contract** — for an AI agent to execute. An orchestrator agent drives the loop and spawns a dedicated sub-agent with a fresh context per phase.

---

## 🎯 Why PhaseDev

Long agent sessions degrade: the context window fills up, early requirements fade, and the chat history becomes the only — unreliable — record of what was decided. PhaseDev turns one marathon session into a sequence of short, verifiable ones:

| Pain of one long agent session | What PhaseDev does instead |
|---|---|
| Context drift — quality drops as the chat grows | Every phase runs in a **fresh sub-agent context** that reads only the artifacts it needs |
| A crash or restart loses the work in progress | All state is **files in your repo** — kill the session at any point; `phasedev phase` resumes exactly where it stopped |
| The agent silently reinterprets requirements mid-flight | **Human approval gates** on PRD, design, and iteration plan; validation verdicts gate every phase exit |
| No trace of *why* the code ended up this way | Every change leaves an **audit trail** — PRD, design, plan, findings — archived next to the code |

---

## ⚙️ How It Works

PhaseDev is a phase state machine. The controller (`phasedev` CLI) derives the current phase from the files in the active change directory, prints that phase's contract, and validates the results before allowing a transition. The orchestrator skill turns your main agent into a thin loop around three commands — `phase` → `check` → `advance` — delegating every phase's actual work to a fresh sub-agent.

```mermaid
sequenceDiagram
    autonumber
    participant Orchestrator as Orchestrator (main agent)
    participant CLI as phasedev CLI
    participant Workspace as .phasedev/ folder<br/>(inside your project repo)
    participant SubAgent as Phase sub-agent (fresh context)

    loop until archived
        Orchestrator->>CLI: phasedev phase
        CLI->>Workspace: derive current phase from files
        CLI-->>Orchestrator: phase contract
        Orchestrator->>SubAgent: execute the contract
        SubAgent->>Workspace: write artifacts & code
        Orchestrator->>CLI: phasedev check
        CLI-->>Orchestrator: valid / blockers
        Note over Orchestrator,CLI: human approves at gate phases
        Orchestrator->>CLI: phasedev advance
        CLI->>Workspace: transition state (archive at the end)
    end
```

### What a phase contract looks like

`phasedev phase` prints a self-sufficient work order for the current phase — feed it to any agent as-is. Trimmed example for a fresh change:

```text
$ phasedev phase

> **Phase summary:**
> - Output: `prd.md and execution_contract.md` per embedded Artifact Build Contract.
> - Done when: `phasedev check` passes.
> - Forbidden: change `approved` fields manually, write outside phase allowlist.
Phase 1. Change Intake.

Phase contract: prepare the initial change artifacts.
…
(the full contract continues: skill policy, inputs, a step-by-step
decision flow, and the exact artifact templates to fill in)
```

### Standard phases

1. **Change Intake** — write `prd.md` + `execution_contract.md`. *Human approval gate.*
2. **Code Research** — collect codebase facts into `research_facts.md`.
3. **Technical Design** — propose `architecture/design.md`. *Human approval gate.*
4. **Iteration Planning** — break work into atomic iterations in `iteration_plan.md`. *Human approval gate.*
5. **Implementation** — code and run checks, iteration by iteration.
6. **Iteration / Final Validation** — review each iteration, then the whole changeset against PRD criteria.
7. **Finding Repair** — fix validation findings until clean (bounded by `maxRepairCycles`).
8. **Archive** — move the change to `changes/archive/` and generate delta specs under `.phasedev/specs/`.

Several unfinished changes may coexist under `.phasedev/changes/`. Change-scoped commands take `--change <name>`; with exactly one change it is inferred.

### Vocabulary

- **Change** — one unit of work; a directory under `.phasedev/changes/<name>` holding all of its artifacts and state.
- **Phase contract** — the work order `phasedev phase` prints for the current phase: inputs, allowed writes, artifact templates, done-criteria.
- **Artifact** — a phase's persistent output (`prd.md`, `design.md`, `iteration_plan.md`, …), validated by `phasedev check`.
- **Approval gate** — a phase exit that requires an explicit human `phasedev approve` before the flow may advance.
- **Finding** — a validation defect with a severity; blocking findings route the flow into Finding Repair.
- **Blocker** — a controller stop message: the flow cannot proceed until a human resolves it.

---

## 🎚️ Execution Tracks

Pick the track by the size of the change:

| Track | Persistence | Flow | Fits |
|---|---|---|---|
| **Standard** | Full artifact set (`prd.md`, design, plan, findings, …) | 8 phases above | Real features; anything needing an audit trail |
| **Quick** (`create-change --quick`) | One `worklog.md` | `quick_plan → quick_implementation → quick_validation → quick_spec_revision → archive` | Small but real change that still deserves a plan and archive record |
| **Express** (skill only) | None — no `.phasedev/` writes; the git commit is the only trace | Research → plan → *confirm* → implement → review → fix loop, all in-context sub-agents | Tiny well-understood tweaks where artifacts cost more than the task |

Standard and Quick run through the `phasedev` CLI and the `phasedev-orchestrator` skill. Express is a separate skill, `express-orchestrator`, that keeps every artifact in the orchestrator's conversation instead of on disk — with a scope guard that proposes switching to Quick/Standard if the task grows.

---

## 📦 Installation

> **Requirement:** PhaseDev runs on [Bun](https://bun.sh) only — the CLI entrypoint (`src/cli.ts`) is a Bun script; there is no compiled build.

### 1. Install the global `phasedev` command

```bash
git clone git@github.com:alexkorn22/phasedev-ai-framework.git
cd phasedev-ai-framework
bun install
bun link        # symlinks `phasedev` into ~/.bun/bin
phasedev version
```

The link points at the clone, so `git pull` updates the global command in place (`bun unlink` removes it).

### 2. Add the orchestrator skills (Claude Code example)

The repo ships two agent skills under [`skills/`](skills/): `phasedev-orchestrator` (Standard + Quick) and `express-orchestrator` (stateless track). Symlink them into a project's `.claude/skills/` — or into `~/.claude/skills/` to have them everywhere:

```bash
mkdir -p ~/.claude/skills
ln -s /absolute/path/to/phasedev-ai-framework/skills/phasedev-orchestrator ~/.claude/skills/phasedev-orchestrator
ln -s /absolute/path/to/phasedev-ai-framework/skills/express-orchestrator  ~/.claude/skills/express-orchestrator
```

Symlinks (not copies) keep the skills in sync with the CLI on `git pull`. To tailor the orchestrator per project (mandate TDD, pin reviewer sub-agents, …), add a dedicated section to the project's `CLAUDE.md` / `AGENTS.md` — project instructions take precedence over the skill.

### 3. Initialize a working project

```bash
cd /path/to/your-project
phasedev init-project
```

Creates `.phasedev/` (changes, archive, specs, logs, `config.yaml`). Idempotent.

---

## 🚀 Quick Start

### Orchestrated (recommended)

In Claude Code the orchestrators ship as skills, invoked as slash commands:

```
/phasedev-orchestrator <goal description>     # Standard or Quick — orchestrator proposes, you confirm
/express-orchestrator  <task description>     # stateless track for tiny changes
```

The orchestrator runs the whole flow itself — creates the change, drives every phase with a dedicated sub-agent, repairs findings, archives — and stops only at approval gates (unless `autoApprove` is on) and unrecoverable blockers. Describe feedback at any stop in plain words; it classifies it (defect vs scope change) and routes it through the feedback contract. Invoked with no goal, it resumes from the current `.phasedev/` state.

### Manual

The CLI itself is agent-agnostic: any agent (or human) that can run shell commands can drive the loop — the Claude Code skills are just ready-made wiring. The same loop the orchestrator runs, from the working project's root:

```bash
phasedev create-change my-change   # add --quick for Quick mode
phasedev phase                     # print the current phase contract → feed to your agent
phasedev check                     # validate the phase's artifacts
phasedev advance                   # transition to the next phase
```

Repeat `phase` / `check` / `advance` until archived. At approval gates, review the artifact and run `phasedev approve <file> --by <name>`.

> `phasedev next` is deprecated — use `phase` + `advance`.

---

## 📋 Commands

`phasedev help` prints the full, current reference with side effects per command. Global flags: `--json` (machine-readable envelope, exit code mirrors `ok`), `--project-path <path>`, `--change <name>`.

| Area | Commands |
|---|---|
| Setup | `init-project`, `init` (context handshake, no file changes), `create-change <name> [--task <text>] [--quick]` |
| Flow loop | `phase`, `check [--phase <p>]`, `advance`, `feedback` |
| Approvals & artifacts | `approve <file> [--by <name>]`, `validate-artifact <file>`, `set-iteration-status <id> <status>` |
| Findings | `add-finding <title> <severity> --required-fix <text>`, `resolve-finding <id> --resolution <text>`, `reopen-finding <id> --evidence <text>`, `set-verdict <verdict>` |
| Validation checks | `check-validation --scope iteration --iteration-id <N>`, `check-validation --scope final`, `check-archive --archive-path <path>` |
| Recovery | `sync-state`, `reopen <design\|plan>`, `reset-change --yes` (destructive) |
| Info | `status`, `list [--archived]`, `log [--tail N]`, `config <key>`, `config set <key> <value>`, `version` |

---

## 🩹 Feedback & Recovery

- **`phasedev feedback`** prints the contract for processing user feedback: implementation defects go through `add-finding` / `reopen-finding`; scope changes walk the artifact chain (`prd.md` → … → `iteration_plan.md`), reset `approved: false` on what changed, and finish with `sync-state`.
- **`sync-state`** — non-destructive fix when `state.json` and artifacts disagree on the phase; rolls state back, never touches artifacts.
- **`reopen design|plan`** — targeted rollback to revise an already-approved design or plan.
- **`reset-change`** — destructive: moves the whole change to `.phasedev/changes/.trash`. Never use it for a state mismatch.

---

## 🛠️ Configuration

`.phasedev/config.yaml` — flow flags plus optional per-phase skill policy:

```yaml
phases:
  change_intake:
    skills: { routers: [], main: [], additional: [] }   # optional — see below
  # ... other phases

runArchiveStage: true        # advance performs the archive mutation at archive_ready
autoApprove: false           # true: advance auto-approves valid gate artifacts
maxRepairCycles: 3           # hard cap on finding_repair loops
maxIterations: 10            # advisory only — for external runners
blockingSeverity: must_fix   # must_fix | recommended | nit — minimal severity that blocks the flow
requireIterationCommit: true # clean-git-tree gate on passing validation exits (agent commits, controller never touches git)
```

Per-phase `skills` lists declare which external agent skills a phase prompt may authorize; they are injected into `phasedev phase` prompts only. **They are optional**: when `skills` is omitted or left empty for a phase, the phase prompt instead tells the executing agent to look at whatever skills are available in its own session and pick the ones that fit that phase's work — so with no configuration at all, every phase still uses suitable skills automatically. Fill the lists only when you want to restrict or pin a phase to specific skills. A typo'd phase name under `phases:` is a hard error, not a silent drop. Security-class findings always block regardless of `blockingSeverity`.

---

License: MIT
