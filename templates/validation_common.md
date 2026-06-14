## Common Validation Contract

- Validation mode is review-only: do not rerun tests, builds, browsers, migrations, deployments, or other execution gates.
- Use the controller-observed changed-file inventory as prompt context, then verify completeness from read-only repository evidence before deciding the verdict.
- If the changed-file inventory is incomplete or cannot be verified, add a `MUST-FIX` finding with `Class = validation`.
- Perform a requirements conformance pass against the approved requirements, design, implementation plan, and actual changed files.
- Perform a full code review pass for every changed production/source/config/test file outside `.phasedev/**` using the configured skill policy, including correctness, edge cases, error/empty states, UI layout/responsive overflow and interaction states, data mapping/normalization behavior, architecture/layer boundaries, public API/export surface, maintainability, and test gaps for changed behavior.
- Perform a full security review pass for every changed file outside `.phasedev/**` using the configured skill policy, including user/input handling, output encoding/XSS, injection risks, authorization/data isolation where applicable, secret or environment exposure, unsafe network/file/process access, dangerous APIs, and dependency/config exposure.
- If the requirements conformance pass, code review pass, or security review pass cannot be completed with sufficient evidence, add a `MUST-FIX` finding with `Class = validation`.
- Check Evidence is sufficient only when it records a concrete command or method, a result, concise evidence, and a clear connection to the validation scope.
- Declarative Check Evidence such as `passed` without these details is insufficient; add a `MUST-FIX` finding with `Class = validation`.
- If relevant Check Evidence is missing, remains `pending`, contains `failed`, or does not explain `blocked`, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause.
- Findings from the code review pass must be recorded in `validation_findings.md` with `Class = code_review` unless a more precise existing class is required by the finding.
- Findings from the security review pass must be recorded in `validation_findings.md` with `Class = security` unless a more precise existing class is required by the finding.
- If a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`.
- completely ignore `.phasedev/**` when looking for implementation findings: do not diff, review, or report any files under `.phasedev/**` as change set, product code, PR scope, or finding source.
- Use `.phasedev/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history.
- Tests and additional checks from the Implementation stage are considered already successful because Implementation cannot finish with failed tests/checks.
- do not treat passing or declared Implementation checks as a substitute for changed-file review coverage.
- `validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table.
- Use the Artifact Build Contract as the only source of structure for `validation_findings.md`.
- Before searching for new issues, read existing `validation_findings.md` if it exists.
- the final file must strictly follow the artifact template and strict registry rules from the template comments.
- do not add prose, headings, evidence blocks, summaries, visual markers, or extra tables to `validation_findings.md`.
- do not delete finding rows.
- add a new finding as a new row at the top of the table.
- update the existing row with the same `ID` and do not create a duplicate.
- do not change a `resolved` row to `reopened` without new concrete evidence from working code outside `.phasedev/**`.
- If no findings are open, save the empty table header and separator from the artifact template.

Readiness decision rule:

- `verdict: ready` means the validation scope is confirmed correctly solved for approved requirements, full code review found no open findings, full security review found no open findings, and review coverage was complete.
- `verdict: ready_with_risks` means the validation scope is confirmed correctly solved for blocking requirements, full code and security review coverage was complete, and open findings are limited to non-blocking `RECOMMENDED` or `NIT` rows.
- If the coverage block would report an incomplete code review pass, incomplete security review pass, insufficient Check Evidence review, or non-empty evidence gaps, do not use `verdict: ready` or `verdict: ready_with_risks`; set `verdict: repair_required` and record the blocking gap with `Class = validation`.
- If the agent cannot truthfully provide readiness confirmation, set `verdict: repair_required` and record the blocking reason.

In the ordinary final response to the user, include this compact coverage block:

```text
Validation coverage:
- Files inspected: <N files or short list>
- Code review pass: completed / incomplete
- Security review pass: completed / incomplete
- Check Evidence review: sufficient / insufficient
- Evidence gaps: none / <short reason>
```

This coverage block is not a flow artifact: do not write it to `validation_findings.md`, do not create a new file for it, and do not expand `implementation_plan.md` with it.
