---
approved: false
approved_by: ""
date: {{date}}
---

<!--
Authoring instructions for the planning agent:
- Fill this template for iteration_plan.md.
- Remove every HTML comment from the final iteration_plan.md.
- Replace the title with the concrete change name.
- Do not leave blank table cells, blank phase names, blank task descriptions, copied field descriptions, or placeholder-like prose in the final artifact.
- Keep YAML frontmatter first.

Phase status contract:
- Keep iteration headings machine-readable: ## Iteration N: Name [status]
- Iteration numbers must be sequential starting at 1.
- Use [ ] for not started.
- Use [~] for implementation done or in progress but validation not passed.
- Use [x] only after validation passed.
- Do not use other iteration status values.

Task contract:
- Every executable checkbox item must be atomic and numbered.
- Use exactly this checkbox syntax for top-level tasks: `- [ ] <phase>.<task> Task description`.
- Use exactly this checkbox syntax for subtasks: `  - [ ] <phase>.<task>.<subtask> Subtask description`.
- Task IDs are phase-scoped dot-separated numbers and must start with the phase number.
- Subtasks are allowed only when they clarify execution and must be numbered with one additional dot segment.
- Do not add task checkboxes outside phase task sections.
- Do not add a generic Definition of Done section. Phase completion is all task/subtask checkboxes [x] plus required checks passed.

Approval Summary row contract:
- Approval scope: what the user approves in this implementation plan.
- Out of scope: work intentionally excluded from this plan.
- Sequencing risk: material ordering risk, or none.
- Validation: default gates and notable additional checks.

Generation Bundle contract:
- Required values must be exactly one of: yes, no, not_applicable.
- Production code: yes when source/config/runtime code changes are planned.
- Tests: yes when tests are added or updated; no only when explicitly out of scope.
- Docs/specs: yes when documentation or long-lived spec-visible behavior changes are planned.
- Migrations: yes when persistence/schema/data migration work is planned.
- Feature flags/rollout: yes when rollout gating, progressive delivery, or release controls are planned.
- Observability: yes when logging, metrics, tracing, alerts, or operational signal changes are planned.
- Rollback path: yes when the change needs an explicit rollback path.
- The Plan column must explain the selected value with concrete change-specific content.
- Generation Bundle must align with PRD Target state, Risk boundaries, R# Requirements, SC# Success Criteria, and SC# Evidence types.

Phase Overview contract:
- Add one row per phase.
- Main work items should reference task IDs from the phase.
- Required checks should list commands or named checks for the phase.

Phase section contract:
- Add one machine-readable phase heading per phase.
- Each phase must include Goal, Expected Change Surface, Tasks, Checks, and Check Evidence.
- Goal states the observable outcome of the phase.
- Expected Change Surface describes the allowed implementation area for the phase. Keep it as a markdown table with at most 7-10 rows.
- Use exact files only for critical entrypoints/contracts, migrations, config, generated artifacts, or known risky files.
- For broad implementation areas, use path patterns, globs, or subsystem ownership rows instead of enumerating every file.
- Large phases must group by subsystem/glob, not enumerate every file.
- Expected Change Surface rows must use columns exactly: Area / Path Pattern, Change Type, Ownership, Trace.
- Trace must reference concrete R#, SC#, and relevant D# IDs.
- Tasks contains only executable numbered task checkboxes for that phase.
- Checks contains the unit gate and any additional phase-specific checks.
- Additional checks may be omitted when none exist.
- Phase goals, expected change surface, tasks, checks, and evidence rows must trace back to concrete approved PRD R# requirements, SC# success criteria, SC# Evidence types, risk boundaries, and approved design D# decisions.
- Do not use vague trace labels such as "all requirements"; reference concrete R#, SC#, and relevant D# IDs.

Check Evidence contract:
- Keep Check Evidence as a plain markdown table. Do not use task checkboxes inside evidence rows.
- Result values must be exactly one of: pending, passed, failed, blocked, not_applicable.
- Planning stage initializes relevant checks as pending and irrelevant checks as not_applicable.
- Implementation stage updates pending rows after executing checks.
- Command Or Method must match the check command or named review/manual method from Checks.
- Rows with Result `passed`, `failed`, or `blocked` must have non-empty concrete Evidence.
-->

# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope |  |
| Out of scope |  |
| Sequencing risk |  |
| Validation |  |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code |  |  |
| Tests |  |  |
| Docs/specs |  |  |
| Migrations |  |  |
| Feature flags/rollout |  |  |
| Observability |  |  |
| Rollback path |  |  |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|

## Iteration 1:  [ ]

### Goal

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
|  |  |  |  |

### Tasks

### Checks

- unit: ``

Additional checks:

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
