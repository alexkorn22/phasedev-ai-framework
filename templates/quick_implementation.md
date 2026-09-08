{{phase_opening_summary}}# Quick Phase: Implementation

{{skill_policy}}

Implement the plan recorded in `worklog.md` and prove it works with a real run / tests. Report completion to the orchestrator.

Inputs:
- Worklog (task, spec, plan): {{worklog_path}}
- Project root: {{project_path}}

{{path_resolution_rule}}

## Procedure

1. Review project memory: observe project taboos in `PROJECT KNOWLEDGE & ANTI-PATTERNS` below; avoid repeating known mistakes.
2. Implement exactly the plan in `worklog.md`. Respect `protectedPaths` if configured (requires `[allows-protected-paths]` in `worklog.md` if intentional).
3. Prove it: run the relevant tests / the real command; record the command (`exit code 0`) and result in `worklog.md` under `## Verification`.
4. Verify implementation via tests and report completion to the orchestrator (orchestrator commits the iteration before advance). Do NOT git commit, do NOT phasedev advance.

## Self-check

```bash
{{self_check_command}}
```

{{self_check_fallback}}

## Completion

Stop after the change is implemented and verified via tests.

Final report skill-compliance:
{{skill_compliance_line}}
