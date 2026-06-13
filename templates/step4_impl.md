Stage 4. Implementation.

Stage contract: complete only the current phase of the approved implementation plan.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})

Current phase:
{{phase_id}}

Current phase from approved plan:
{{phase_excerpt}}

Required results:
- current phase tasks are completed within the approved `prd.md`, approved design, and approved plan;
- the current phase change set implements only the `R#` and `SC#` tied to the current phase in the approved plan and does not expand beyond the positive PRD contract;
- `Expected Change Surface` in the current phase constrains the allowed implementation areas for this stage; do not edit outside that surface unless the approved phase text explicitly requires it or you stop for user approval;
- the current phase change set stays grounded in `Target state`, the current phase `R#`/`SC#`, and `Risk boundaries` from [prd.md]({{prd_path}});
- if implementation reveals that the approved plan/design does not cover `Target state`, an `R#`, an `SC#`, an `Evidence` type, or a risk boundary from the PRD, stop and report a blocker instead of expanding scope yourself;
- do not implement work that is not positively required by `Target state`, a concrete `R#`, a concrete `SC#`, or `Risk boundaries`;
- task checkboxes for the current phase in [implementation_plan.md]({{plan_path}}) are updated to `[x]` for completed tasks;
- the current phase heading remains `[~]` until successful validation;
- the gate command is executed or the reason it cannot be executed is recorded: `{{test_command}}`;
- additional checks are executed or the reason they cannot be executed is recorded;
- `### Check Evidence` for the current phase in [implementation_plan.md]({{plan_path}}) is updated after running the gate command and additional checks;
- in `Check Evidence`, use only these `Result` values: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- do not finish Implementation if relevant `Check Evidence` for the current phase remains `pending` or `failed`;
- if a check cannot be run because of an external blocker, record `Result = blocked`, a short reason in `Evidence`/`Notes`, and explain the blocker in the final response;
- if the gate command or additional checks fail, fix the failure cause and repeat checks until they pass;
- do not finish Implementation with failed tests/checks, except for an external blocker that cannot be resolved within the current stage;
- the final response contains a brief description of the change set, gate evidence, and remaining risks.

Constraints:
- do not expand scope beyond the current phase, its `Expected Change Surface`, and related `R#`/`SC#` without an explicit user decision;
- do not mark the phase as `[x]` at this stage.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- production/test code needed for current phase
- task checkboxes and `Check Evidence` rows in `implementation_plan.md`

Stage completion:
- After updating the change set and `implementation_plan.md`, stop.
- Tell the user that the current phase is ready for validation and the next transition is run through `flow next`.
