{{phase_opening_summary}}# Quick Phase: Implementation

{{skill_policy}}

Implement the plan recorded in `worklog.md` and prove it works with a real run / tests. Commit the change.

Inputs:
- Worklog (task, spec, plan): {{worklog_path}}
- Project root: {{project_path}}

{{path_resolution_rule}}

## Procedure

1. Review project memory: observe project taboos in `PROJECT KNOWLEDGE & ANTI-PATTERNS` below; avoid repeating known mistakes.
2. Implement exactly the plan in `worklog.md`. Respect `protectedPaths` if configured (requires `[allows-protected-paths]` in `worklog.md` if intentional).
3. Prove it: run the relevant tests / the real command; record the command (`exit code 0`) and result in `worklog.md` under `## Verification`.
4. Commit the work (a new commit is required to advance).

## Self-check

```bash
{{self_check_command}}
```

{{self_check_fallback}}

## Completion

Stop after the change is implemented, proven, and committed.

Final report skill-compliance:
{{skill_compliance_line}}
