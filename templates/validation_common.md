## Common Validation Contract

- Validation mode is review-only: do not rerun tests, builds, browsers, migrations, deployments, or other execution gates.
Positive decision flow:

1. Read linked flow artifacts in this order: {{validation_artifact_read_order}}.
2. Build the validation scope from {{validation_scope_sources}}.
3. Verify the changed-file inventory with read-only evidence before deciding the verdict. Use the controller-observed inventory first, then compare it with read-only baseline/current evidence such as `git status --short --untracked-files=all -- .`, `git diff --name-status -- .`, and `git diff --cached --name-status -- .` when available. Run these read-only repository inventory commands from the project root for this prompt context: during real `phasedev next`, the linked active project root; in generated prompt bundles, the same snapshot root shown by the Artifact Build Contract Output path and `phasedev check-validation --project-path`. Exclude `.phasedev/**`. If controller/git inventory is unavailable or empty, ignored or generated expected surfaces can be verified through filesystem reads, generated manifest/output evidence, or other concrete read-only evidence; distinguish unavailable inventory from contradictory inventory.
4. Inspect every changed production/source/config/test file {{validation_changed_file_scope}}; for large scopes, chunk review by requirement, phase, or path pattern, inspect the most requirement-critical and security-sensitive files first, and keep a short in-memory checklist of files reviewed.
5. Perform requirements conformance, code review, and security review passes against the approved requirements, design, implementation plan, actual changed files, and Check Evidence.
6. Decide the verdict from the open finding set and coverage completeness, then write only the allowed artifact updates.

Context budget and stop condition:
- Spend retrieval budget on {{validation_budget_target}}.
- Do not inspect unrelated repository areas after {{validation_stop_coverage_units}} has enough evidence for the verdict.
- Stop with `repair_required` and a `MUST-FIX` validation finding only when a required review pass or required evidence cannot be completed with enough concrete evidence.

- Add a `MUST-FIX` finding with `Class = validation` only when the changed-file inventory cannot be verified from concrete read-only evidence, or when controller/git evidence contradicts the {{validation_inventory_blocker_scope}} and the contradiction cannot be resolved.
- Requirements conformance pass: {{validation_requirements_pass}}.
- Code review pass: review every changed production/source/config/test file outside `.phasedev/**` using the configured skill policy, including, where applicable to changed files, correctness, edge cases, error/empty states, UI layout/responsive overflow and interaction states, data mapping/normalization behavior, architecture/layer boundaries, public API/export surface, maintainability, and test gaps for changed behavior.
- Security review pass: review every changed file outside `.phasedev/**` using the configured skill policy, including, where applicable to changed files, user/input handling, output encoding/XSS, injection risks, authorization/data isolation, secret or environment exposure, unsafe network/file/process access, dangerous APIs, and dependency/config exposure.
- If the requirements conformance pass, code review pass, or security review pass cannot be completed with sufficient evidence, add a `MUST-FIX` finding with `Class = validation`.
- Check Evidence is sufficient only when it records a concrete command or method, a result, concise evidence, and a clear connection to the validation scope.
- Declarative Check Evidence such as `passed` without these details is weak evidence, not an automatic blocker. First try to independently verify the same scope through read-only repository evidence and changed-file review.
- If weak or missing Check Evidence can be independently verified and does not contradict repository evidence, do not force `repair_required`; record any residual uncertainty as a non-blocking finding only when it matters downstream.
- If relevant Check Evidence remains `pending`, contains `failed`, does not explain `blocked`, contradicts repository evidence, or prevents completing a required review pass after independent verification, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause.
- Findings from the code review pass must be recorded in `validation_findings.md` with `Class = code_review` unless a more precise existing class is required by the finding.
- Findings from the security review pass must be recorded in `validation_findings.md` with `Class = security` and `Severity = MUST-FIX`; security findings are always blocking even when later marked `resolved`.
- If a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`.
- completely ignore `.phasedev/**` when looking for implementation findings: do not diff, review, or report any files under `.phasedev/**` as change set, product code, PR scope, or finding source.
- Use `.phasedev/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history.
- Tests and additional checks from the Implementation stage are considered already successful because Implementation cannot advance with failed, blocked, pending, or missing required check evidence.
- do not treat passing or declared Implementation checks as a substitute for changed-file review coverage.
- `validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table.
- Use the Artifact Build Contract as the only source of structure for `validation_findings.md`.
- Before searching for new issues, read existing `validation_findings.md` if it exists.
- the final file must strictly follow the artifact template and strict registry rules from the template comments.
- do not add prose, headings, evidence blocks, summaries, visual markers, or extra tables to `validation_findings.md`.
- Preserve every existing finding row, including `resolved` rows; history is deleted only if there are no existing rows to preserve.
- If the file does not exist, or the existing findings table has no body rows, and no findings are open after review, save only the empty table header and separator from the artifact template.
- Add each new finding as a new row at the top of the table body.
- Allocate new IDs by reading all existing `F<number>` IDs and using the next highest number; never reuse an existing ID.
- If a new finding semantically matches an existing row, update that row with the same `ID` and do not create a duplicate.
- Do not change a `resolved` row to `reopened` without new concrete evidence from working code outside `.phasedev/**`.

Readiness decision rule:

- `verdict: ready` means the validation scope is confirmed correctly solved for approved requirements, full code review found no open findings, full security review found no open findings, and review coverage was complete.
- `verdict: ready_with_risks` means the validation scope is confirmed correctly solved for blocking requirements, full code and security review coverage was complete, and open findings are limited to non-blocking `RECOMMENDED` or `NIT` rows.
- If the coverage block would report an incomplete code review pass, incomplete security review pass, unresolved contradictory Check Evidence, or non-empty evidence gaps that prevent readiness confirmation, do not use `verdict: ready` or `verdict: ready_with_risks`; set `verdict: repair_required` and record the blocking gap with `Class = validation`.
- If the agent cannot truthfully provide readiness confirmation, set `verdict: repair_required` and record the blocking reason.

In the ordinary final response to the user, include this compact coverage block:

```text
Validation coverage:
- Files inspected: <N files or short list>
- Code review pass: completed / incomplete
- Security review pass: completed / incomplete
- Check Evidence review: sufficient / insufficient
- Evidence gaps: none / <short reason>
Skill compliance: use the exact structured ledger from the Skill Execution Contract above; one entry per configured router, configured main, and router-selected skill, plus selected additional skills. For no configured skills, report none configured. May span multiple bullets/lines.
```

This coverage block is not a flow artifact: do not write it to `validation_findings.md`, do not create a new file for it, and do not expand `iteration_plan.md` with it.
