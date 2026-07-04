# ⚙️ PhaseDev AI Framework

[![Bun Supported](https://img.shields.io/badge/Bun-%23000000.svg?style=flat&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <img src="https://raw.githubusercontent.com/your-username/phasedev/main/temp/docs/phasedev_banner.png" alt="PhaseDev Banner" width="100%">
</p>

**PhaseDev AI Framework** is a state-driven, gated framework for autonomous AI software engineering. It coordinates AI agents through strict, isolated development phases by saving the process state directly in your project workspace rather than relying on unstable LLM chat histories.

> [!IMPORTANT]
> **Take control of your AI Agents.** Long chat histories lead to *Context Drift* (agents forgetting instructions), *Token Bloat* (skyrocketing API costs), and code regression. PhaseDev AI Framework solves this by splitting work into atomic phases, resetting the agent's context window on every step, and using the workspace files as the single source of truth.

---

## ⚙️ How It Works

PhaseDev implements a strict phase state machine. In each iteration, it analyzes the files inside the active change directory (`.phasedev/changes/<change-name>`) to determine the current phase, prints the exact contract/prompt for that phase, executes the agent in a clean session, and records the results.

```mermaid
flowchart LR
    StateFiles[(".phasedev/changes/*")] -->|Read state| Controller[PhaseDev Controller]
    Controller -->|Determine phase & generate contract| Agent[Clean AI Session]
    Agent -->|Execute step & write results| StateFiles
    Agent -->|Reset context| End([Session Closed])
```

### The Phases of PhaseDev:
1. **Phase 1. Change Intake**: Write `prd.md` (Product Requirements) & `execution_contract.md` (Execution Contract). *Requires human approval.*
2. **Phase 2. Code Research**: Automatically collect codebase facts into `research_facts.md`.
3. **Phase 3. Technical Design**: Propose technical architecture in `architecture/design.md`. *Requires human approval.*
4. **Phase 4. Iteration Planning**: Break down implementation into atomic tasks in `iteration_plan.md`. *Requires human approval.*
5. **Phase 5. Implementation**: Code and run checks iteration-by-iteration.
6. **Phase 6A. Iteration Validation**: Review the code against iteration-specific tests.
7. **Phase 6B. Final Validation**: Verify the entire changeset against PRD success criteria.
8. **Phase 6R. Repair Loop**: If validation fails, automatically fix findings until clean.
9. **Phase 7. Archive**: Move changes to archive and generate delta specifications.

---

## 🚀 Quick Start (Manual Mode)

### 1. Installation
Clone this repository and install the dependencies:
```bash
git clone https://github.com/your-username/phasedev.git
cd phasedev
npm install
```

### 2. Initialize PhaseDev in a Target Project
Create the PhaseDev workspace structure and project-local config in your target project:
```bash
phasedev init-project --project-path /absolute/path/to/your-project
```
This creates `.phasedev/changes/`, `.phasedev/changes/archive/`, `.phasedev/specs/`, `.phasedev/logs/`, and `.phasedev/config.yaml`. It does not create an active change folder.

### 3. Create a Change
Start a new change to track through the phase lifecycle:
```bash
phasedev create-change my-change --project-path /absolute/path/to/your-project
```
This creates a new change directory under `.phasedev/changes/<change-name>` and initializes flow state.

### 4. Run the Init Handshake
Before sending executable phase prompts to an AI agent, print the context-only init handshake:
```bash
phasedev init --project-path /absolute/path/to/your-project
```
This command does not modify files. It only tells the agent to wait for the current phase contract.

### 5. Get the Phase Contract and Advance
Get the contract for the current phase to feed into your AI model:
```bash
phasedev phase --project-path /absolute/path/to/your-project
```

After completing the phase work, validate and transition:
```bash
phasedev check --project-path /absolute/path/to/your-project
phasedev advance --project-path /absolute/path/to/your-project
```

> **Note:** `phasedev next` is deprecated — use `phasedev phase` and `phasedev advance` instead.

---

## 📋 Commands

### Project Setup
| Command | Description |
|---------|-------------|
| `phasedev init-project [--project-path <path>]` | Create `.phasedev` workspace directories and `config.yaml` |
| `phasedev init [--project-path <path>]` | Print the context-only handshake prompt (no file changes) |
| `phasedev create-change <name> [--project-path <path>]` | Create a new change directory and initialize flow state |

### Phase Flow
| Command | Description |
|---------|-------------|
| `phasedev phase [--project-path <path>] [--config <path>]` | Resolve current flow state and print the phase contract |
| `phasedev check [--project-path <path>] [--phase <phase>]` | Validate current phase state |
| `phasedev advance [--project-path <path>] [--config <path>]` | Advance to the next phase after validation |
| `phasedev check-validation --project-path <path> --scope iteration --iteration-id <N>` | Validate iteration validation findings |
| `phasedev check-validation --project-path <path> --scope final` | Validate final validation findings |
| `phasedev check-archive --archive-path <path>` | Validate completed archive state and delta specs |
| `phasedev next [--project-path <path>]` | **Deprecated** — use `phase` and `advance` instead |

### Artifact Management
| Command | Description |
|---------|-------------|
| `phasedev approve <file> [--by <name>]` | Set `approved: true` in YAML frontmatter |
| `phasedev validate-artifact <file>` | Validate an artifact file |
| `phasedev set-iteration-status <id> <status> [--project-path <path>]` | Update iteration status (x/~/space) |
| `phasedev add-finding <id> <title> <severity> [--class <class>] [--iteration <iteration>]` | Add a finding to `validation_findings.md` |
| `phasedev resolve-finding <id>` | Mark a finding as resolved |

### Flow Status & Info
| Command | Description |
|---------|-------------|
| `phasedev status [--project-path <path>]` | Print current flow summary |
| `phasedev changes [--project-path <path>]` | List all changes (active and archived) |
| `phasedev list [--project-path <path>]` | Alias for `changes` |
| `phasedev log [--project-path <path>] [--tail N]` | View flow log entries |
| `phasedev config [--project-path <path>] <key>` | Read a config key |
| `phasedev config set <key> <value> [--project-path <path>]` | Write a config key |

### Meta
| Command | Description |
|---------|-------------|
| `phasedev help` | Print this help (`--help`, `-h`) |
| `phasedev version` | Print framework version (`--version`, `-V`) |
| `phasedev reset-change [--project-path <path>] [--yes\|--force]` | Reset (move to `.trash`) the active change |

---

## 🤖 Automated Loop: PhaseDev Runner

> [!WARNING]
> **Deprecated.** The automated runner (`npm run phasedev:run`) is no longer maintained. Use `phasedev phase` and `phasedev advance` instead — they provide the same phase contracts with human oversight.

The **PhaseDev Runner** (runner) automates the manual cycle by launching isolated agent runs, executing phase prompts, logging answers, and monitoring progress. This functionality is **deprecated** and may be removed in a future release.

### Run automation:
```bash
npm run phasedev:run -- --project-path /absolute/path/to/your-project
```

### Real-time Telegram Notifications
PhaseDev supports sending console outputs and loop milestones directly to your Telegram channel. 
Copy `.env.example` to `.env` and fill in:
```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

Configure Telegram in `runner.yaml` under the `loop` section.

---

## 🛠️ Configuration

Configure phases and flow flags in `config.yaml`:

```yaml
phases:
  change_intake:
    skills:
      routers: []
      main: []
      additional: []
  # ... other phases

# Root-level flow flags
runArchiveStage: true
autoApprove: false
maxIterations: 10
```

Runner-specific settings (model, logging, Telegram) belong in `runner.yaml`. The runner is **deprecated** — use `phasedev phase` and `phasedev advance` instead.

`autoApprove: true` is only used by the automated runner (deprecated). It sets `approved: true` and
`approved_by: "PhaseDev Runner"` on valid approval artifacts after controller validation has
already routed to an approval gate. Manual `phasedev phase`/`advance` flow still stops for human review.

---

## 🤝 Contributing & Extensions

PhaseDev is designed for extension. You can add custom execution scripts and guidelines under `src/features` or configure custom phase routers in `config.yaml` to dynamically load domain skills.

License: MIT
