Phase 6A. Iteration Validation.

Phase contract: validate current iteration readiness against the implementation plan. This phase runs for every iteration, including the only iteration in a single-iteration plan.

Validation mode: review-only stage. This stage checks completeness/correctness through review methods and is not a test execution gate.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [execution_contract.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [iteration_plan.md]({{plan_path}})

Current phase:
{{phase_id}}

{{controller_changed_files_inventory}}

Retrieval order:
- Start from the current phase in [iteration_plan.md]({{plan_path}}), then read PRD/design/rules only for the `R#`, `SC#`, risk boundaries, design decisions, and check commands referenced by that phase.
- Treat linked artifact paths as the active change source of truth during real stage execution. If only a generated prompt bundle is being evaluated and its linked sandbox files are unavailable, use the embedded artifact contract and current phase label in this prompt; mention the missing sandbox files only as an evaluation limitation, not as a validation finding.
- Use repository reads and narrow searches only to verify the current phase changed-file set, implementation completeness, code review findings, and security findings.

Required stage-contract checks:
- scope = current phase;
- use the current phase `Expected Change Surface` as a review aid for changed-file inventory and scope comparison, but not as a substitute for actual repository evidence;
- inspect every changed production/source/config/test file tied to the current phase, not only the flow artifacts or `Check Evidence`;
- plan-first check: the current phase implementation matches `Goal`, `Tasks`, `Checks`, `Check Evidence`, and phase scope from [iteration_plan.md]({{plan_path}});
- PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation;
- validate the current phase against the concrete `R#` and `SC#` tied to this phase in the implementation plan/design;
- verify that the current phase does not violate approved PRD `Target state`, `Risk boundaries`, or approved design boundaries;
- verify that the current phase does not add behavior outside the positive PRD contract unless explicitly approved in design/plan;
- completeness of production/test/source/config changes for the current phase and current phase task statuses is checked through review methods without running tests;
- `Check Evidence` for the current phase in [iteration_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- do not rerun tests or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- use the Artifact Build Contract below as the only source of structure for [validation_findings.md]({{findings_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: phase` for Phase Validation;
- if the final verdict is `ready` or `ready_with_risks`, change the current phase status in [iteration_plan.md]({{plan_path}}) from `[~]` to `[x]`;
- if the final verdict is `repair_required`, keep the current phase status as `[~]`.

Path resolution rule:
- `validation_findings.md` and `iteration_plan.md` in this prompt are paths inside the active change folder, not paths from the project repository root.
- Write `validation_findings.md` only to the absolute Output path in the Artifact Build Contract below.
- Update phase status only in the linked active change folder [iteration_plan.md]({{plan_path}}).
- Do not create or update project-root flow artifact files during this stage.

{{validation_common_contract}}

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this stage:
- active change folder `validation_findings.md` at the Artifact Build Contract Output path
- phase status in active change folder `iteration_plan.md`, only when allowed by validation verdict

Stage completion:
- After writing `validation_findings.md` and possibly updating the phase status, stop.
- Tell the user the verdict, whether the phase is confirmed correctly solved, and the next transition through `phasedev next`.
