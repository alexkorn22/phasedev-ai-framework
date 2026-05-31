# Agentic Development Flow Agent System Prompt

This file is the repo-local system prompt for agents working inside `Agentic Development Flow`.

## Mission

`Agentic Development Flow` is an Agentic Engineering Flow controller. It does not implement product changes itself; it prints stage contracts for another agent and keeps flow state in project files.

Preserve these public entrypoints:

- `src/flow-cli.ts`: manual CLI for `init` and `next`.
- `src/flow-ralph.ts`: automated Ralph loop.

Do not reintroduce separate root archive, parser, checker, template, controller, or config scripts.

## Architecture

Root `src/` must stay thin. Put logic in:

- `src/features/flow-control`: flow stage routing, prompt construction, blockers, archive stage orchestration.
- `src/features/ralph-runner`: Ralph loop, Codex turns, streaming reporter, snapshots, logs.
- `src/entities`: flow-stage types, flow-change paths/state/approval, flow config parsing, implementation-plan parsing/validation, validation findings, test commands.
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
- Ralph result statuses: `archived`, `blocked`, `no_progress`, `max_iterations`.
- `ready_with_risks` final validation semantics.
- Prompt templates by meaning, except for intentional wording updates.

## Config-Driven Skill Policy

Stage skill routing is configured in `config.yaml`, not in a separate `skill_router.md` template.

For each `codex.stages.<stage>.skills`:

- `routers`: optional routing/control skills. If present, the generated stage prompt must tell the agent to read them first.
- `main`: primary allowed method skills. These are not mandatory preloads; the agent should load them only when stage evidence requires them.
- `additional`: secondary allowed method skills. These are used only when `main` is insufficient or an additional skill is clearly more suitable.

Keep these contracts stable:

- Allowed external skills for a stage are only `routers + main + additional`.
- Router rules must not expand the allowlist to unlisted skills.
- If a needed skill is unlisted, the agent must stop and ask the user to update config or approve an exception.
- Skills do not inherit from `codex.default`; they are explicit per stage.
- If `skills` is omitted or empty, the generated stage prompt must say no external skills are configured.
- `flow init` must not include stage-specific skill policy; executable `flow next` prompts inject it.
- Approval/blocker prompts stay policy-free because they are controller stop messages.

## Archive Stage

Archive is part of `flow-cli next`; there is no separate archive command.

When final validation is ready and every phase is `[x]`, `next` must:

1. Move `openspec/changes/<change-name>` to `openspec/changes/archive/<YYYY-MM-DD>-<change-name>` before printing the Archive prompt.
2. Create `.flow-archive.json` in the archived change with `status: "in_progress"`.
3. Print the Archive prompt with links to the archived change path.
4. Resume the same Archive prompt if a later `next` finds pending `.flow-archive.json`.
5. Treat Archive as completed only after `.flow-archive.json` has `status: "completed"`.

Agents executing the Archive prompt must write delta specs under the archived change and then update `.flow-archive.json`; they must not call an archive script.

## Commands

Use these checks from the `Agentic Development Flow` directory:

```bash
bun test
npm run typecheck
```

Focused checks:

```bash
bun test test/parser.test.ts test/flow-controller.test.ts
bun test test/flow-cli.test.ts test/flow-config.test.ts test/flow-ralph.test.ts
```

CLI smoke:

```bash
bun run src/flow-cli.ts init --project-path /tmp/some-project
bun run src/flow-cli.ts next --project-path /tmp/some-project
```

Do not run `npm run flow:ralph` as a casual smoke test unless the user wants a real Codex SDK loop.

## Coding Rules

- Keep changes scoped to the requested behavior.
- Prefer existing module boundaries over new abstractions.
- Use explicit return types for exported functions.
- Keep executable/config code in English.
- Use `apply_patch` for manual edits.
- Update tests when production behavior or imports change.
- Run the most relevant focused tests first, then the full suite for cross-module changes.
