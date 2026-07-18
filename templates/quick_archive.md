{{phase_opening_summary}}# Quick Phase: Archive

{{skill_policy}}

This quick change is being archived (not deleted). If the spec-revision verdict was #3, delegate all specification work to one `spec_sync` sub-agent; otherwise write no spec. Then mark the archive completed.

Archived change: {{change_name}}
Archive path: {{archive_path}}
Worklog: {{worklog_path}}
Project specs: {{main_specs_path}}
Change specs (delta spec target when verdict #3): {{change_specs_path}}
Archive state file: {{archive_state_path}}

## Procedure

1. If the spec-revision verdict was #3: spawn exactly one `spec_sync` sub-agent — do not edit specs yourself. Its delegation prompt must instruct it to:
   - classify the implemented behavior from `worklog.md` (`## Short Specification` plus the implemented plan) — quick changes have no PRD and no `R#` requirements;
   - write a delta spec under `{{change_specs_path}}` following the delta-spec format (`specs/<capability>/spec.md` with ADDED/MODIFIED/REMOVED/RENAMED Requirements sections, normative SHALL/MUST requirement text, `### Requirement: ` and `#### Scenario: ` headings);
   - merge the delta into the project specs at {{main_specs_path}} — never copy: preserve requirements the change does not modify, remove requirements describing a cancelled model, keep delta section headings out of live specs, and normalize every touched live spec so its first `##` heading is `## Purpose`;
   - run the ripple search: read `commitLog` from `state.json` inside `{{archive_path}}` and diff `commitLog.start..HEAD` (fall back to the change branch's diff when `commitLog` is absent, stating the source used); extract added/removed/renamed names (files, exported symbols, routes, CSS variables, database fields, environment variables, user-facing string literals); grep each across the project specs and flag statements the change made false; flag added persistent entities mentioned in no spec (`requirement not written`); check quoted user-facing literals against the code constants;
   - never edit a spec when a divergence is ambiguous (the code may be defective, or the intent is unclear) — report it as an escalation: spec file, quoted statement, what the code actually does, why the truth direction is unclear. An empty escalation list must be stated explicitly.
2. If the sub-agent report contains escalations: stop, present them to the user as questions, and do not set the archive completed until all are resolved (re-dispatch `spec_sync` with the decisions to apply).
3. Set `.phase-archive.json` status to `completed` at {{archive_state_path}}.

## Self-check

```bash
phasedev check-archive --archive-path {{archive_path}}
```

## Completion

Stop after `.phase-archive.json` status is `completed`.

Final report skill-compliance:
{{skill_compliance_line}}
