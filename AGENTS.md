# PhaseDev AI Framework — Agent Operating Contract & System Specification

> [!CRITICAL]
> **CRITICAL REPOSITORY IDENTITY — READ BEFORE ANY ACTION:**
>
> 1. **THIS REPOSITORY IS THE DEVELOPMENT OF THE PHASEDEV AI FRAMEWORK ITSELF.**
>    This is **NOT** a working or client project being developed *with* or *under* PhaseDev.
> 2. **DO NOT ATTEMPT TO RUN OR INITIALIZE PHASEDEV ON THIS REPOSITORY:**
>    - **NEVER** run `phasedev init-project`, `phasedev create-change`, or create a `.phasedev/` directory in this workspace.
>    - **NEVER** attempt to drive this repository's own feature or bugfix tasks through PhaseDev phases (`change_intake`, `phase`, `advance`, etc.).
> 3. **OPERATING DISCIPLINE FOR THIS REPOSITORY:**
>    - You are contributing to the framework source code directly: TypeScript source files in `src/`, templates in `templates/`, agent skills in `skills/`, and unit/integration tests in `test/`.
>    - Development workflow here is standard TypeScript/Bun: edit files directly, run checks with `bun test` and `npm run typecheck`.
> 4. **LANGUAGE & COMMUNICATION RULES (NON-NEGOTIABLE):**
>    - **User Communication**: Always communicate with the user in **Russian** (`общение с пользователем всегда на русском языке`).
>    - **System Contract**: This instruction (`AGENTS.md`) is written in English for cross-harness model compliance.
>    - **Code & Repository Artifacts**: All code, identifiers, types, comments, test names, commit messages, and prompt templates must strictly be in **English**.

---

## Rule Zero: How To Comply

1. Treat every MUST / MUST NOT below as a hard gate, not a preference. The following thoughts are NEVER valid reasons to skip a gate: "the change is trivial", "this is obvious", "the rule is overkill here", "I'll do it after this one step", "the session is almost over".
2. Before starting ANY task, scan the Hard Gates table and state (to yourself or in your plan) which gates the task triggers.
3. Before giving your FINAL answer, run the Exit Checklist at the bottom of this file. If any item fails, fix it before answering — do not answer and apologize later.
4. If you cannot comply with a rule (skill unavailable, user request conflicts with a preserved contract, ambiguity), STOP and ask the user. Silently deviating is a contract violation; asking is not.

---

## Hard Gates

| When you are about to… | You MUST first… |
|---|---|
| Write, edit, or design ANY code — even one line | Invoke the `dev-core` skill and follow its discipline for the rest of the task |
| Delegate implementation work to a subagent | Include an explicit instruction in the delegation prompt: invoke `dev-core` before coding |
| Change anything listed in "Behavior To Preserve" | Obtain explicit user approval in the current conversation |
| Add logic to root `src/` or recreate a root archive/parser/checker/template/controller/runner/config script | Stop — put the logic in `src/features`, `src/entities`, or `src/shared` instead |
| Finish a task that changed production behavior or imports | Update the affected tests, run focused tests, then the full suite for cross-module changes |
| Call a built-in generic subagent (`general-purpose`, `Explore`, `Plan`, …) | Pass an explicit `model` matched to task complexity (never `"fable"`, never omitted) |
| Claim work is done | Verify with real command output; report failures honestly, never as success |

---

## 1. Deep Framework Architecture & Operating Model

### 1.1 Mission & Core Problem Solved
`PhaseDev AI Framework` is an **autonomous state-driven Agentic Engineering Flow controller**. It does not execute phase tasks directly; it stores workflow state in target projects under `.phasedev/`, prints exact phase contracts for AI agents, validates artifacts against strict schemas, and coordinates transitions.

**Why PhaseDev exists:**
- **Context Degradation & Drift**: Marathon AI chat sessions degrade as tokens fill up; early requirements blur, and the context window becomes an unreliable memory. PhaseDev decomposes a unit of work (a **change**) into small, verifiable phases. Each phase runs in a **fresh sub-agent context** containing only the relevant artifacts.
- **Resilience**: State is stored entirely in repo files (`.phasedev/`). If an agent session crashes or restarts, running `phasedev phase` instantly resumes execution from the exact state without data loss.
- **Auditability & Quality Gates**: Explicit approval gates require human confirmation on specifications and iteration plans. Machine-checked validation findings prevent advancing with unfixed defects.

### 1.2 The Orchestrator-Subagent Operating Model
PhaseDev is designed to be operated by a main **Orchestrator Agent** (shipped as `skills/phasedev-orchestrator` or `skills/express-orchestrator`). Direct human CLI usage is an inspection/debugging aid, not the primary operating model.

- **The Orchestrator's Role**:
  - The orchestrator is a thin loop controller: `phase` → `check` → `advance`, plus `archive <change>`.
  - **The orchestrator NEVER writes code, edits project artifacts, or executes phase contracts in its own context.**
  - For every phase, it spawns dedicated sub-agents and provides them with execution instructions.
- **Subagents**:
  - Every sub-agent runs with a fresh context.
  - Sub-agents read the phase contract directly via `phasedev phase` and self-validate via `phasedev check`.
  - The number of sub-agents per phase is dynamic (1 or more), sequential or parallel, as decided by the orchestrator.
- **Concurrency & State Lock**:
  - Mutating operations serialize on `.phasedev/state.lock`.
  - Parallel sub-agents (e.g., multiple reviewers running `phasedev add-finding`) are completely safe; the exclusive file lock prevents races. Commands wait up to ~15 seconds with backoff.

### 1.3 The Three Execution Tracks

| Track | State & Artifacts | Workflow Chain | Best For |
|---|---|---|---|
| **Standard** | Full persistent set under `.phasedev/changes/<name>/` (`prd.md`, `design.md`, `iteration_plan.md`, `validation_findings.md`, etc.) | `change_intake` → `code_research` → `technical_design` → `iteration_planning` → (`implementation` ↔ `iteration_validation` ↔ `finding_repair`) → `final_validation` → `archive` | Complex features, architectural changes, multi-step engineering requiring audit trail |
| **Quick** | Single persistent `worklog.md` (`## Task`, `## Short Specification`, `## Plan`) | Linear state chain: `quick_plan` → `quick_implementation` → `quick_validation` → `quick_spec_revision` → `archive` | Small, well-bounded changes that still warrant an audit record and spec review |
| **Express** | Stateless (in-memory only, no `.phasedev/` writes) | In-conversation research → plan → user confirm → implement → review → git commit | Tiny surgical fixes where filesystem artifacts are overhead |

---

## 2. Phase Lifecycle & State Machine

### 2.1 Standard Track Phases
1. **`change_intake`**:
   - Creates `prd.md` and `execution_contract.md`.
   - **Approval Gate**: Requires `approved: true` with non-empty `approved_by` before advance.
2. **`code_research`**:
   - Read-only reconnaissance of existing code, patterns, and constraints.
   - Produces `research_facts.md`.
3. **`technical_design`**:
   - Produces `architecture/design.md`.
   - Clarification point: orchestrator runs `phasedev clarify` to resolve forks with the user before finalizing.
   - **Approval Gate**: Requires approval before advance.
4. **`iteration_planning`**:
   - Slices the design into atomic iterations in `iteration_plan.md` (max 10 iterations).
   - Clarification point: resolves iteration boundaries before writing.
   - **Approval Gate**: Requires approval before advance.
5. **`implementation`**:
   - Active iteration implementation (code + tests).
   - Tracks iteration status in `iteration_plan.md` (`[ ]` → `[~]` → `[/]` → `[x]`).
6. **`iteration_validation`**:
   - Validates the current iteration's implementation against requirements.
   - Subagents record defects using `phasedev add-finding`.
   - If clean, iteration is committed to git, status flipped to `[x]`, and advances to next iteration or final validation.
7. **`final_validation`**:
   - Cross-cutting validation of the entire changeset against `prd.md`.
   - Validates verdict: `ready` or `ready_with_risks` allows advance; `repair_required` routes to `finding_repair`.
8. **`finding_repair`**:
   - Fixes defects recorded in `validation_findings.md`.
   - Repairs are resolved via `phasedev resolve-finding` with concrete evidence.
9. **`archive`**:
   - Triggered exclusively by standalone `phasedev archive <change-name>` once `advance` reports flow completion.
   - Moves directory to `.phasedev/changes/archive/YYYY-MM-DD-<change-name>/`.
   - Creates `.phase-archive.json` (`in_progress`), synchronizes delta specs into `.phasedev/specs/`, and marks `completed`.

### 2.2 Quick Track Phases
- `quick_plan`: Short research and plan written to `worklog.md`. Orchestrator stops for user confirmation.
- `quick_implementation`: Implements code and tests, commits progress.
- `quick_validation`: In-session verification; fixes occur in-place without a formal findings registry.
- `quick_spec_revision`: Fresh-context subagent evaluates whether live specs need updates.
- `archive`: Same archive mechanics as standard.

### 2.3 Approval Gates & Auto-Approval
- Artifacts requiring approval (`prd.md`, `design.md`, `iteration_plan.md`) must contain frontmatter `approved: true` and a valid `approved_by: "<name>"`.
- Only `phasedev approve <file> --by "<name>"` stamps them.
- Under `autoApprove: true` in `config.yaml`, `advance` does NOT self-approve; it emits a blocker instructing the orchestrator to spawn an `approval-reviewer` subagent to audit the artifact on its merits and run `phasedev approve <file> --by "auto-approve-subagent"`.

### 2.4 Validation Findings Registry
- Append-only registry in `validation_findings.md`.
- Statuses: `open`, `resolved`, `reopened`.
- Severity levels: `must_fix`, `recommended`, `nit`.
- Verdicts: `ready`, `ready_with_risks` (no open `must_fix`), `repair_required` (open `must_fix`), `repaired`.
- Hand-editing `validation_findings.md` is **strictly prohibited** — only CLI commands may mutate it.

---

## 3. Complete CLI Command Reference

All commands support the global `--json` flag to print `{ ok, kind, phase?, message?, issues?, data? }` and exit 0 (success) or 1 (failure/blocker).

### Project & Change Management
- `phasedev init-project [--project-path <path>]`: Idempotently creates `.phasedev/` directory tree and `.phasedev/config.yaml`.
- `phasedev init [--project-path <path>]`: Prints context-only handshake prompt (read-only, no side-effects).
- `phasedev create-change <name> [--project-path <path>] [--task <text> | --task-file <path>] [--quick]`: Creates `.phasedev/changes/<name>/` with initial `state.json`. Accepts `--quick` for Quick mode. `--task-file` reads markdown task description safely from a file.
- `phasedev list [--project-path <path>] [--archived]`: Lists active changes (and archived ones with `--archived`). Alias: `phasedev changes`.
- `phasedev status [--project-path <path>]`: Prints summary of current flow state, active change, artifacts, and findings.
- `phasedev reset-change [--project-path <path>] [--yes|--force]`: Moves the active change directory to `.trash`.
- `phasedev sync-state [--project-path <path>] [--change <name>]`: Non-destructively reconciles `state.json` with artifact reality when out of sync.

### Orchestration & Flow Loop
- `phasedev phase [--project-path <path>] [--config <path>]`: Prints the executable phase contract for the active phase (read-only, idempotent).
- `phasedev check [--project-path <path>] [--phase <phase>] [--check-orphans]`: Validates artifacts of the active phase against schema and completeness rules.
- `phasedev advance [--project-path <path>] [--config <path>]`: Validates active phase and transitions `state.json` to the next phase. Refuses if invalid or unapproved. Archive-silent.
- `phasedev clarify [--project-path <path>] [--change <name>]`: Prints decision-points contract to resolve questions with the user before a phase artifact is drafted.
- `phasedev feedback [--project-path <path>]`: Prints user-feedback handling contract (classifies bug vs scope change).
- `phasedev spawn-plan --harness <name> [--project-path <path>] [--config <path>]`: Resolves catalog roles to their required skills and models for the specified agent harness.
- `phasedev archive <change-name> [--project-path <path>] [--config <path>]`: Drives the archive phase: moves directory, writes `.phase-archive.json`, verifies delta specs, and marks complete.

### Artifacts, Iterations & Findings Operations
- `phasedev approve <file> [--by <name>]`: Sets `approved: true` and `approved_by` in frontmatter.
- `phasedev set-iteration-status <id> <status> [--project-path <path>] [--file <path>]`: Updates checkbox in `iteration_plan.md` (`completed`=`[x]`, `in_progress`=`[~]`, `not_started`=`[ ]`).
- `phasedev validate-artifact <file>`: Validates a single artifact file against schemas without changing flow state.
- `phasedev add-finding [F<number>] <title> <severity> --required-fix <text> [--class <class>] [--iteration <iter>] [--file <path>]`: Appends an open finding to `validation_findings.md` and updates verdict.
- `phasedev resolve-finding <id> --resolution <text> [--file <path>]`: Marks finding resolved with verification evidence.
- `phasedev reopen-finding <id> --evidence <text> [--file <path>]`: Reopens a resolved finding with new evidence.
- `phasedev set-verdict <verdict> [--file <path>]`: Updates validation verdict (`ready | ready_with_risks | repair_required | repaired`).
- `phasedev check-validation --project-path <path> --scope iteration|final [--iteration-id <N>]`: Validates completion semantics of findings.
- `phasedev check-archive --archive-path <path>`: Lints completed archive state and delta specs.
- `phasedev reopen <design|plan> [--project-path <path>]`: Reopens approved design or plan phase for modifications.

### Utility & Configuration
- `phasedev config <key> [--project-path <path>]`: Reads dot-notation key from `config.yaml`.
- `phasedev log [--project-path <path>] [--tail N]`: Inspects runner logs.
- `phasedev version`: Prints framework version (aliases: `-V`, `--version`).
- `phasedev help`: Prints CLI documentation.

---

## 4. Role Catalog & Skill System

- Catalog defined in `.phasedev/config.yaml` (falls back to framework `config.yaml`).
- Each role has:
  - `tier`: `cheap | standard | strong`.
  - `skills`: List of mandatory skills (or empty `[]` allowing agent discovery).
  - `comment`: Free-text description of role purpose.
- Model resolution: `~/.config/phasedev/models.yaml` maps `(harness, tier) → model_name`.
- Shipped skills located in `skills/`:
  - Orchestrators: `phasedev-orchestrator`, `express-orchestrator`.
  - Core discipline: `dev-core`.
  - Method skills: `codebase-recon`, `design-fidelity-method`, `acceptance-criteria-method`, `tdd-method`, `debugging-method`, `verification-method`, `test-quality-method`, `code-review-method`, `security-review-method`, `spec-delta-method`.

---

## 5. Framework Codebase Architecture (This Repository)

Root `src/` must remain thin. The codebase is organized as follows:

```
src/
├── cli.ts                           # Global CLI entrypoint & command dispatch
├── features/                        # Workflow feature implementations
│   ├── phase-control/               # Phase routing, prompt rendering, validators, blockers, archive
│   ├── spawn-plan/                  # Role resolution to harness models & skills
│   ├── artifact-ops/                # Approval, artifact validation, findings registry operations
│   ├── iteration-ops/               # Iteration status manipulation in iteration_plan.md
│   ├── flow-state/                  # State file loading, reset, and mutations
│   ├── flow-status/                 # Status, list, and log viewers
│   ├── config-ops/                  # Configuration parsing and key retrieval
│   ├── project-init/                # Idempotent .phasedev directory initialization
│   └── cli-help/                    # Help text rendering and command catalogs
├── entities/                        # Pure domain models, schemas, and validators
│   ├── phase/                       # Phase enum types and prompt interfaces
│   ├── change/                      # Change directory paths, state.json, approval, archive state
│   ├── config/                      # config.yaml structure and parser
│   ├── iteration-plan/              # Iteration plan schema, parsing, and readiness checks
│   ├── validation-findings/         # Findings schema, severities, verdicts, and parser
│   ├── prd/                         # PRD frontmatter and section validators
│   ├── design/                      # Technical design schema and validators
│   ├── research-facts/              # Research facts schema and validators
│   ├── execution-contract/          # Execution contract parser and validator
│   ├── role/                        # Role catalog types and validations
│   ├── model-tiers/                 # Harness model tiers loader and resolver
│   ├── schema/                      # Frontmatter and markdown table schemas
│   └── test-commands/               # Command parsing utilities
└── shared/                          # Generic, framework-agnostic utilities
    ├── cli/                         # CLI option parsers and JSON output envelopes
    ├── fs/                          # Atomic file writes and state locking (.phasedev/state.lock)
    ├── markdown/                    # YAML frontmatter and table parsers
    ├── shell/                       # Git helpers and subprocess runners
    └── time/                        # ISO date formatters
```

**Dependency Rule (Strictly Enforced):**
- `entrypoints (src/cli.ts)` → `features`
- `features` → `entities` and `shared`
- `entities` → `shared` (only when needed)
- `shared` → no feature or entity imports
- Acyclic `feature` → `feature` imports are permitted. Cycles are strictly forbidden.

---

## 6. Behavior To Preserve (Frozen Contracts)

You **MUST NOT** change these contracts unless explicitly instructed by the user in the current conversation:

1. **Phase routing before Archive**: Standard routing logic in `flow-route.ts`.
2. **`state.json` format**: `{ activePhase, activeIteration, repairCycleCount, flowMode?, commitLog?, findingsBaseline? }`.
3. **Iteration heading format**: `## Iteration N: Name [x|~| |/]`.
4. **YAML keys**: `approved`, `verdict`, `type`. Internal self-heal states (`verdict: pending`, type normalization) are managed by CLI, never set manually by agents.
5. **`config.yaml` schema**: Exactly `autoApprove`, `blockingSeverity`, `requireIterationCommit`, and `roles`. Unknown keys warn on stderr and are ignored.
6. **`roles` catalog structure**: Flat catalog of `tier`, `skills`, and optional `comment`.
7. **Skill boundary mechanics**: Phase contracts print static skill boundaries; specific skills are injected exclusively through the subagent dispatch role slot from `spawn-plan`.
8. **`ready_with_risks` validation semantics**: Allows completion when no blocking findings remain.
9. **Quick routing sequence**: Dedicated state-driven linear sequence (`quick_plan → quick_implementation → quick_validation → quick_spec_revision → archive`).
10. **Archive ownership**: Archive mutation is owned exclusively by `phasedev archive <change-name>`, never by `advance`.
11. **Auto-approval integrity**: Under `autoApprove: true`, `advance` emits a blocker requiring a dedicated sub-agent approval with `approved_by`. Bare `approved: true` re-blocks.

---

## 7. Developer Workflow & Coding Rules for This Repository

MANDATORY: Before writing, editing, or designing ANY code in this repository, invoke the `dev-core` skill first and follow its discipline.

### Commands for Framework Development
```bash
# Run full test suite
bun test

# Run TypeScript type check
npm run typecheck

# Focused unit test checks
bun test test/parser.test.ts test/controller.test.ts
bun test test/cli.test.ts test/config.test.ts
bun test test/e2e-flow.test.ts test/schema.test.ts
bun test test/spawn-plan.test.ts test/archive-command.test.ts
```

### Subagent Delegation Rules
- Decompose complex tasks and delegate implementation or research to subagents.
- Always specify an explicit `model` matched to task complexity (`cheap`/`standard`/`strong` equivalent; never `"fable"`).
- Every delegation prompt for coding work MUST contain the explicit instruction: *Invoke `dev-core` before coding*.

---

## 8. Exit Checklist — Run Before EVERY Final Answer

Verify each item. If any item fails, fix it before answering:

1. **Identity Preserved**: No attempt was made to treat this repo as a client project or run `phasedev init-project`/`create-change`.
2. **Language Respected**: User communication is in Russian; code, identifiers, tests, and comments are in English.
3. **`dev-core` Invoked**: Invoked before any code edit.
4. **Frozen Contracts Intact**: No "Behavior To Preserve" was modified without explicit user request.
5. **Architecture Maintained**: Root `src/` remains thin; dependency direction respected.
6. **Tests Verified**: Relevant tests were executed and passed; command output verified honestly.
