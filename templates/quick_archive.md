{{phase_opening_summary}}# Quick Phase: Archive

{{skill_policy}}

This quick change is being archived (not deleted). Write a delta spec ONLY if the spec-revision verdict was #3; otherwise write no spec. Then mark the archive completed.

Archived change: {{change_name}}
Archive path: {{archive_path}}
Worklog: {{worklog_path}}
Project specs: {{main_specs_path}}
Change specs (delta spec target when verdict #3): {{change_specs_path}}
Archive state file: {{archive_state_path}}

## Procedure

1. If the spec-revision verdict was #3: write a delta spec under `{{change_specs_path}}` following the delta-spec format (`specs/<capability>/spec.md` with ADDED/MODIFIED/REMOVED/RENAMED Requirements sections). Otherwise write nothing here.
2. Set `.phase-archive.json` status to `completed` at {{archive_state_path}}.

## Self-check

```bash
phasedev check-archive --archive-path {{archive_path}}
```

## Completion

Stop after `.phase-archive.json` status is `completed`.

Final report skill-compliance:
{{skill_compliance_line}}
