---
{{approval_frontmatter}}
---

<!--
Iteration status contract:
- Keep iteration headings machine-readable: ## Iteration N: Name [status]
- Status values: [ ] not started, [~] in progress, [x] validation passed.
- Use exactly this checkbox syntax for top-level tasks: `- [ ] <iteration>.<task> Task description`. Task metadata (Files, Interfaces, Test Specification) MUST use plain markdown bullets (- **Files:**), NEVER checkboxes.

Check Evidence contract:
- Keep Check Evidence as a markdown table with Result: pending, passed, failed, blocked, not_applicable.
- Checks and Check Evidence rows must be 100% automated and offline test/build commands.
- Never place manual checks (`manual:*`), live external database commands, or interactive browser tests in an iteration's Checks or Check Evidence.
- Criteria requiring manual, visual, or staging verification belong to Final Validation / release acceptance.
- In `### Checks`, list required gate names only (`- unit`, `- phase`); do not copy concrete commands from `execution_contract.md`.
- In `Check Evidence`, record the exact instantiated command executed for each gate plus selected targets and decisive output.
-->

# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
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

Forecast the likely touched paths/patterns for traceability and review comparison. This is not a hard allowlist; actual diffs may include incidental supporting files when they still satisfy approved requirements/design.

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
|  |  |  |  |

### Tasks

### Checks

- unit

Additional checks:

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
