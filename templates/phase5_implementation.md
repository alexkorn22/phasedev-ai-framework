Phase 5. Implementation.

Phase contract: complete only the current phase of the approved implementation plan.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [execution_contract.md]({{rules_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan write-back path: [iteration_plan.md]({{plan_path}}); use the embedded full-plan orientation and current phase excerpt below as the implementation-plan read surface.

Full-plan orientation:
{{plan_map}}

Current phase:
{{phase_id}}

Current phase from approved plan:
{{phase_excerpt}}

Ordered workflow:
1. Read this phase prompt, the embedded full-plan orientation, and the embedded current phase excerpt first; open the full [iteration_plan.md]({{plan_path}}) only when patching current-phase task checkboxes or `Check Evidence`, or when the embedded orientation/excerpt is missing or contradictory.
2. Use the full-plan orientation to understand sequence, dependencies, completed prior work, and future boundaries; do not implement future-phase tasks from the orientation alone.
3. Read [prd.md]({{prd_path}}), [execution_contract.md]({{rules_path}}), and [design.md]({{design_path}}) only for the concrete `R#`, `SC#`, `D#`, checks, risk boundaries, and paths referenced by the current phase, plus any directly referenced prior-phase contract needed to avoid conflicting with already completed work.
4. Identify the current phase `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, `Check Evidence`, related `R#`, related `SC#`, approved `Risk boundaries`, and any prior-phase boundary that the current phase must preserve.
{{stage_skill_step}}
6. Inspect repository files only after the current phase scope is understood, and only files or narrow searches needed by the current phase `Expected Change Surface`.
7. Implement the smallest change set that completes the current phase tasks, then run checks, update current-phase task checkboxes and `Check Evidence`, run the controller self-check, and stop.

Context budget and stop condition:
- Treat the embedded full-plan orientation plus current phase excerpt as the primary retrieval layer; do not load the full implementation plan unless the write-back or ambiguity exception above applies.
- Keep future phases as boundary context only. They can stop accidental overreach, but they do not authorize implementation or broad repository inspection.
- For PRD/design/rules evidence, retrieve only the rows or sections referenced by current-phase `R#`, `SC#`, `D#`, checks, and risk boundaries.
- For repository evidence, start with the paths/patterns named in the current `Expected Change Surface`; use broad searches only when a named surface needs path discovery, and keep them minimal.
- Stop retrieval when every current-phase task, related `R#`, related `SC#`, check row, and applicable risk boundary has enough evidence to implement and verify.
- Do not inspect unrelated repository areas or future phases to improve confidence after the stop condition is met.

Scope rules:
- execute only the current phase shown above;
- the current phase change set implements only the `R#` and `SC#` tied to the current phase in the approved plan;
- `Expected Change Surface` in the current phase constrains the allowed implementation areas for this phase;
- do not expand scope beyond the current phase `Expected Change Surface`, related `R#`, related `SC#`, and approved `Risk boundaries` without an explicit user decision;
- do not implement work that is not positively required by `Target state`, a concrete `R#`, a concrete `SC#`, or `Risk boundaries`;
- if an approved plan/design gap materially prevents safe current-phase completion or verification for a required `Target state`, `R#`, `SC#`, `Evidence` type, or risk boundary, stop and report a blocker instead of expanding scope yourself;
- if a plan/design gap does not materially prevent safe completion or verification of the current phase inside the approved surface, record it as a remaining risk instead of blocking;
- do not block on PRD/design coverage gaps outside the current phase boundary; mention them only as remaining risks if discovered while following the retrieval order;
- do not mark the phase heading `[x]` at this phase. It must remain `[~]` until successful validation.

Path resolution rule:
- `iteration_plan.md` in this prompt is the active change folder plan at [iteration_plan.md]({{plan_path}}), not a path from the project repository root.
- Only production/test/source/config changes from the current phase belong outside `.phasedev/**`.
- Do not create or update project-root flow artifact files such as `prd.md`, `execution_contract.md`, `research_facts.md`, `iteration_plan.md`, or `validation_findings.md`.

Completion checklist:
- complete the current phase tasks within the approved `prd.md`, approved design, and approved plan;
- update only current-phase task checkboxes in [iteration_plan.md]({{plan_path}}) to `[x]` when the tasks are complete;
- execute every required check command below or record why it cannot be executed:
{{test_command}}
- execute additional checks from the current phase, if any, or record why they cannot be executed;
- update `### Check Evidence` for the current phase in [iteration_plan.md]({{plan_path}});
- keep `Check Evidence` concise but concrete: command or method, result, what was verified, and blocker reason when blocked;
- use only these `Result` values in `Check Evidence`: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- advance toward validation only after current-phase `Check Evidence` has every required check recorded as `passed` and has no `pending`, `failed`, or `blocked` rows;
- if checks fail and the failure is causally related to the current phase change set, fix only inside the approved current-phase surface and repeat the affected checks;
- if a check failure is unrelated to the current phase, external/environmental, or outside the approved surface, do not repair outside scope; record `Result = blocked` when it prevents verification, otherwise record the remaining risk with exact evidence;
- if an external blocker prevents completion, record `Result = blocked`, include a short concrete reason in `Evidence` or `Notes`, and explain the blocker in the final response;
- execute the controller self-check before stopping: `{{self_check_command}}`;
- if the controller self-check command, binary, or environment is unavailable, record the exact command and error class, keep the phase heading `[~]`, update `Check Evidence` honestly with `Result = blocked` if route verification is prevented, and do not substitute a different route check;
- finish only when the controller self-check passes or the current phase is honestly recorded as `blocked`;
- use the compact final response template below.

Final response is allowed only after the self-check passes or the current phase is honestly recorded as `blocked`. It must use this compact template and include no extra sections beyond the structured Skill compliance section required by the Skill Execution Contract:
- `Implementation ready: {{phase_id}}`
- `Change set: <1-3 bullets or one concise sentence>`
- `Gate evidence: <check command/method -> result>`
- `Self-check: <exact command> -> <result>`
- {{skill_compliance_line}}
- `Risks: <remaining current-phase risks or "none">`

## Artifact allowlist

Allowed persistent artifacts for this phase:
- production/test code needed for current phase
- task checkboxes and `Check Evidence` rows in active change folder `iteration_plan.md`

Phase completion:
- After updating the change set and `iteration_plan.md`, stop.
- Tell the user that the current phase is ready for validation and the next transition is through `phasedev advance`.
