{{phase_opening_summary}}# Quick Phase: Plan

{{skill_policy}}

Quick mode collapses research and planning into one phase. Produce the plan directly in `worklog.md` (do not create prd/design/research artifacts).

Inputs:
- Worklog: {{worklog_path}}
- Project root: {{project_path}}

{{path_resolution_rule}}

## Procedure

1. Research just enough of the codebase to plan the change.
2. Fill the three sections of `worklog.md`: `## Task`, `## Short Specification`, `## Plan`. The orchestrator never writes this file itself — the subagent fills it.
3. Return the plan to the orchestrator for the single user plan-confirmation stop.

## Self-check

```bash
{{self_check_command}}
```

{{self_check_fallback}}

## Completion

Stop after `worklog.md` is filled and the user has confirmed the plan.

Final report skill-compliance:
{{skill_compliance_line}}
