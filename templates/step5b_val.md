Stage 5B. Final Validation.

Stage contract: validate the implemented working code before Archive.

Validation mode: review-only stage. This stage checks completeness/correctness through review methods and is not a test execution gate.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})

{{controller_changed_files_inventory}}

Required stage-contract checks:
- scope = full change;
- all phases in [implementation_plan.md]({{plan_path}}) have status `[x]`;
- Final Validation does not mark phases as `[x]`;
- change-set inventory gate: before deciding the verdict, identify the complete set of repository files changed outside `.phasedev/**` from available read-only repository evidence;
- inspect every changed production/source/config/test file outside `.phasedev/**`, not only the flow artifacts, implementation plan, or `Check Evidence`;
- final requirements conformance pass: verify that the actual changed code implements exactly the initial change requirements from PRD, approved design, and implementation plan artifacts; if behavior is missing, extra, contradictory, or only implied by `Check Evidence`, add a finding;
- final code review pass: perform a full read-only code review of the changed files outside `.phasedev/**` using the configured skill policy;
- final security review pass: perform a read-only security review of the changed files outside `.phasedev/**` using the configured skill policy;
- PRD-first check: the actual change set must satisfy the approved [prd.md]({{prd_path}}), not only the implementation plan;
- `Intent`: `Change type`, `Why`, `Target state`, and `Risk boundaries` align with actual implementation and validation evidence;
- `Requirements`: every `R#` is implemented by the actual change set or has a finding;
- `Success Criteria`: every `SC#` is demonstrably met according to its PRD `Evidence` type or has a finding;
- no behavior outside the positive PRD contract (`Target state`, `R#`, `SC#`, `Risk boundaries`) was implemented without approval;
- `Target state` from `Intent` is covered by approved plan/design and the actual change set;
- `Risk boundaries` from `Intent` are not violated; if risk acceptance is required, the finding must be `RECOMMENDED` or `MUST-FIX` by severity;
- `Generation Bundle` in [implementation_plan.md]({{plan_path}}) is checked against the actual change set: declared required areas must be completed or have a finding;
- `Expected Change Surface` in [implementation_plan.md]({{plan_path}}) is delivery scope context for comparing expected and actual changed areas; it is not a new requirements source and does not replace PRD-first validation or actual repo evidence;
- completeness of production/test/source/config changes from the approved plan is checked through review methods without running tests;
- `Check Evidence` for relevant phase scope in [implementation_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- do not rerun `unit`, `phase`, `full`, or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- use the Artifact Build Contract below as the only source of structure for [validation_findings.md]({{findings_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: final` for Final Validation; do not leave the template default `type: phase`.

Path resolution rule:
- `validation_findings.md` in this prompt is a path inside the active change folder, not a path from the project repository root.
- Write the artifact only to the absolute Output path in the Artifact Build Contract below.
- Do not create or update project-root flow artifact files during this stage.

{{validation_common_contract}}

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this stage:
- active change folder `validation_findings.md` at the Artifact Build Contract Output path

Stage completion:
- After writing `validation_findings.md`, stop.
- Tell the user the verdict, whether the full change is confirmed correctly solved, and the next transition through `phasedev next`.
