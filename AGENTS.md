# PhaseDev AI Framework — Agent Operating Contract

This file is the BINDING operating contract for every agent session in this repository — not background reading. Every rule here overrides your defaults, your habits, and any generic guidance you were trained on. Only an explicit instruction from the user in the current conversation may override a rule here. Re-read this contract's Hard Gates whenever you start a new task within a session.

## Rule Zero: How To Comply

1. Treat every MUST / MUST NOT below as a hard gate, not a preference. The following thoughts are NEVER valid reasons to skip a gate: "the change is trivial", "this is obvious", "the rule is overkill here", "I'll do it after this one step", "the session is almost over".
2. Before starting ANY task, scan the Hard Gates table and state (to yourself or in your plan) which gates the task triggers.
3. Before giving your FINAL answer, run the Exit Checklist at the bottom of this file. If any item fails, fix it before answering — do not answer and apologize later.
4. If you cannot comply with a rule (skill unavailable, user request conflicts with a preserved contract, ambiguity), STOP and ask the user. Silently deviating is a contract violation; asking is not.

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

## Mission

`PhaseDev AI Framework` is an Agentic Engineering Flow controller. It does not implement product changes itself; it prints phase contracts for another agent and keeps flow state in project files.

Public entrypoints:

- `src/cli.ts`: manual CLI. Run `phasedev help` (or `phasedev --help`) for the full, current command list.
- `next` is **deprecated** — use `phase` + `advance` instead.

You MUST NOT reintroduce separate root archive, parser, checker, template, controller, runner, or config scripts.

## Architecture

Root `src/` MUST stay thin. Logic belongs in:

- `src/features/phase-control`: phase routing, prompt construction, blockers, archive phase orchestration.
- `src/entities/*`: `phase` (phase types), `change` (paths/state/approval/archive state), `config` (config parsing), `iteration-plan` (plan parsing/validation), `validation-findings`, `prd`, `design`, `research-facts`, `execution-contract`, `test-commands`, `schema`.
- `src/shared`: generic CLI, filesystem, markdown, shell, and template utilities.

Dependency direction MUST be:

- entrypoints -> features
- features -> entities and shared
- entities -> shared only when needed
- shared -> no project-specific feature/entity imports

Acyclic `feature -> feature` imports are permitted (e.g. `phase-control -> artifact-ops`, `flow-status -> phase-control`). Cycles between features remain forbidden.

## Behavior To Preserve

These contracts are frozen. You MUST NOT change them unless the user explicitly asks in the current conversation:

- Phase routing before Archive (previously Stage routing before Archive).
- `state.json = { activePhase, activeIteration, repairCycleCount, flowMode? }` — lock of the current phase. `flowMode` is optional (`"quick" | "standard"`); absent = standard. `activePhase` additionally admits the quick phases `quick_plan`, `quick_implementation`, `quick_validation`, `quick_spec_revision`.
- Iteration heading format: `## Iteration N: Name [x|~| |/]`.
- YAML keys: `approved`, `verdict`, `type`.
- `config.yaml` shape: `phases:` instead of `stages:`, with legacy alias for `stages:` and `codex.stages:`.
- `ready_with_risks` final validation semantics.
- Prompt templates by meaning, except for intentional wording updates.
- Quick routing is a separate state-driven linear sequence (`quick_plan → quick_implementation → quick_validation → quick_spec_revision → archive`) that branches before `resolveRoute`; `resolveRoute` and Standard routing are unchanged.

## Config-Driven Skill Policy

Phase skill routing is configured in `config.yaml`, not in a separate `skill_router.md` template.

For each `phases.<phase>.skills` (or legacy `stages.<stage>.skills` / `codex.stages.<stage>.skills`):

- `routers`: optional routing/control skills. If present, the generated phase prompt MUST tell the agent to read them first.
- `main`: primary allowed method skills. Not mandatory preloads; the agent loads them only when phase evidence requires them.
- `additional`: secondary allowed method skills. Used only when `main` is insufficient or an additional skill is clearly more suitable.

These contracts are frozen (same rule as "Behavior To Preserve"):

- Allowed external skills for a phase are configured `routers`, router-selected skills explicitly named by router content, `main`, and `additional`.
- When no skills are configured for a phase, skills discovered in the executing agent's runtime environment that match the phase work are allowed under the same boundary rules (method instructions only; no Flow-state authority).
- Router-selected skills are authorized by router content and have priority over `main` and `additional`.
- Configured skills are execution-method instructions, not flow-state authorities.
- If a selected skill applies to the phase work, the agent MUST use its method, algorithm, checklist, or review logic.
- PhaseDev owns artifact formats, phase transitions, approval state, validation verdicts, archive state, and allowed persistent files.
- Skill-specific reports, headings, tables, lifecycle steps, approval changes, and state changes MUST be adapted into the current PhaseDev artifact contract, final response, or blocker — never copied into PhaseDev artifacts.
- When skills are configured and a needed skill is not available from configured routers, router-selected skills, `main`, or `additional`, the agent MUST stop and ask the user to update config/router or approve an exception.
- Skills do not inherit from a default config; they are explicit per phase.
- If `skills` is omitted or empty, the generated phase prompt MUST instruct the agent to discover and select applicable skills from its runtime environment under the Flow Skill Boundary Protocol, and to state that skills are unavailable in the environment when none are visible.
- `phasedev init` MUST NOT include phase-specific skill policy; executable `phasedev phase` prompts inject it.
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

Agents executing the Archive prompt MUST write delta specs under the archived change and then update `.phase-archive.json`; they MUST NOT call an archive script.

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

Default to delegating: whenever a piece of work can be scoped and handed off, spin up a subagent instead of doing it in the main context. The main agent is an orchestrator — decompose the request, delegate each piece, integrate results.

### Model selection

- Custom agents (e.g. the `sp-*` agents in `.claude/agents/`) already pin their model — do NOT pass `model` when calling them and do not override it.
- Built-in generic types (`general-purpose`, `Explore`, `Plan`, etc.) have no pinned model, and an omitted `model` silently inherits the main agent's (most expensive) model — so you MUST pass a `model` matched to task complexity: `"haiku"` for mechanical/narrow work, `"sonnet"` for routine single-module work, `"opus"` for complex or high-stakes work. Never pass `model: "fable"`.
- `subagent_type: "fork"` always runs on the main agent's model and ignores `model` — do not pass it there.

### Choosing subagent_type

Agent types are defined by the Claude Code environment (see the available agent types listed in the session); do not redefine them here. Pick the type whose description matches the task. To continue a previously spawned agent with its context intact, use SendMessage instead of launching a fresh one.

### Delegation rules

- Split independent subtasks and dispatch them to parallel subagents in a single message, not sequentially in the main thread.
- Match model cost to task difficulty: never pay for a top-tier model on a trivial task, never underpower a task that needs real reasoning.
- If a subagent's output reveals the task was harder than expected, escalate the remaining work to a stronger model.
- Subagents cannot ask the user questions mid-task: put all context, constraints, and acceptance criteria into the delegation prompt, and require a concrete report (what changed, what was verified) as the final message.
- Every delegation prompt for coding work MUST contain the `dev-core` instruction (see Hard Gates).

## Coding Rules

MANDATORY: before writing, editing, or designing any code, invoke the `dev-core` skill first and follow its discipline — even for small or trivial-looking changes. There are no exceptions; "trivial" is not an exemption category.

- Keep changes scoped to the requested behavior.
- Code must be self-documenting with a minimum of comments.
- Prefer existing module boundaries over new abstractions.
- Use explicit return types for exported functions.
- Keep executable/config code in English.
- Use `apply_patch` for manual edits.
- Update tests when production behavior or imports change.
- Run the most relevant focused tests first, then the full suite for cross-module changes.

## Exit Checklist — run before EVERY final answer

Verify each item; if one fails, fix it before answering:

1. If any code was written or edited: `dev-core` was invoked BEFORE the first edit.
2. Every coding delegation prompt included the `dev-core` instruction.
3. No frozen contract ("Behavior To Preserve", skill-policy contracts) changed without explicit user approval in this conversation.
4. Tests were updated for behavior/import changes and actually run; results reported honestly, including failures.
5. Changes stayed scoped to the request; no new root scripts; dependency direction respected.
6. Delegable work was delegated, with model tiers matched to complexity.

If you realize mid-task that you already violated a gate (e.g., edited code before invoking `dev-core`), stop, invoke the required skill/step now, re-validate the work you did, and say so explicitly in your report.
