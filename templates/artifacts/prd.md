---
approved: false
approved_by: ""
date: {{date}}
---

<!--
Authoring instructions for the setup agent:
- Instantiate this template into the active change directory as prd.md.
- Do not create or update a project-root prd.md file.
- Remove every HTML comment from the final prd.md.
- Keep exactly one visible top-level title: # PRD.
- Do not leave blank cells, copied field descriptions, or placeholder-like prose in the final artifact.
- Do not write TBD, TODO, unknown, clarify later, or to be decided.
- Before writing prd.md, ask only questions whose answers change Intent fields, R# requirements, SC# success criteria, risk boundaries, evidence type, or test commands.
- The final prd.md may contain only the # PRD title and the three ## sections shown below, in this exact order.
- Do not add any other ## sections.
- Do not add ### or deeper headings. Put additional material inside the allowed tables.

Intent field contract:
- Change type: use exactly one of these values: feature, fix, refactor, infra, experiment.
- Why: answer why the task is needed and what user/system/business need it supports.
- Target state: answer what must be true after the change is complete.
- Risk boundaries: state unacceptable regressions, data/security/behavior boundaries, or "None beyond normal project risk" when there is no special risk boundary.

Requirements contract:
- Requirements are user/system behavior or required project outcome, not implementation design.
- IDs must be R1, R2, R3, etc.

Success Criteria contract:
- IDs must be SC1, SC2, SC3, etc.
- Verifies must reference one or more existing R# IDs, separated by commas when needed.
- Criterion states the observable proof target.
- Evidence is the evidence type only, not the command. Use exactly one of: unit, phase, full, review, manual, smoke.
- Concrete commands live only in rules.md.

Positive contract rule:
- If needed work does not follow from Target state, R#, SC#, or Risk boundaries, do not include it in the PRD.
- If needed verification does not follow from SC# and Evidence, do not invent it.
-->

# PRD

## Intent

| Field | Value |
|---|---|
| Change type |  |
| Why |  |
| Target state |  |
| Risk boundaries |  |

## Requirements

| ID | Requirement |
|---|---|
| R1 |  |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 |  |  |
