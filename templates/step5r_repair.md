Stage 5R. Repair Loop.

Stage contract: process open validation findings and prepare the change for validation again.

{{skill_policy}}

Input artifacts:
- Validation report: [validation_findings.md]({{findings_path}})
- Implementation plan: [implementation_plan.md]({{plan_path}})
- Technical design: [design.md]({{design_path}})
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Research results: [research_facts.md]({{research_path}})
- Test command rules: [rules.md]({{rules_path}})

{{repair_queue}}

Finding handling rules:
- use the Artifact Build Contract below as the only source of structure before changing the registry;
- [validation_findings.md]({{findings_path}}) must strictly follow the artifact template and strict registry rules from the template comments;
- the work queue above contains only current blocking findings;
- repair must preserve alignment with `Intent`, `Target state`, `Risk boundaries`, `R#` requirements, `SC#` success criteria, and `Evidence` types from [prd.md]({{prd_path}});
- if a finding relates to a requirement or success criterion, the repair path and updated finding row must reference the concrete `R#` or `SC#`;
- if the fixing path requires changing `Target state`, a concrete `R#`, a concrete `SC#`, an `Evidence` type, or risk boundaries from the PRD, this is a `requirements` finding path: discuss it with the user and reset approval on the changed `prd.md`;
- do not delete finding rows;
- record a fixed finding by changing the existing row `Status` to `resolved`;
- do not change stable fields in an existing row unless needed to fix an explicit error in the row;
- if repair reruns checks or changes evidence for the affected phase, update `Check Evidence` in [implementation_plan.md]({{plan_path}});
- in `Check Evidence`, use only these `Result` values: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- do not leave relevant repair evidence as `pending` or `failed`, except for an external blocker recorded as `blocked` with a reason;
- `implementation`: update the change set within the current approved design and plan;
- `plan`: update [implementation_plan.md]({{plan_path}}), then update the affected change set;
- `design`: update [design.md]({{design_path}}) and related architecture files, then update the affected plan/change set;
- `requirements`: after discussing with the user, update [prd.md]({{prd_path}}), then the affected design/plan/change set;
- if a table cell needs a literal `|`, escape it as `\|`.

Verdict rule:
- preserve `type` in YAML frontmatter as the scope of the latest validation: `phase` for Phase Validation repair, `final` for Final Validation repair; do not reset a final repair to the template default `phase`;
- do not change `verdict: repair_required` while any current blocking finding does not have latest status `resolved`;
- when all current blocking findings have latest status `resolved`, set `verdict: repaired` and update the date;
- do not set `ready` or `ready_with_risks` during the Repair Loop stage.

Human reapproval:
- if repair changes an already approved `prd.md`, `architecture/design.md`, or `implementation_plan.md`, change that artifact's YAML frontmatter from `approved: true` to `approved: false` and clear `approved_by` if the field exists;
- this is allowed only for artifacts that are actually changed in this repair;
- updating only task checkboxes, phase status, or `Check Evidence` in `implementation_plan.md` does not count as changing approved plan content and does not require resetting approval;
- for a pure `implementation` repair, do not change approval statuses for requirements, design, or plan.

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this stage:
- affected production/test code
- affected approved flow artifacts required by finding class
- `validation_findings.md`

Stage completion:
- After moving all current blocking findings to `resolved` and setting `verdict: repaired`, stop.
- Tell the user that repair is ready for validation again through `phasedev next`.
