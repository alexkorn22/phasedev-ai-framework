---
approved: false
approved_by: ""
date: {{date}}
---

<!--
Authoring instructions for the setup agent:
- Instantiate this template into the change directory as prd.md.
- Remove every HTML comment from the final prd.md.
- Keep exactly one visible top-level title: # PRD.
- Fill every Intent Card cell with concrete task content.
- Do not leave blank cells, copied field descriptions, or placeholder-like prose in the final artifact.
- Do not write TBD, TODO, unknown, clarify later, or to be decided.
- Before writing prd.md, run an ADLC-style user intake through the question tool when available.
- Continue asking 1-3 focused questions per round until all material ambiguity is closed.
- Do not invent unknown intent, signal, scope, risk, assumptions, or validation expectations.
- Ask the user before writing prd.md if an unresolved question affects Intent Card, requirements, scope, success criteria, risk envelope, assumptions, or test commands.
- The final prd.md may contain only the # PRD title and the seven ## sections shown below, in this exact order.
- Do not add other ## sections such as Risks, Notes, Open Questions, Validation, Non-goals, or Security.
- Do not add ### or deeper headings. Put additional material inside the allowed sections using lists, tables, or short paragraphs.

Intent Card field contract:
- Change type: use exactly one of these values: feature, fix, refactor, infra, experiment.
- User or business intent: answer why the task is needed and what decision/user/system need it supports.
- Generation target: answer what target state should exist after generation is complete.
- Resolution signal: use only for hypotheses, experiments, or future decisions. For ordinary tasks, write not_applicable when Success Criteria fully covers verification. Do not repeat Success Criteria here.
- Decision deadline: use a concrete date/timebox when a decision is expected. Use not_applicable only when there is no time-bound decision.
- Risk envelope: state acceptable risks and unacceptable risks. Include security/data/behavioral boundaries when relevant.
- The Intent Card table must contain only the rows shown below, in the same order.

Section contract:
- Approval Summary: compactly state what the human approves. Include scope, out-of-scope, key success, and reviewer attention when material.
- Requirements: list required user/system behavior as R1:, R2:, etc. Do not describe implementation design here.
- Scope Boundaries: explicitly include lines starting with In scope: and Out of scope:.
- Success Criteria: list concrete completion criteria that later stages can validate as SC1:, SC2:, etc.
- Accepted Assumptions: list assumptions accepted for this change, or write None.
- Deferred Decisions: list decisions intentionally deferred to design/planning, or write None.

ADLC-style intake coverage:
- For feature/experiment changes, clarify hypothesis or decision need, expected impact, resolution signal, decision deadline, scope boundaries, non-goals, risk envelope, and validation evidence.
- For fix/refactor/infra changes, clarify desired behavior or target state, preserved behavior, non-goals, regression boundaries, validation evidence, and risk boundaries.
- Use not_applicable only when the user context and change type make a field genuinely irrelevant, not because the agent skipped intake.
- Accepted Assumptions must be explicit user-accepted assumptions, not silent agent guesses.
- Deferred Decisions must be intentional design/planning decisions, not missing requirements.

Blocking question rule:
- Stop and ask the user instead of writing prd.md if missing information changes Intent Card, requirements, scope boundaries, success criteria, risk envelope, assumptions, test commands, or whether the change is feature/fix/refactor/infra/experiment.
-->

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type |  |
| User or business intent |  |
| Generation target |  |
| Resolution signal |  |
| Decision deadline |  |
| Risk envelope |  |

## Approval Summary

## Requirements

- R1:

## Scope Boundaries

- In scope:
- Out of scope:

## Success Criteria

- SC1:

## Accepted Assumptions

## Deferred Decisions
