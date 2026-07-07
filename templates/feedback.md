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
   - Update the flow artifacts inside the active change folder (prd.md, execution_contract.md, architecture/design.md, iteration_plan.md).
   - Set `approved: false` on every artifact you changed so the flow re-enters approval.
   - Do NOT write this kind of feedback into validation_findings.md.
3. **Mixed feedback** — do both, within the same write limits.

Write boundary (hard rule):
- Do NOT create, modify, or delete any repository file outside `.phasedev/**`. General TDD or bugfix habits do not apply to this task: fixes happen later in the finding_repair phase.
- Do NOT run `phasedev advance` — the orchestrator continues the loop after you finish.

Completion:
- Run `phasedev check` after recording the feedback.
- Report: recorded finding IDs, changed artifacts and their approval status, and the `phasedev check` result.
