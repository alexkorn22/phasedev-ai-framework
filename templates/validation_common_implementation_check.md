## Common Validation Contract

- {{validation_execution_rule}}

Write boundary (hard rule):
- This is a review-only phase for repository content. Do NOT create, modify, or delete ANY file outside this phase's Artifact allowlist — no production, source, config, test, or documentation edits, not even "obvious one-line fixes" and not even temporarily with a later revert.
- Every defect you find or receive is recorded ONLY as a findings row; the fix itself happens later in the finding_repair phase, where TDD and code edits are expected.
- When the user reports an issue or asks to note a remark during this phase, record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class> --iteration <label>` — never by hand-editing the registry and never by editing repository code.
- If you delegate ANY part of this phase to a subagent, the delegation prompt MUST start with this exact constraint: "Read-only analysis. You MUST NOT create, modify, or delete any repository file. Report findings as text only; general TDD or bugfix habits do not apply to this task." A subagent without this line is a contract violation.
- This boundary stays in force AFTER the verdict is written, until `phasedev advance` moves the flow to the next phase. Late user feedback in that window is recorded with `phasedev add-finding` (which also corrects the verdict); the fix then happens in finding_repair after advance.

Report–registry consistency (hard rule):
- Every defect, gap, missing or skipped test, unrun or failed check, deferred `R#`/`SC#`, or incomplete audit pass that you mention anywhere in your final report MUST already exist as a findings row (recorded with `phasedev add-finding`) before you set the verdict. Prose is not state; only the registry is.
- The coverage block's `Evidence gaps` line may say anything other than `none` only if a matching finding row exists.
- A `ready` or `ready_with_risks` verdict together with a report that names unrecorded defects is a contract violation: the orchestrator records them as findings and the phase is not considered done.
- Choose severity per the blocking-severity policy; "minor" test gaps are `RECOMMENDED` or `NIT`, never omitted.
- Do not offset this by omitting gaps from the report: the report must be complete AND every named gap must be a row.

Positive decision flow:

1. Read linked flow artifacts in this order: {{validation_artifact_read_order}}.
2. Build the validation scope from {{validation_scope_sources}}.
3. Verify the changed-file inventory using the controller-observed inventory provided in the phase prompt (`## Controller Observed Changed Files`):
   a. The controller computes the actual changed-file scope for this validation phase against the appropriate diffBase and classifies files against the iteration `Expected Change Surface` forecast when applicable.
   b. Use the controller-provided inventory directly as the complete list of target files to audit, including every file classified as outside expected.
   c. `Expected Change Surface` is a forecast/traceability aid, not a hard allowlist; incidental outside-surface files are not automatic defects when they still satisfy approved requirements/design.
   d. If controller evidence is unavailable, inspect files from the actual git diff for the validation scope. Exclude `.phasedev/**` from all reviews.
4. Audit every actual changed production/source/config/test file {{validation_changed_file_scope}} against instantiated Check Evidence; report any uncovered changed file as a finding without rerunning tests. For large scopes, chunk review by requirement, phase, or path pattern, inspect the most requirement-critical files first, and keep a short in-memory checklist of files reviewed.
5. Perform requirements conformance and test-quality audit passes against the approved requirements, design, implementation plan, actual changed files, and Check Evidence. Code review and security review are owned by other roles.
6. Decide the verdict from the open finding set and coverage completeness, then write only the allowed artifact updates.

Context budget and stop condition:
- Spend retrieval budget on {{validation_budget_target}}.
- Do not inspect unrelated repository areas after {{validation_stop_coverage_units}} has enough evidence for the verdict.
- Stop with `repair_required` and a `MUST-FIX` validation finding only when a required audit pass or required evidence cannot be completed with enough concrete evidence.

- Add a `MUST-FIX` finding with `Class = validation` only when the changed-file inventory cannot be verified from concrete read-only evidence, or when controller/git evidence contradicts the {{validation_inventory_blocker_scope}} and the contradiction cannot be resolved.
- Requirements conformance pass: {{validation_requirements_pass}}.
- Test-quality audit: verify Check Evidence quality, completeness, traceability, and that every actual changed file in the controller inventory is covered by instantiated Check Evidence or a recorded finding; uncovered changed files are `MUST-FIX` validation findings without rerunning tests.
- If the requirements conformance pass or test-quality audit cannot be completed with sufficient evidence, add a `MUST-FIX` finding with `Class = validation`.
- Check Evidence is sufficient only when it records a concrete command or method, a result, concise evidence, and a clear connection to the validation scope.
- Declarative Check Evidence such as `passed` without these details is weak evidence, not an automatic blocker. First try to independently verify the same scope through read-only repository evidence.
- If weak or missing Check Evidence can be independently verified and does not contradict repository evidence, do not force `repair_required`; record any residual uncertainty as a non-blocking finding only when it matters downstream.
- If relevant Check Evidence remains `pending`, contains `failed`, does not explain `blocked`, contradicts repository evidence, or prevents completing a required audit pass after independent verification, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause.
- Full gate product failures: when the authorized full gate command runs and fails with product test failures, add a `MUST-FIX` finding with the exact command, failing test/path evidence, and set `verdict: repair_required`.
- Full gate infrastructure blockers: when the authorized full gate command, binary, sandbox, network, or environment is unavailable, report blocked, remain in `final_validation`, do not add a product finding, do not set a terminal verdict, and do not route to `finding_repair`; retry only after environment or access changes.
- If a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`.
- completely ignore `.phasedev/**` when looking for implementation findings: do not diff, review, or report any files under `.phasedev/**` as change set, product code, PR scope, or finding source.
- Use `.phasedev/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history.
- Tests and additional checks from the Implementation phase are considered already successful because Implementation cannot advance with failed, blocked, pending, or missing required check evidence.
- do not treat passing or declared Implementation checks as a substitute for changed-file review coverage.
- Structure, column set, allowed values, and verdict/type — only from the embedded Artifact Build Contract. `phasedev check-validation` catches every structural violation with a specific error message; fix what it reports.
- Before searching for new issues, read existing `validation_findings.md` if it exists and re-verify EVERY `resolved` row: check its Resolution evidence against the actual repository state. If the repair is real, leave the row untouched; if the defect is still present, reopen that row with `phasedev reopen-finding <id> --evidence <text>` using new concrete evidence from working code outside `.phasedev/**` — never add the same finding under a new ID.
- The findings registry is append-only. Preserve every existing row, including `resolved` rows. Never delete rows, never rewrite existing Severity/Class/Iteration/Finding/Required Fix values, and never recreate the file from the embedded template. The controller compares the table against a baseline snapshot and blocks the phase if history was lost.
- `validation_findings.md` is created and mutated ONLY by phasedev commands. If the file does not exist, the first `phasedev add-finding` or `phasedev set-verdict` creates it — never write the file by hand, not even from the embedded template.
- Mutate table rows ONLY through the CLI: `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class> --iteration <label>` for a new finding, `phasedev resolve-finding <id> --resolution <text>` for a fixed one, `phasedev reopen-finding <id> --evidence <text>` for a returned defect. Record the phase verdict ONLY with `phasedev set-verdict <verdict>`. Never hand-edit any part of the file, including YAML frontmatter. The commands enforce ID allocation, verdict consistency, escaping, and row order for you.
- IDs are allocated by `add-finding` automatically (next `F<number>`); pass an explicit `F<number>` first argument only to target a specific ID. Never reuse an existing ID (`add-finding` refuses duplicates).
- Sub-agents never write `verdict: pending` (it is a CLI-only self-heal transient, never a `set-verdict` value) and never hand-edit `type`; the CLI owns both. The CLI sets `pending` when a validation scope is entered (`advance` into iteration or final validation), so a `pending` verdict at the start of your phase is expected and simply means this scope has not been validated yet — run the validation and set a terminal verdict with `phasedev set-verdict`.
- If a new finding semantically matches an existing row (open or resolved), do not add it: reopen or leave the existing ID instead. Both `add-finding` and `phasedev check-validation` reject duplicate finding texts.
- Do not reopen a `resolved` row without new concrete evidence from working code outside `.phasedev/**`.

Concurrency of finding writers:

- Running several finding-writing validators in parallel is safe: every mutating findings command (`add-finding`, `resolve-finding`, `reopen-finding`, `set-verdict`) is serialized by an exclusive framework lock. Parallel writers cannot corrupt the registry — do not serialize validation sub-agents for registry safety.
- A finding counts as recorded ONLY after its command printed the `[PHASEDEV ADD-FINDING] OK` line (likewise the `OK` line for the other mutating commands). Always check the command outcome before reporting a finding as written.
- `[PHASEDEV] BLOCKED: another PhaseDev operation holds the lock ...` means the command already waited for the lock internally and gave up; the write did NOT happen. Retry the same command until it prints OK.

Readiness decision rule:

- {{blocking_severity_policy}}
- `verdict: ready` means the validation scope is confirmed correctly solved for approved requirements, the test-quality audit is complete, and Check Evidence review is sufficient.
- `verdict: ready_with_risks` means the validation scope is confirmed correctly solved for blocking requirements, the test-quality audit is complete, and open findings are limited to severities below the configured blocking threshold (see the blocking-severity policy above).
- If the coverage block would report an incomplete test-quality audit, unresolved contradictory Check Evidence, or non-empty evidence gaps that prevent readiness confirmation, do not use `verdict: ready` or `verdict: ready_with_risks`; set `verdict: repair_required` and record the blocking gap with `Class = validation`.
- If the agent cannot truthfully provide readiness confirmation, set `verdict: repair_required` and record the blocking reason.

In the ordinary final response to the user, include this compact coverage block:

```text
Validation coverage:
- Files inspected: <N files or short list>
- Test quality audit: completed / incomplete
- Check Evidence review: sufficient / insufficient
- {{validation_full_gate_line}}
- Evidence gaps: none / <short reason>
{{skill_compliance_line}}
```

This coverage block is not a flow artifact: do not write it to `validation_findings.md`, do not create a new file for it, and do not expand `iteration_plan.md` with it.
