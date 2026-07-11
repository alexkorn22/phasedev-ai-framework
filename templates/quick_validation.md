{{phase_opening_summary}}# Quick Phase: Validation

{{skill_policy}}

Validation is mandatory but session-managed: the orchestrator reads the validation subagent's verdict and, if fixes are needed, hands the response to a fix subagent. Nothing is persisted — there is no `validation_findings.md` in Quick.

Inputs:
- Worklog: {{worklog_path}}
- Project root: {{project_path}}

{{path_resolution_rule}}

## Procedure

1. A validation subagent reviews the committed change against the plan/spec in `worklog.md` and returns a verdict with concrete evidence.
2. If the verdict requires fixes, the orchestrator loops the response to a fix subagent in-session, then re-validates.
3. When the verdict is clean, advance. Do not write any findings artifact.

## Completion

Stop when validation is clean in-session.

Final report skill-compliance:
{{skill_compliance_line}}
