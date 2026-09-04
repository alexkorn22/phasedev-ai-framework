---
verdict: <set_after_review>
type: {{artifact_type}}
date: {{date}}
---

<!--
This file is created and mutated ONLY by phasedev commands (add-finding, resolve-finding, reopen-finding, set-verdict). Never hand-edit it.
Frontmatter contract:
- verdict must be exactly one of: {{allowed_verdicts}}. It is recorded only with `phasedev set-verdict`.
- type must be exactly one of: iteration, final.
- repair_required: use when at least one open/reopened finding is at or above the blocking threshold.
{{repaired_verdict_note}}
{{blocking_severity_policy}}
-->

| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |
|---|---|---|---|---|---|---|---|
