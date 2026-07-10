# PhaseDev User Feedback Contract

The user gave feedback on the current PhaseDev change. The feedback text itself is provided by the orchestrator in your task prompt; this contract defines the procedure.

Flow context:
- Active phase: {{active_phase}}
- Active iteration: {{active_iteration}}
- Findings registry: [validation_findings.md]({{findings_path}})
- Current findings verdict: {{current_verdict}}

Classify each feedback item and act:

1. **Implementation defect** (bug, quality issue, incorrect behaviour of the produced change):
   - Record it ONLY with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>`. The command allocates the ID, creates the file when missing, and corrects the verdict automatically.
   - If the defect matches an existing `resolved` row by meaning, use `phasedev reopen-finding <id> --evidence <text>` instead of adding a duplicate.
   - Never hand-edit validation_findings.md: rows, verdict, and frontmatter are CLI-owned.
2. **Scope / design / plan feedback** (requirements change, different architecture, re-planning):
   - Walk the artifact chain IN THIS ORDER. For each artifact, first check whether the scope change affects it; update ONLY the affected ones:
     1. `prd.md` — apply the scope change.
     2. `execution_contract.md` — update if the contract is affected.
     3. `research_facts.md` — mandatory when prd.md changed: copy the new Intent values verbatim into the PRD Intent Trace and reconcile the Requirements & Success Criteria Trace with the new PRD R#/SC# IDs. Research new requirements honestly; never invent facts.
     4. `architecture/design.md` — update if it no longer covers the changed requirements (its validation depends on prd.md and research_facts.md).
     5. `iteration_plan.md` — update if it no longer reflects the work (including valid Check Evidence values; its validation depends on prd.md and design.md).
   - After each artifact you edit, run `phasedev validate-artifact <file>` and fix the reported issues until it passes.
   - Set `approved: false` on every artifact you changed so the flow re-enters approval.
   - Findings and iteration statuses: resolve findings obsoleted by the scope change with `phasedev resolve-finding <id> --resolution "obsoleted by scope change: <reason>"`; reset the status of completed iterations invalidated by the change with `phasedev set-iteration-status <id> <status>`. Never hand-edit validation_findings.md.
   - Do NOT write this kind of feedback into validation_findings.md.
3. **Mixed feedback** — do both, within the same write limits.

Write boundary (hard rule):
- Do NOT create, modify, or delete any repository file outside `.phasedev/**`. General TDD or bugfix habits do not apply to this task: fixes happen later in the finding_repair phase.
- Do NOT run `phasedev advance` — the orchestrator continues the loop after you finish.

Completion:
- If you set `approved: false` on any artifact, run `phasedev sync-state` FIRST — it non-destructively rolls state.json back to the artifact-derived phase (without it, `phasedev check` reports a state/route conflict).
- Run `phasedev check` after recording the feedback.
- Report: recorded finding IDs, changed artifacts and their approval status, whether sync-state changed the phase, and the `phasedev check` result.
