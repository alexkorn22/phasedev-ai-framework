{{phase_opening_summary}}# Quick Phase: Spec Revision

{{skill_policy}}

A fresh-context subagent (the implementer and validator are biased — they "know" the task was small) inspects the final diff and issues exactly one verdict. The verdict is NOT persisted; it lives in the orchestrator session.

Inputs:
- Worklog: {{worklog_path}}
- Project specs: {{main_specs_path}}
- Project root: {{project_path}}

{{path_resolution_rule}}

## Verdicts

1. Nothing needed (expected default) — the only trace is the git commit.
2. Fix an existing spec in place.
3. Create a delta spec — the change turned out to alter/add behaviour that lives in `specs/` by this project's standards. Decided from the diff, not in advance.

The decision is made from the final diff. Verdict 3 materialises as a delta spec during the next (archive) phase.

## Completion

Stop after the verdict is decided. Then run `phasedev advance` to enter the archive phase.

Final report skill-compliance:
{{skill_compliance_line}}
