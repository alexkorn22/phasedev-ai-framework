Stage 5A. Phase Validation.

Stage contract: validate current phase readiness against the implementation plan. This stage runs for every phase, including the only phase in a single-phase plan.

Validation mode: review-only stage. This stage checks completeness/correctness through review methods and is not a test execution gate.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})

Current phase:
{{phase_id}}

{{controller_changed_files_inventory}}

Required stage-contract checks:
- scope = current phase;
- use the current phase `Expected Change Surface` as a review aid for changed-file inventory and scope comparison, but not as a substitute for actual repository evidence;
- inspect every changed production/source/config/test file tied to the current phase, not only the flow artifacts or `Check Evidence`;
- plan-first check: the current phase implementation matches `Goal`, `Tasks`, `Checks`, `Check Evidence`, and phase scope from [implementation_plan.md]({{plan_path}});
- PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation;
- validate the current phase against the concrete `R#` and `SC#` tied to this phase in the implementation plan/design;
- verify that the current phase does not violate approved PRD `Target state`, `Risk boundaries`, or approved design boundaries;
- verify that the current phase does not add behavior outside the positive PRD contract unless explicitly approved in design/plan;
- completeness of production/test/source/config changes for the current phase and current phase task statuses is checked through review methods without running tests;
- `Check Evidence` for the current phase in [implementation_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- do not rerun tests or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- use the Artifact Build Contract below as the only source of structure for [validation_findings.md]({{findings_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: phase` for Phase Validation;
- if the final verdict is `ready` or `ready_with_risks`, change the current phase status in [implementation_plan.md]({{plan_path}}) from `[~]` to `[x]`;
- if the final verdict is `repair_required`, keep the current phase status as `[~]`.

{{validation_common_contract}}

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`
- phase status in `implementation_plan.md`, only when allowed by validation verdict

Stage completion:
- After writing `validation_findings.md` and possibly updating the phase status, stop.
- Tell the user the verdict, whether the phase is confirmed correctly solved, and the next transition through `phasedev next`.
