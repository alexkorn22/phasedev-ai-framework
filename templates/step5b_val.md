Stage 5B. Final Validation.

Stage contract: validate the implemented working code before Archive.

Validation mode: review-only stage. This stage checks completeness/correctness through review methods and is not a test execution gate.

{{skill_policy}}

Input artifacts:
- PRD requirements and ADLC-style Intent Card: [prd.md]({{prd_path}})
- Development rules: [rules.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})

Required stage-contract checks:
- all phases in [implementation_plan.md]({{plan_path}}) have status `[x]`; Final Validation does not mark phases as `[x]`;
- PRD-first check: the actual change set must satisfy the approved [prd.md]({{prd_path}}), not only the implementation plan;
- `Intent Card`: `Change type`, `User or business intent`, `Generation target`, `Resolution signal`, `Decision deadline`, and `Risk envelope` align with actual implementation and validation evidence;
- `Requirements`: every `R#` is implemented by the actual change set or has a finding;
- `Scope Boundaries`: `In scope:` is covered and `Out of scope:` was not implemented without approval;
- `Success Criteria`: every `SC#` is demonstrably met or has a finding;
- `Accepted Assumptions`: assumptions are not disproven by the actual change set; if an assumption is no longer true, add a `requirements` or `design` finding for that reason;
- `Deferred Decisions`: resolved only through approved design/plan or remained outside implementation scope; if implementation resolved a deferred decision without approval, add a finding;
- `Generation target` from `Intent Card` is covered by approved plan/design and the actual change set;
- `Resolution signal` from `Intent Card` is covered by checks/evidence when it is not `not_applicable`;
- `Risk envelope` from `Intent Card` is not violated; if risk acceptance is required, the finding must be `RECOMMENDED` or `MUST-FIX` by severity;
- completeness of production/test/source/config changes from the approved plan is checked through review methods without running tests;
- `Generation Bundle` in [implementation_plan.md]({{plan_path}}) is checked against the actual change set: declared required areas must be completed or have a finding;
- `Check Evidence` for relevant phase scope in [implementation_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- if relevant `Check Evidence` is missing, remains `pending`, contains `failed`, or does not explain `blocked`, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause;
- if a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`;
- completely ignore `openspec/**` when looking for implementation findings: do not diff, review, or report any files under `openspec/**` as change set, product code, PR scope, or finding source;
- use `openspec/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history;
- tests and additional checks from the Implementation stage are considered already successful because Implementation cannot finish with failed tests/checks;
- do not rerun `unit`, `phase`, `full`, or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- before writing the result, read the artifact template: [validation_findings.md template]({{validation_findings_template_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: final` for Final Validation; do not leave the template default `type: phase`;
- before searching for new issues, read existing `validation_findings.md` if it exists;
- the final file must strictly follow the artifact template and strict registry rules from the template comments;
- `validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table;
- do not add prose, headings, evidence blocks, summaries, visual markers, or extra tables to `validation_findings.md`;
- do not delete finding rows;
- add a new finding as a new row at the top of the table;
- if a finding semantically matches a previous finding, update the existing row with the same `ID` and do not create a duplicate;
- if a previous finding was `resolved`, do not change it to `reopened` without new concrete evidence from working code outside `openspec/**`;
- if a finding really returned after repair, mark it as reopened according to the artifact template rules;
- if there are no open findings, still save an empty table with the header and separator row from the artifact template.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`

Stage completion:
- After writing `validation_findings.md`, stop.
- Tell the user the verdict and the next transition through `flow next`.
