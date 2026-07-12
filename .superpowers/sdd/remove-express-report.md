# Remove Express Mode — Report

## Scope executed

1. Deleted `src/features/express-mode/` (contained `get-express-prompt.ts`).
2. `src/cli.ts`: removed `handleExpress`, the `express:` entry in `COMMANDS`, and the
   `getExpressPrompt` import.
3. Deleted `templates/express.md`.
4. Deleted `test/express.test.ts`. In `test/cli.test.ts`: removed `"express"` from the
   command-presence loop (line 433) and deleted the `describe("express command", ...)` block
   (former lines 3749-3759, located by content — the earlier "lines 126-136" reference in the task
   pointed at unrelated fixture markdown, not the express test).
5. `src/features/cli-help/render-help.ts`: removed the `phasedev express` help entry that sat
   between `feedback` and `advance`.
6. `README.md`: removed the Express bullet from "Execution Modes" (now two modes: Quick and
   Standard) and removed the `phasedev express` row from the Project Setup commands table.
7. `skills/phasedev-orchestrator/SKILL.md`: rewrote `## Mode Selection` to two modes (Quick /
   Standard), user may name a mode explicitly or the orchestrator proposes one and the user
   confirms; dropped the "Express MAY escalate to Quick" sentence tail while keeping the
   Quick -> Standard no-escalation rule; deleted the entire `## Express Mode` section (including
   its escalation-to-Quick step).
8. Verified via `grep -rni express src/ templates/ test/ skills/ README.md AGENTS.md` — only
   unrelated substring hits remain (`expression`, `expressed` in
   `changed-file-inventory.ts` and `templates/phase7_archive.md`); AGENTS.md had no express
   mentions and was not touched.

## Constraints honored

- Quick mode, flow-state, create-change, advance/check/prompt logic, quick templates, flow-route.ts,
  and config were not touched.
- Frozen contracts (state.json shape, iteration heading format, YAML keys, config phases/stages
  aliasing) untouched.

## Verification

```
bun test test/cli.test.ts test/readme-help-drift.test.ts test/skill-md-drift.test.ts
```
191 pass, 0 fail, 1061 expect() calls.

```
npm run typecheck
```
Clean, no errors.

```
bun test
```
716 pass, 0 fail, 2619 expect() calls, 40 files (down from prior 719 total minus the 3 removed
express-specific tests: 1 in `test/express.test.ts` describe removed as a whole file, plus 1
`describe("express command")` block with its single test in `test/cli.test.ts`, plus the loop
entry removal which doesn't add/remove a test count on its own).

## Commit

One commit created:
```
feat!: remove express mode, keep quick and standard
```

## Concerns

- None outstanding. All grep verification clean, all requested test suites green, typecheck clean.
