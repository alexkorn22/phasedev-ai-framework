Stage 6. System Evolution.

This stage is reserved for manual post-incident analysis and is not part of the normal `phasedev next` route.

Use it only on an explicit user command.

Input data:
- Incident description: {{incident}}
- Code area where the error appeared: {{change_scope}}
- Tests and checks around the failure: {{test_scope}}

Stage contract:
- identify the root cause summary;
- state which flow stage should have caught the incident;
- propose a permanent preventer: a reusable rule/template change, regression check, backlog item, or flow change;
- do not change one-off `rules.md` from a completed change unless the user explicitly asks;
- apply changes only if the user explicitly asked.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- no persistent artifacts unless the user explicitly asks to apply a preventer

Stage completion:
- After analysis, stop.
- Report the root cause summary and proposed preventers.
- Do not suggest `phasedev next` for continuing the normal route.

## Skill Policy

This reserved manual stage is outside normal `phasedev next` routing and has no configured external skills.
Do not use external skills unless the user explicitly approves them for this manual analysis.

Constraints:
- do not move to the next stage without a new `phasedev next` command;
- do not change approvals, statuses, or verdicts outside the rules of the current stage contract;
- do not change approved artifacts outside the stage contract;
- do not do work outside the current stage unless the user explicitly asked;
