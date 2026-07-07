{{phase_opening_summary}}Phase 6A. Iteration Validation.

Phase contract: validate current iteration readiness against the implementation plan. This validation runs for every iteration, including the only iteration in a single-iteration plan.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [execution_contract.md]({{rules_path}})
- Approved design: [architecture/design.md]({{design_path}})
- Implementation plan: [iteration_plan.md]({{plan_path}})

Current iteration:
{{phase_id}}

{{controller_changed_files_inventory}}

Retrieval order:
- Start from the current iteration in [iteration_plan.md]({{plan_path}}), then read PRD/design/rules only for the `R#`, `SC#`, risk boundaries, design decisions, and check commands referenced by that iteration.
- Treat linked artifact paths as the active change source of truth.
- Use repository reads and narrow searches only to verify the current iteration changed-file set, implementation completeness, code review findings, and security findings.

Required phase-contract checks:
- scope = current iteration;
- use the current iteration `Expected Change Surface` as a review aid for changed-file inventory and scope comparison, but not as a substitute for actual repository evidence;
- inspect every changed production/source/config/test file tied to the current iteration, not only the flow artifacts or `Check Evidence`;
- plan-first check: the current iteration implementation matches `Goal`, `Tasks`, `Checks`, `Check Evidence`, and iteration scope from [iteration_plan.md]({{plan_path}});
- PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation;
- validate the current iteration against the concrete `R#` and `SC#` tied to this iteration in the implementation plan/design;
- verify that the current iteration does not violate approved PRD `Target state`, `Risk boundaries`, or approved design boundaries;
- verify that the current iteration does not add behavior outside the positive PRD contract unless explicitly approved in design/plan;
- completeness of production/test/source/config changes for the current iteration and current iteration task statuses is checked through review methods without running tests;
- `Check Evidence` for the current iteration in [iteration_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- do not rerun tests or additional checks at this phase;
- Write validation result to [validation_findings.md]({{findings_path}}) using only the embedded Artifact Build Contract for structure, record rows and the verdict only through the phasedev findings commands (add-finding / resolve-finding / reopen-finding / set-verdict); `phasedev check-validation` catches every structural violation.
- if the final verdict is `ready` or `ready_with_risks`, change the current iteration status in [iteration_plan.md]({{plan_path}}) from `[~]` to `[x]`;
- if the final verdict is `repair_required`, keep the current iteration status as `[~]`.

{{path_resolution_rule}}
- Update iteration status only in the linked active change folder [iteration_plan.md]({{plan_path}}).

{{validation_common_contract}}

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder `validation_findings.md` at the Artifact Build Contract Output path
- iteration status in active change folder `iteration_plan.md`, only when allowed by validation verdict

Any file not listed above is read-only for this phase.

Phase completion:
- After writing `validation_findings.md` and possibly updating the iteration status, stop.
- Tell the user the verdict, whether the iteration is confirmed correctly solved, and the next transition through `phasedev advance`.
- If the user reports a defect after the verdict is written and before `phasedev advance`, do not edit repository code and do not delegate a code task: record it with `phasedev add-finding "<finding>" <severity> --required-fix <text> --class <class>` (the command corrects the verdict automatically), then run `phasedev advance` — the flow will route to finding_repair where the fix is implemented.
