## Common Validation Contract

- {{validation_execution_rule}}

Write boundary (hard rule):
- This is a review-only phase for repository content. Do NOT create, modify, or delete ANY file outside this phase's Artifact allowlist.
- Every defect you find is recorded ONLY as a findings row through `phasedev add-finding`.
- This role does not record verdicts, run project check commands, or update iteration status.

Positive decision flow:

1. Read linked flow artifacts in this order: {{validation_artifact_read_order}}.
2. Build the validation scope from {{validation_scope_sources}}.
3. Verify the changed-file inventory using the controller-observed inventory provided in the phase prompt (`## Controller Observed Changed Files`).
4. Inspect every changed production/source/config/test file {{validation_changed_file_scope}} for the review pass owned by this role.

Context budget and stop condition:
- Spend retrieval budget on {{validation_budget_target}}.
- Do not inspect unrelated repository areas after {{validation_stop_coverage_units}} has enough evidence for this review pass.
- completely ignore `.phasedev/**` when looking for implementation findings.

Concurrency of finding writers:
- Running several finding-writing validators in parallel is safe; every mutating findings command is serialized by an exclusive framework lock.
- A finding counts as recorded ONLY after its command printed the `[PHASEDEV ADD-FINDING] OK` line.

In the ordinary final response to the user, include this compact coverage block:

```text
Validation coverage:
- Files inspected: <N files or short list>
- Review pass: completed / incomplete
- Evidence gaps: none / <short reason>
{{skill_compliance_line}}
```

This coverage block is not a flow artifact.
