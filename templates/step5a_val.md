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

Required stage-contract checks:
- plan-first check: the current phase implementation matches `Goal`, `Tasks`, `Checks`, `Check Evidence`, and phase scope from [implementation_plan.md]({{plan_path}});
- change-set inventory gate: before deciding the verdict, identify the complete set of repository files changed for the current phase outside `openspec/**` from available read-only repository evidence and the implementation plan evidence;
- inspect every changed production/source/config/test file tied to the current phase, not only the flow artifacts or `Check Evidence`; if the phase scope cannot be mapped to a complete changed-file inventory, add a `MUST-FIX` finding with `Class = validation`;
- current-phase requirements conformance pass: verify that the actual changed code implements exactly the current-phase `Target state`, `R#`, `SC#`, and `Risk boundaries` from PRD, approved design, and implementation plan; if behavior is missing, extra, contradictory, or only implied by `Check Evidence`, add a finding;
- current-phase code review pass: perform a full read-only code review of the changed files tied to the current phase, including correctness, edge cases, error/empty states, UI layout/responsive overflow and interaction states, data mapping/normalization behavior, architecture/layer boundaries, public API/export surface, maintainability, and test gaps for changed behavior;
- current-phase security review pass: perform a read-only security review of the changed files tied to the current phase, including user/input handling, output encoding/XSS, injection risks, authorization/data isolation where applicable, secret or environment exposure, unsafe network/file/process access, dangerous APIs, and dependency/config exposure;
- if the requirements conformance pass, code review pass, or security review pass cannot be completed with sufficient evidence, add a `MUST-FIX` finding with `Class = validation`;
- if any changed current-phase file cannot be inspected deeply enough to support the verdict, add a `MUST-FIX` finding with `Class = validation`;
- PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation;
- validate the current phase against the concrete `R#` and `SC#` tied to this phase in the implementation plan/design;
- the current phase does not violate approved PRD `Target state`, `Risk boundaries`, or approved design boundaries;
- the current phase does not add behavior outside the positive PRD contract unless explicitly approved in design/plan;
- if the current phase declares checks tied to an `SC#` evidence type, `Check Evidence` must reflect their execution or an explained blocker;
- completeness of production/test/source/config changes for the current phase and current phase task statuses is checked through review methods without running tests;
- `Check Evidence` for the current phase in [implementation_plan.md]({{plan_path}}) is checked as evidence that Implementation checks ran;
- Check Evidence is sufficient only when it records a concrete command or method, a result, concise evidence, and a clear connection to the current phase scope;
- Declarative Check Evidence such as `passed` without these details is insufficient; add a `MUST-FIX` finding with `Class = validation`;
- if relevant current-phase `Check Evidence` is missing, remains `pending`, contains `failed`, or does not explain `blocked`, add a finding with `Class = validation` or a more precise class if there is a concrete implementation/design/plan cause;
- if a finding relates to a PRD requirement or success criterion, `Finding` or `Required Fix` must include the concrete `R#` or `SC#`;
- completely ignore `openspec/**` when looking for implementation findings: do not diff, review, or report any files under `openspec/**` as change set, product code, PR scope, or finding source;
- use `openspec/changes/<active>` only as the read-only flow input contract: requirements, rules, approved design, plan, and previous validation history;
- tests and additional checks from the Implementation stage are considered already successful because Implementation cannot finish with failed tests/checks;
- do not treat passing or declared Implementation checks as a substitute for changed-file review coverage;
- do not rerun tests or additional checks at this stage;
- validation result is written to [validation_findings.md]({{findings_path}});
- use the Artifact Build Contract below as the only source of structure for [validation_findings.md]({{findings_path}});
- YAML frontmatter in [validation_findings.md]({{findings_path}}) must have `type: phase` for Phase Validation;
- before searching for new issues, read existing `validation_findings.md` if it exists;
- the final file must strictly follow the artifact template and strict registry rules from the template comments: `validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table; do not add prose, headings, evidence blocks, summaries, visual markers, or extra tables to `validation_findings.md`; do not delete finding rows; add a new finding as a new row at the top of the table; if a finding semantically matches a previous finding, update the existing row with the same `ID` and do not create a duplicate; do not change a `resolved` row to `reopened` without new concrete evidence from working code outside `openspec/**`; if no findings are open, save the empty table header and separator from the artifact template.

Readiness decision rule:
- `verdict: ready` means the current phase is confirmed correctly solved for its approved requirements, full code review found no open findings, full security review found no open findings, and review coverage was complete.
- `verdict: ready_with_risks` means the current phase is confirmed correctly solved for blocking requirements, full code and security review coverage was complete, and open findings are limited to non-blocking `RECOMMENDED` or `NIT` rows.
- If the coverage block would report an incomplete code review pass, incomplete security review pass, insufficient Check Evidence review, or non-empty evidence gaps, do not use `verdict: ready` or `verdict: ready_with_risks`; set `verdict: repair_required` and record the blocking gap with `Class = validation`.
- If the agent cannot truthfully provide that confirmation, set `verdict: repair_required` and record the blocking reason.

If the final verdict is `ready` or `ready_with_risks`, change the current phase status in [implementation_plan.md]({{plan_path}}) from `[~]` to `[x]`.

If the final verdict is `repair_required`, keep the current phase status as `[~]`.

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`
- phase status in `implementation_plan.md`, only when allowed by validation verdict

Stage completion:
- After writing `validation_findings.md` and possibly updating the phase status, stop.
- Tell the user the verdict, whether the phase is confirmed correctly solved, and the next transition through `flow next`.
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
