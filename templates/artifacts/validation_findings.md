---
verdict: <set_after_review>
type: {{artifact_type}}
date: {{date}}
---

<!--
Authoring instructions for validation and repair agents:
- This file is created and mutated ONLY by phasedev commands: `phasedev add-finding` (new row; creates the file when missing), `phasedev resolve-finding <id> --resolution <text>` (fixed), `phasedev reopen-finding <id> --evidence <text>` (defect returned), `phasedev set-verdict <verdict>` (phase verdict; creates the file when missing).
- Never write, recreate, reorder, or hand-edit ANY part of this file, including YAML frontmatter. This template only documents the structure the CLI maintains; never instantiate it yourself.
- Do not create or update a project-root validation_findings.md file.
- The final artifact must contain only YAML frontmatter and exactly one markdown table.
- The registry is append-only: never delete a row, never rewrite Severity/Class/Iteration/Finding/Required Fix of an existing row; only Status and Resolution change over a finding's life. The controller diffs the table against a baseline snapshot and blocks the phase if history was lost.
- Before adding a finding, compare it by meaning with EVERY existing row, including resolved rows. On a match, update or reopen that row's ID; never add a duplicate.

Frontmatter contract:
- verdict must be exactly one of: {{allowed_verdicts}}. It is recorded only with `phasedev set-verdict`.
- type must be exactly one of: iteration, final.
- date must be an ISO date; `phasedev set-verdict` maintains it.
- `pending` is a CLI-only transient verdict written during self-heal (never via `set-verdict`), and the CLI keeps `type` in sync with the locked validation phase; agents never hand-edit either.

Verdict contract:
- ready: use only when there are no open or reopened findings.
- ready_with_risks: use only when every open/reopened finding is below the blocking threshold (see blocking policy below).
- repair_required: use when at least one open/reopened finding is at or above the blocking threshold.
{{repaired_verdict_note}}
{{blocking_severity_policy}}
Table value contract:
- ID: stable finding ID such as F1, F2, F3; allocated automatically by `phasedev add-finding`.
- Status: exactly one of open, reopened, resolved.
- Severity: exactly one of MUST-FIX, RECOMMENDED, NIT.
- Class: exactly one of implementation, test, plan, design, requirements, validation, security, code_review.
- Security rows must always use Severity: MUST-FIX, including resolved rows.
- Iteration: current iteration label, Final, or another concrete validation scope.
- Finding: concrete self-contained finding with enough evidence to understand the issue.
- Required Fix: concrete action required to resolve or mitigate the finding.
- Resolution: repair evidence — what was changed (files/artifacts) and how it was verified (command -> result). Written by `phasedev resolve-finding`; required and non-placeholder when Status is resolved; empty while Status is open; `phasedev reopen-finding` keeps prior content and appends `reopened: <new evidence>`.
-->

| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |
|---|---|---|---|---|---|---|---|
