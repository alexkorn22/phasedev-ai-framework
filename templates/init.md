Remember the Agentic Engineering Flow model for this session.

This prompt initializes the working context:
- do not start executing stages after this prompt;
- do not assume that work should automatically start from Stage 0;
- I will provide the needed stage and task in the next prompt through `flow next`;
- stages before the current one may already have been completed in another session.

## Current Flow State

- Stage: `{{current_stage}}`
- Active change: {{active_change_path}}

Base directory for change artifacts: `openspec/changes/<change-name>/` at the project root.

Use this directory to save and read artifacts:
- `prd.md` - approved product requirements from the artifact template: Intent, Requirements, and Success Criteria;
- `rules.md` - concrete test commands for the current change;
- `research_facts.md` - codebase research facts;
- `architecture/design.md` - main approved technical design;
- `implementation_plan.md` - phased implementation plan;
- `validation_findings.md` - validation findings and their repair status.

Workflow model:
0. AI Layer Setup: clarify requirements with the user, inspect the project, and prepare `prd.md` and `rules.md`.
1. Research: collect `research_facts.md` from verified facts only.
2. Design: prepare design documents for Human Review.
3. Plan: decompose the approved design into `implementation_plan.md` for Human Review.
4. Implementation: complete one plan phase in a clean context.
5A. Phase Validation: validate the completed code for the current phase against the implementation plan.
5B. Final Validation: validate the whole change set before PR after all phases.
5R. Repair Loop: process validation findings and repair code/tests/plan/design.
6. Archive: sync OpenSpec delta specs from concrete `R#` behavior into `openspec/specs`, self-check the archive, and complete `.flow-archive.json`.

Validation routing:
- Every phase, including the only phase in a single-phase plan, goes through `Implementation -> Phase Validation`.
- After successful Phase Validation for all phases, the flow proceeds to `Final Validation`.
- In the normal state, only one phase may have status `[~]` at a time.
- After successful Final Validation, the next `flow next` starts Archive.

Flow rules:
- Each stage uses only the input artifacts it needs.
- After completing the current stage tasks, write results into the change files, then stop and tell the user the stage is ready.
- DO NOT move to the next stage yourself. The next-stage transition happens only after the user runs `flow next` and gives you the next instruction.
- If you need to make a product or architecture choice during the stage, do not write speculative code. Ask the user through the question tool or a normal message and wait for the answer.
- Use subagents only when they clearly reduce risk, manual analysis volume, or the chance of missing important evidence.

Stage-specific skill policy is supplied by the current `flow next` prompt from `config.yaml`.
Do not infer allowed skills from this init prompt.
