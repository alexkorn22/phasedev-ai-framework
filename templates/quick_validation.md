{{phase_opening_summary}}# Quick Phase: Validation

{{skill_policy}}

Validation is mandatory but session-managed: the orchestrator reads the validation subagent's verdict and, if fixes are needed, hands the response to a fix subagent. Nothing is persisted — there is no `validation_findings.md` in Quick.

Inputs:
- Worklog: {{worklog_path}}
- Project root: {{project_path}}

{{path_resolution_rule}}

## Procedure

1. A validation subagent reviews the committed change against the plan/spec in `worklog.md` and returns a verdict with concrete evidence.
2. Test Harness Protection: Ensure fix iterations did not weaken assertions or delete test lines.
3. Verification Evidence: Ensure the real check command (`exit code 0`) and result output are recorded in `worklog.md` under `## Verification`. Subjective claims («проверил, всё работает») are rejected.
4. When the verdict is clean and `worklog.md` contains verified evidence, advance. Do not write any findings artifact.

## Completion

Stop when validation is clean in-session.

Final report skill-compliance:
{{skill_compliance_line}}
