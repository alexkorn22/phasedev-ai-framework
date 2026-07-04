Phase Evolution.

This phase is reserved for manual post-incident analysis and is not part of the normal `phasedev phase` route.

Use it only on an explicit user command.

Input data:
- Incident description: {{incident}}
- Code area where the error appeared: {{change_scope}}
- Tests and checks around the failure: {{test_scope}}

Phase contract:
- identify the root cause summary;
- state which flow phase should have caught the incident;
- propose a permanent preventer: a reusable rule/template change, regression check, backlog item, or flow change;
- do not change one-off `execution_contract.md` from a completed change unless the user explicitly asks;
- apply changes only if the user explicitly asked.

## Artifact allowlist

Allowed persistent artifacts for this phase:
- no persistent artifacts unless the user explicitly asks to apply a preventer

Phase completion:
- After analysis, stop.
- Report the root cause summary and proposed preventers.
- Do not suggest `phasedev phase` for continuing the normal route.

## Skill Policy

This reserved manual phase is outside normal `phasedev phase` routing and has no configured external skills.
Do not use external skills unless the user explicitly approves them for this manual analysis.

Constraints:
- do not move to the next phase without a new `phasedev advance` command;
- do not change approvals, statuses, or verdicts outside the rules of the current phase contract;
- do not change approved artifacts outside the phase contract;
- do not do work outside the current phase unless the user explicitly asked;
