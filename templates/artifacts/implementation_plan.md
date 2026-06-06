---
approved: false
approved_by: ""
date: {{date}}
---

<!--
Authoring instructions for the planning agent:
- Instantiate this template into the change directory as implementation_plan.md.
- Remove every HTML comment from the final implementation_plan.md.
- Replace the title with the concrete change name.
- Do not leave blank table cells, blank phase names, blank task descriptions, copied field descriptions, or placeholder-like prose in the final artifact.
- Keep YAML frontmatter first.

Phase status contract:
- Keep phase headings machine-readable: ## Phase N: Name [status]
- Phase numbers must be sequential starting at 1.
- Use [ ] for not started.
- Use [~] for implementation done or in progress but validation not passed.
- Use [x] only after validation passed.
- Do not use other phase status values.

Task contract:
- Every executable checkbox item must be atomic and numbered.
- Task IDs are phase-scoped: 1.1, 1.2, 2.1.
- Subtasks are allowed only when they clarify execution and must be numbered: 1.1.1, 1.1.2.
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
- Docs/specs: yes when documentation or OpenSpec-visible behavior changes are planned.
- Migrations: yes when persistence/schema/data migration work is planned.
- Feature flags/rollout: yes when rollout gating, progressive delivery, or release controls are planned.
- Observability: yes when logging, metrics, tracing, alerts, or operational signal changes are planned.
- Rollback path: yes when the change needs an explicit rollback path.
- The Plan column must explain the selected value with concrete change-specific content.
- Generation Bundle must align with PRD Generation target, Resolution signal, Risk envelope, Accepted Assumptions, Deferred Decisions, and Success Criteria.

Phase Overview contract:
- Add one row per phase.
- Main work items should reference task IDs from the phase.
- Required checks should list commands or named checks for the phase.

Phase section contract:
- Add one machine-readable phase heading per phase.
- Each phase must include Goal, Tasks, Checks, and Check Evidence.
- Goal states the observable outcome of the phase.
- Tasks contains only executable numbered task checkboxes for that phase.
- Checks contains the unit gate and any additional phase-specific checks.
- Additional checks may be omitted when none exist.
- Phase goals, tasks, checks, and evidence rows must trace back to approved PRD requirements, success criteria, risk envelope, accepted assumptions, deferred decisions, and approved design.

Check Evidence contract:
- Keep Check Evidence as a plain markdown table. Do not use task checkboxes inside evidence rows.
- Result values must be exactly one of: pending, passed, failed, blocked, not_applicable.
- Planning stage initializes relevant checks as pending and irrelevant checks as not_applicable.
- Implementation stage updates pending rows after executing checks.
- Command Or Method must match the check command or named review/manual method from Checks.
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

## Phase Overview

| Phase | Goal | Main work items | Required checks |
|---|---|---|---|

## Phase 1:  [ ]

### Goal

### Tasks

### Checks

- unit: ``

Additional checks:

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
