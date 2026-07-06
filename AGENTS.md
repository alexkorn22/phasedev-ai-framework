# PhaseDev AI Framework Agent System Prompt

This file is the repo-local system prompt for agents working inside `PhaseDev AI Framework`.

## Mission

`PhaseDev AI Framework` is an Agentic Engineering Flow controller. It does not implement product changes itself; it prints phase contracts for another agent and keeps flow state in project files.

Public entrypoints:

- `src/cli.ts`: manual CLI. Run `phasedev help` (or `phasedev --help`) for the full, current command list.
- `next` is **deprecated** — use `phase` + `advance` instead.

Do not reintroduce separate root archive, parser, checker, template, controller, runner, or config scripts.

## Architecture

Root `src/` must stay thin. Put logic in:

- `src/features/phase-control`: phase routing, prompt construction, blockers, archive phase orchestration.
- `src/entities/*`: `phase` (phase types), `change` (paths/state/approval/archive state), `config` (config parsing), `iteration-plan` (plan parsing/validation), `validation-findings`, `prd`, `design`, `research-facts`, `execution-contract`, `test-commands`, `schema`.
- `src/shared`: generic CLI, filesystem, markdown, shell, and template utilities.

Dependency direction should be:

- entrypoints -> features
- features -> entities and shared
- entities -> shared only when needed
- shared -> no project-specific feature/entity imports

## Behavior To Preserve

Keep these contracts stable unless the user explicitly changes them:

- Phase routing before Archive (previously Stage routing before Archive).
- `state.json = { activePhase, activeIteration }` — lock of the current phase.
- Iteration heading format: `## Iteration N: Name [x|~| |/]`.
- YAML keys: `approved`, `verdict`, `type`.
- `config.yaml` shape: `phases:` instead of `stages:`, with legacy alias for `stages:` and `codex.stages:`.
- `ready_with_risks` final validation semantics.
- Prompt templates by meaning, except for intentional wording updates.

## Config-Driven Skill Policy

Phase skill routing is configured in `config.yaml`, not in a separate `skill_router.md` template.

For each `phases.<phase>.skills` (or legacy `stages.<stage>.skills` / `codex.stages.<stage>.skills`):

- `routers`: optional routing/control skills. If present, the generated phase prompt must tell the agent to read them first.
- `main`: primary allowed method skills. These are not mandatory preloads; the agent should load them only when phase evidence requires them.
- `additional`: secondary allowed method skills. These are used only when `main` is insufficient or an additional skill is clearly more suitable.

Keep these contracts stable:

- Allowed external skills for a phase are configured `routers`, router-selected skills explicitly named by router content, `main`, and `additional`.
- Router-selected skills are authorized by router content and have priority over `main` and `additional`.
- Configured skills are execution-method instructions, not flow-state authorities.
- If a selected skill applies to the phase work, the agent must use its method, algorithm, checklist, or review logic.
- PhaseDev owns artifact formats, phase transitions, approval state, validation verdicts, archive state, and allowed persistent files.
- Skill-specific reports, headings, tables, lifecycle steps, approval changes, and state changes must be adapted into the current PhaseDev artifact contract, final response, or blocker instead of being copied into PhaseDev artifacts.
- If a needed skill is not available from configured routers, router-selected skills, `main`, or `additional`, the agent must stop and ask the user to update config/router or approve an exception.
- Skills do not inherit from a default config; they are explicit per phase.
- If `skills` is omitted or empty, the generated phase prompt must say no external skills are configured.
- `phasedev init` must not include phase-specific skill policy; executable `phasedev phase` prompts inject it.
- Approval/blocker prompts stay policy-free because they are controller stop messages.

## Archive Phase

Archive is a regular phase in the flow. The archive mutation (move + `.phase-archive.json`) is done by `advance` when switching to the archive phase, not by `next`.

When `advance` resolves to `archive_ready` and `runArchiveStage` is enabled:

1. `advance` moves `.phasedev/changes/<change-name>` to `.phasedev/changes/archive/<YYYY-MM-DD>-<change-name>`.
2. `advance` creates `.phase-archive.json` in the archived change with `status: "in_progress"`.
3. `advance` sets `activePhase: "archive"` in `state.json` (which moves with the change directory).

The `phase` command prints the Archive contract after the mutation; the Archive prompt includes links to the archived change path.

Resume: if a later `advance` or `phase` finds pending `.phase-archive.json` (i.e., `state.json` with `activePhase: "archive"`), the archive phase continues.

Treat Archive as completed only after `.phase-archive.json` has `status: "completed"`.

Agents executing the Archive prompt must write delta specs under the archived change and then update `.phase-archive.json`; they must not call an archive script.

## Commands

Use these checks from the `PhaseDev` directory:

```bash
bun test
npm run typecheck
```

Focused checks:

```bash
bun test test/parser.test.ts test/controller.test.ts
bun test test/cli.test.ts test/config.test.ts
bun test test/e2e-flow.test.ts test/schema.test.ts
```

CLI smoke:

```bash
phasedev init --project-path /tmp/some-project
phasedev create-change --project-path /tmp/some-project my-change
phasedev phase --project-path /tmp/some-project
phasedev check --project-path /tmp/some-project
phasedev advance --project-path /tmp/some-project
```

## Subagent Delegation

Prefer delegating work to subagents over doing it all in the main context. Actively spin up a subagent whenever a piece of work can be scoped and handed off, and pick the model tier to match the task's actual complexity — do not default every subagent to the strongest model.

### Model selection

- Custom agents (e.g. the `sp-*` agents in `.claude/agents/`) already pin their model in their definition — do NOT pass `model` when calling them and do not override it.
- Built-in generic types (`general-purpose`, `Explore`, `Plan`, etc.) have no pinned model, and an omitted `model` silently inherits the main agent's (most expensive) model — so pass a `model` matched to task complexity: `"haiku"` for mechanical/narrow work, `"sonnet"` for routine single-module work, `"opus"` for complex or high-stakes work. Do not pass `model: "fable"`.
- `subagent_type: "fork"` always runs on the main agent's model and ignores `model` — do not pass it there.

### Choosing subagent_type

Agent types are defined by the Claude Code environment (see the available agent types listed in the session); do not redefine them here. Pick the type whose description matches the task, and to continue a previously spawned agent with its context intact, use SendMessage instead of launching a fresh one.

### Guidelines

- Split a task into independent subtasks whenever possible and dispatch them to parallel subagents in a single message rather than doing them sequentially in the main thread.
- Match model cost to task difficulty: never pay for a top-tier model on a trivial task, and never underpower a subagent on a task that needs real reasoning.
- The main agent should act as an orchestrator: decompose the request, delegate each piece to the right subagent/model, then integrate results — rather than doing the implementation itself when delegation is feasible.
- If a subagent's output reveals the task was more complex than expected, escalate the remaining work to a stronger model rather than forcing the same subagent to continue.
- Subagents cannot ask the user questions mid-task: put all needed context, constraints, and acceptance criteria into the delegation prompt, and require a concrete report (what changed, what was verified) as the final message.

## Coding Rules

MANDATORY: before writing, editing, or designing any code, invoke the `dev-core` skill first and follow its discipline — even for small or trivial-looking changes. When delegating implementation work to a subagent, the delegation prompt must explicitly instruct it to invoke `dev-core` before coding.

- Keep changes scoped to the requested behavior.
- In the end, the code should always be self-documenting with a minimum of comments.
- Prefer existing module boundaries over new abstractions.
- Use explicit return types for exported functions.
- Keep executable/config code in English.
- Use `apply_patch` for manual edits.
- Update tests when production behavior or imports change.
- Run the most relevant focused tests first, then the full suite for cross-module changes.
