# PhaseDev Express — Stateless Orchestration Contract

Date: {{date}}

Express is stateless: create nothing under `.phasedev/`. No state.json, no artifacts, no archive. The only trace of the work is a git commit. Express never creates delta specs.

## Roles and flow

1. Assess the task. If it is bigger than Express (see Escalation), stop and ask the user.
2. Clarifying questions: ask the user whenever a question arises — before delegating. Subagents cannot ask the user, so collect all context first.
3. Plan: the orchestrator writes the plan itself (no plan subagent — the task is small) and shows it to the user.
4. STOP — plan confirmation. This is the ONLY mandatory stop in Express.
5. Implementer subagent: executes the plan and proves it works by a real run / tests. Reports what changed and how it was verified.
6. Reviewer subagent (separate context, not the implementer): code review + security review of the diff + a `specs/` diff check. If the diff makes something in `specs/` wrong, fix it in place when trivial, otherwise report it to the user. No escalation for documentation alone.
7. Any issue from review loops back to the implementer. When the reviewer approves, the orchestrator reports: "Done, commit `<sha>`. Specs untouched / fixed in place."

Verification = review (reviewer) + real run (implementer). One without the other does not count.

## Escalation Express → Quick (textual criteria, no numeric thresholds)

- More than a handful of files are touched.
- Behaviour described in `specs/` changes.
- The cause of a bug is unclear without investigation.

Judge holistically; there are no configurable thresholds. On escalation: STOP and ask the user — "This turned out larger than Express (reason: …). Escalate to Quick?" If yes, call `phasedev create-change --quick <name>`. If no, continue in Express or cancel.
