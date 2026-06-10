---
verdict: ready
type: phase
date: {{date}}
---

<!--
Authoring instructions for validation and repair agents:
- Instantiate this template into the change directory as validation_findings.md when the file does not exist.
- Remove every HTML comment from the final validation_findings.md.
- The final artifact must contain only YAML frontmatter and exactly one markdown table.
- Do not add prose, headings, visual markers, evidence blocks, or extra tables.
- If a table cell needs a literal pipe, escape it as \|.
- Add new findings as new rows at the top of the table body.
- Do not delete existing finding rows.
- If a new finding semantically matches an existing row, update that row instead of creating a duplicate.

Frontmatter contract:
- verdict must be exactly one of: ready, ready_with_risks, repair_required, repaired.
- type must be exactly one of: phase, final.
- date must be an ISO date.

Verdict contract:
- ready: use only when there are no open or reopened findings.
- ready_with_risks: use only when open/reopened findings are limited to RECOMMENDED or NIT.
- repair_required: use when at least one open/reopened MUST-FIX finding exists.
- repaired: use only in Repair Loop after actual blocking findings are resolved; do not use ready or ready_with_risks from Repair Loop.

Table value contract:
- ID: stable finding ID such as F1, F2, F3.
- Status: exactly one of open, reopened, resolved.
- Severity: exactly one of MUST-FIX, RECOMMENDED, NIT.
- Class: exactly one of implementation, test, plan, design, requirements, validation, security, code_review.
- Phase: current phase label, Final, or another concrete validation scope.
- Finding: concrete self-contained finding with enough evidence to understand the issue.
- Required Fix: concrete action required to resolve or mitigate the finding.
-->

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
