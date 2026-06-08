Stage 5A. Phase Validation.

Stage contract: validate current phase readiness against the implementation plan. This stage runs for every phase, including the only phase in a single-phase plan.

Validation mode: review-only stage. This stage checks completeness/correctness through review methods and is not a test execution gate.

{{skill_policy}}

Input artifacts:
- PRD requirements and ADLC-style Intent Card: [prd.md]({{prd_path}})
- Development rules: [rules.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})

Current phase:
{{phase_id}}

Required stage-contract checks:
- plan-first check: the current phase implementation matches `Goal`, `Tasks`, `Checks`, `Check Evidence`, and phase scope from [implementation_plan.md]({{plan_path}});
- PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation;
- validate the current phase against the concrete `R#` and `SC#` tied to this phase in the implementation plan/design;
- the current phase does not violate approved PRD scope, `Risk envelope`, accepted assumptions, deferred decisions, or approved design boundaries;
- the current phase does not resolve deferred PRD decisions or change accepted assumptions outside the approved design/plan;
- if the current phase declares checks tied to `Resolution signal`, `Check Evidence` must reflect their execution or an explained blocker;
- completeness of production/test/source/config changes for the current phase and current phase task statuses is checked through review methods without running tests;
- `Check Evidence` for the current phase in [implementation_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- if relevant current-phase `Check Evidence` is missing, remains `pending`, contains `failed`, or does not explain `blocked`, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause;
- if a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`;
- completely ignore `openspec/**` when looking for implementation findings: do not diff, review, or report any files under `openspec/**` as change set, product code, PR scope, or finding source;
- use `openspec/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history;
- tests and additional checks from the Implementation stage are considered already successful because Implementation cannot finish with failed tests/checks;
- do not rerun tests or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- before writing the result, read the artifact template: [validation_findings.md template]({{validation_findings_template_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: phase` for Phase Validation;
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

If the final verdict is `ready` or `ready_with_risks`, change the current phase status in [implementation_plan.md]({{plan_path}}) from `[~]` to `[x]`.

If the final verdict is `repair_required`, keep the current phase status as `[~]`.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`
- phase status in `implementation_plan.md`, only when allowed by validation verdict

Stage completion:
- After writing `validation_findings.md` and possibly updating the phase status, stop.
- Tell the user the verdict and the next transition through `flow next`.
