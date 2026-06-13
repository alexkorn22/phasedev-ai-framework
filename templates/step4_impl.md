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

Scope rules:
- execute only the current phase shown above;
- the current phase change set implements only the `R#` and `SC#` tied to the current phase in the approved plan;
- `Expected Change Surface` in the current phase constrains the allowed implementation areas for this stage;
- do not expand scope beyond the current phase `Expected Change Surface`, related `R#`, related `SC#`, and approved `Risk boundaries` without an explicit user decision;
- do not implement work that is not positively required by `Target state`, a concrete `R#`, a concrete `SC#`, or `Risk boundaries`;
- if the approved plan/design does not cover a required `Target state`, `R#`, `SC#`, `Evidence` type, or risk boundary from the PRD, stop and report a blocker instead of expanding scope yourself;
- do not mark the phase heading `[x]` at this stage. It must remain `[~]` until successful validation.

Completion checklist:
- complete the current phase tasks within the approved `prd.md`, approved design, and approved plan;
- update only current-phase task checkboxes in [implementation_plan.md]({{plan_path}}) to `[x]` when the tasks are complete;
- execute the gate command or record why it cannot be executed: `{{test_command}}`;
- execute additional checks from the current phase, if any, or record why they cannot be executed;
- update `### Check Evidence` for the current phase in [implementation_plan.md]({{plan_path}});
- keep `Check Evidence` concise but concrete: command or method, result, what was verified, and blocker reason when blocked;
- use only these `Result` values in `Check Evidence`: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- do not finish Implementation while relevant `Check Evidence` for the current phase remains `pending` or `failed`;
- if checks fail, fix the cause and repeat the checks until they pass;
- if an external blocker prevents completion, record `Result = blocked`, include a short concrete reason in `Evidence` or `Notes`, and explain the blocker in the final response;
- execute the controller self-check before stopping: `{{self_check_command}}`;
- finish only when the controller self-check passes or the current phase is honestly recorded as `blocked`;
- in the final response, briefly summarize the change set, gate evidence, self-check result, and remaining risks.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- production/test code needed for current phase
- task checkboxes and `Check Evidence` rows in `implementation_plan.md`

Stage completion:
- After updating the change set and `implementation_plan.md`, stop.
- Tell the user that the current phase is ready for validation and the next transition is run through `flow next`.
