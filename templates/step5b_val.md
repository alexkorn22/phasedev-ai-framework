Stage 5B. Final Validation.

Stage contract: validate the implemented working code before Archive.

Validation mode: review-only stage. This stage checks completeness/correctness through review methods and is not a test execution gate.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})

Required stage-contract checks:
- all phases in [implementation_plan.md]({{plan_path}}) have status `[x]`; Final Validation does not mark phases as `[x]`;
- change-set inventory gate: before deciding the verdict, identify the complete set of repository files changed outside `openspec/**` from available read-only repository evidence;
- inspect every changed production/source/config/test file outside `openspec/**`, not only the flow artifacts, implementation plan, or `Check Evidence`;
- final requirements conformance pass: verify that the actual changed code implements exactly the initial change requirements from PRD, approved design, and implementation plan artifacts; if behavior is missing, extra, contradictory, or only implied by `Check Evidence`, add a finding;
- final code review pass: perform a full read-only code review of the changed files outside `openspec/**` using the configured skill policy, including correctness, edge cases, error/empty states, UI layout/responsive overflow and interaction states, data mapping/normalization behavior, architecture/layer boundaries, public API/export surface, maintainability, and test gaps for changed behavior;
- final security review pass: perform a read-only security review of the changed files outside `openspec/**` using the configured skill policy, including user/input handling, output encoding/XSS, injection risks, authorization/data isolation where applicable, secret or environment exposure, unsafe network/file/process access, dangerous APIs, and dependency/config exposure;
- if the requirements conformance pass, code review pass, or security review pass cannot be completed with sufficient evidence, add a `MUST-FIX` finding with `Class = validation`;
- if the changed-file inventory is incomplete or any changed file cannot be inspected deeply enough to support the verdict, add a `MUST-FIX` finding with `Class = validation`;
- PRD-first check: the actual change set must satisfy the approved [prd.md]({{prd_path}}), not only the implementation plan;
- `Intent`: `Change type`, `Why`, `Target state`, and `Risk boundaries` align with actual implementation and validation evidence;
- `Requirements`: every `R#` is implemented by the actual change set or has a finding;
- `Success Criteria`: every `SC#` is demonstrably met according to its PRD `Evidence` type or has a finding;
- no behavior outside the positive PRD contract (`Target state`, `R#`, `SC#`, `Risk boundaries`) was implemented without approval;
- `Target state` from `Intent` is covered by approved plan/design and the actual change set;
- `Risk boundaries` from `Intent` are not violated; if risk acceptance is required, the finding must be `RECOMMENDED` or `MUST-FIX` by severity;
- completeness of production/test/source/config changes from the approved plan is checked through review methods without running tests;
- findings from the code review pass must be recorded in [validation_findings.md]({{findings_path}}) with `Class = code_review` unless a more precise existing class is required by the finding;
- findings from the security review pass must be recorded in [validation_findings.md]({{findings_path}}) with `Class = security` unless a more precise existing class is required by the finding;
- `Generation Bundle` in [implementation_plan.md]({{plan_path}}) is checked against the actual change set: declared required areas must be completed or have a finding;
- `Expected Change Surface` in [implementation_plan.md]({{plan_path}}) is delivery scope context for comparing expected and actual changed areas; it is not a new requirements source and does not replace PRD-first validation or actual repo evidence;
- `Check Evidence` for relevant phase scope in [implementation_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- Check Evidence is sufficient only when it records a concrete command or method, a result, concise evidence, and a clear connection to the full validation scope;
- Declarative Check Evidence such as `passed` without these details is insufficient; add a `MUST-FIX` finding with `Class = validation`;
- if relevant `Check Evidence` is missing, remains `pending`, contains `failed`, or does not explain `blocked`, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause;
- if a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`;
- completely ignore `openspec/**` when looking for implementation findings: do not diff, review, or report any files under `openspec/**` as change set, product code, PR scope, or finding source;
- use `openspec/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history;
- tests and additional checks from the Implementation stage are considered already successful because Implementation cannot finish with failed tests/checks;
- do not treat passing or declared Implementation checks as a substitute for changed-file review coverage;
- do not rerun `unit`, `phase`, `full`, or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- use the Artifact Build Contract below as the only source of structure for [validation_findings.md]({{findings_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: final` for Final Validation; do not leave the template default `type: phase`;
- before searching for new issues, read existing `validation_findings.md` if it exists;
- the final file must strictly follow the artifact template and strict registry rules from the template comments: `validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table; do not add prose, headings, evidence blocks, summaries, visual markers, or extra tables to `validation_findings.md`; do not delete finding rows; add a new finding as a new row at the top of the table; if a finding semantically matches a previous finding, update the existing row with the same `ID` and do not create a duplicate; do not change a `resolved` row to `reopened` without new concrete evidence from working code outside `openspec/**`; if no findings are open, save the empty table header and separator from the artifact template.

Readiness decision rule:
- `verdict: ready` means the full change is confirmed correctly solved for the approved initial requirements, full code review found no open findings, full security review found no open findings, and review coverage was complete.
- `verdict: ready_with_risks` means the full change is confirmed correctly solved for blocking requirements, full code and security review coverage was complete, and open findings are limited to non-blocking `RECOMMENDED` or `NIT` rows.
- If the coverage block would report an incomplete code review pass, incomplete security review pass, insufficient Check Evidence review, or non-empty evidence gaps, do not use `verdict: ready` or `verdict: ready_with_risks`; set `verdict: repair_required` and record the blocking gap with `Class = validation`.
- If the agent cannot truthfully provide that confirmation, set `verdict: repair_required` and record the blocking reason.

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`

Stage completion:
- After writing `validation_findings.md`, stop.
- Tell the user the verdict, whether the full change is confirmed correctly solved, and the next transition through `flow next`.
- In the ordinary final response to the user, include this compact coverage block:

```text
Validation coverage:
- Files inspected: <N files or short list>
- Code review pass: completed / incomplete
- Security review pass: completed / incomplete
- Check Evidence review: sufficient / insufficient
- Evidence gaps: none / <short reason>
```

- This coverage block is not a flow artifact: do not write it to `validation_findings.md`, do not create a new file for it, and do not expand `implementation_plan.md` with it.
