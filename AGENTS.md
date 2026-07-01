# PhaseDev AI Framework Agent System Prompt

This file is the repo-local system prompt for agents working inside `PhaseDev AI Framework`.

## Mission

`PhaseDev AI Framework` is an Agentic Engineering Flow controller. It does not implement product changes itself; it prints stage contracts for another agent and keeps flow state in project files.

Preserve these public entrypoints:

- `src/cli.ts`: manual CLI for `init` and `next`.
- `src/runner.ts`: automated loop runner.

Do not reintroduce separate root archive, parser, checker, template, controller, or config scripts.

## Architecture

Root `src/` must stay thin. Put logic in:

- `src/features/stage-control`: stage routing, prompt construction, blockers, archive stage orchestration.
- `src/features/runner`: runner loop, Codex turns, streaming reporter, snapshots, logs.
- `src/entities`: stage types, change paths/state/approval, config parsing, implementation-plan parsing/validation, validation findings, test commands.
- `src/shared`: generic CLI, filesystem, markdown, shell, and template utilities.

Dependency direction should be:

- entrypoints -> features
- features -> entities and shared
- entities -> shared only when needed
- shared -> no project-specific feature/entity imports

## Behavior To Preserve

Keep these contracts stable unless the user explicitly changes them:

- Stage routing before Archive.
- Phase heading format: `## Phase N: Name [x|~| |/]`.
- YAML keys: `approved`, `verdict`, `type`.
- `config.yaml` shape, including per-stage `skills.routers`, `skills.main`, and `skills.additional`.
- Runner loop result statuses: `archived`, `blocked`, `no_progress`, `max_iterations`.
- `ready_with_risks` final validation semantics.
- Prompt templates by meaning, except for intentional wording updates.

## Config-Driven Skill Policy

Stage skill routing is configured in `config.yaml`, not in a separate `skill_router.md` template.

For each `codex.stages.<stage>.skills`:

- `routers`: optional routing/control skills. If present, the generated stage prompt must tell the agent to read them first.
- `main`: primary allowed method skills. These are not mandatory preloads; the agent should load them only when stage evidence requires them.
- `additional`: secondary allowed method skills. These are used only when `main` is insufficient or an additional skill is clearly more suitable.

Keep these contracts stable:

- Allowed external skills for a stage are configured `routers`, router-selected skills explicitly named by router content, `main`, and `additional`.
- Router-selected skills are authorized by router content and have priority over `main` and `additional`.
- Configured skills are execution-method instructions, not flow-state authorities.
- If a selected skill applies to the stage work, the agent must use its method, algorithm, checklist, or review logic.
- PhaseDev owns artifact formats, stage transitions, approval state, validation verdicts, archive state, and allowed persistent files.
- Skill-specific reports, headings, tables, lifecycle steps, approval changes, and state changes must be adapted into the current PhaseDev artifact contract, final response, or blocker instead of being copied into PhaseDev artifacts.
- If a needed skill is not available from configured routers, router-selected skills, `main`, or `additional`, the agent must stop and ask the user to update config/router or approve an exception.
- Skills do not inherit from `codex.default`; they are explicit per stage.
- If `skills` is omitted or empty, the generated stage prompt must say no external skills are configured.
- `phasedev init` must not include stage-specific skill policy; executable `phasedev next` prompts inject it.
- Approval/blocker prompts stay policy-free because they are controller stop messages.

## Archive Stage

Archive is part of `cli.ts next` (alias `phasedev next`); there is no separate archive command.

When final validation is ready and every phase is `[x]`, `next` must:

1. Move `.phasedev/changes/<change-name>` to `.phasedev/changes/archive/<YYYY-MM-DD>-<change-name>` before printing the Archive prompt.
2. Create `.phase-archive.json` in the archived change with `status: "in_progress"`.
3. Print the Archive prompt with links to the archived change path.
4. Resume the same Archive prompt if a later `next` finds pending `.phase-archive.json`.
5. Treat Archive as completed only after `.phase-archive.json` has `status: "completed"`.

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
bun test test/cli.test.ts test/config.test.ts test/runner.test.ts
```

CLI smoke:

```bash
phasedev init --project-path /tmp/some-project
phasedev next --project-path /tmp/some-project
```

Do not run `npm run run` as a casual smoke test unless the user wants a real Codex SDK loop.

## Coding Rules

- Keep changes scoped to the requested behavior.
- Prefer existing module boundaries over new abstractions.
- Use explicit return types for exported functions.
- Keep executable/config code in English.
- Use `apply_patch` for manual edits.
- Update tests when production behavior or imports change.
- Run the most relevant focused tests first, then the full suite for cross-module changes.
