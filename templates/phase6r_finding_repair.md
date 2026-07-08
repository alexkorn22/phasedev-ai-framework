{{phase_opening_summary}}Phase 6R. Finding Repair.

Phase contract: process open validation findings and prepare the change for validation again.

{{skill_policy}}

Input artifacts:
- Validation report: [validation_findings.md]({{findings_path}})
- Implementation plan: [iteration_plan.md]({{plan_path}})
- Technical design: [architecture/design.md]({{design_path}})
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Research results: [research_facts.md]({{research_path}})
- Test command rules: [execution_contract.md]({{rules_path}})

{{repair_queue}}

Ordered workflow:
1. Read the Current Repair Queue, then open the full findings registry only to preserve/update rows and confirm each queued ID still has latest status `open` or `reopened`.
2. Read the embedded Artifact Build Contract before editing `validation_findings.md`.
3. Read only the linked source-of-truth artifacts needed by the queued finding classes: `iteration_plan.md` first, then the specific `R#`/`SC#` or risk boundary in `prd.md`, then the specific design/research/rules evidence needed for the repair.
4. Inspect affected production/test/source/config files only after artifact context identifies the narrow change surface; prefer exact file paths from the finding, plan, check evidence, or changed-file evidence over broad repository searches.
5. Patch the smallest required source files or active change artifacts for the finding class, run targeted checks that prove the repair when available, then update `Check Evidence` if it changed.
6. Update only the existing finding rows for repaired queued IDs, preserve all other rows, set the verdict according to the rule below, run the self-check, and stop.

Context budget and stop condition:
- Stop retrieval when every queued finding ID has a concrete repair target, source-of-truth requirement/design/plan context, affected file or artifact evidence, and a verification path or documented blocker.
- Do not read unrelated repository areas, historical chat, generated prompt bundles, or config files to improve confidence after the narrow repair path is established.
- If a needed file is missing, search only by the finding's exact ID, affected iteration label, `R#`, `SC#`, named file, or command text before declaring a blocker.

Finding handling rules:
- use the Artifact Build Contract below as the only source of structure before changing the registry;
- [validation_findings.md]({{findings_path}}) must strictly follow the artifact template and strict registry rules from the template comments;
- the work queue above contains only current blocking findings;
- preserve all existing registry rows that are not in the current blocking queue, including `resolved` and non-blocking rows;
- repair must preserve alignment with `Intent`, `Target state`, `Risk boundaries`, `R#` requirements, `SC#` success criteria, and `Evidence` types from [prd.md]({{prd_path}});
- if a finding relates to a requirement or success criterion, the repair path and updated finding row must reference the concrete `R#` or `SC#`;
- if the fixing path requires a material approval-scope change to `Target state`, a concrete `R#`, a concrete `SC#`, an `Evidence` type, or risk boundaries from the PRD, stop for user discussion and reset approval only on artifacts actually changed after that discussion;
- if a requirements/design detail is ambiguous but does not change approval scope, make the smallest conservative artifact-local repair and record precise evidence in the updated finding row instead of blocking;
- do not delete finding rows;
- record a fixed finding with `phasedev resolve-finding <id> --resolution "<what changed; verification command -> result>"`; the Resolution cell must name the changed files/artifacts and the check that proves the repair;
- stable fields (Severity, Class, Iteration, Finding, Required Fix) of an existing row are immutable; if a row is factually wrong, close it with `phasedev resolve-finding <id> --resolution "inaccurate finding: <why>"` and add a corrected row with `phasedev add-finding`;
- mutate the registry ONLY through the phasedev commands (add-finding / resolve-finding / reopen-finding / set-verdict); never hand-edit table rows, the verdict, or any frontmatter value;
- never clear or rewrite another finding's Resolution content;
- if repair reruns checks or changes evidence for the affected iteration, update `Check Evidence` in [iteration_plan.md]({{plan_path}});
- in `Check Evidence`, use only these `Result` values: `pending`, `passed`, `failed`, `blocked`, `not_applicable`;
- do not leave relevant repair evidence as `pending` or `failed`, except for an external blocker recorded as `blocked` with a reason;
- if a table cell needs a literal `|`, escape it as `\|`.

Repair class map:
- `implementation`: change affected production/source/config/test files inside the current approved design and plan;
- `test`: change the affected tests, test fixtures, or test command evidence; change production/source code only when the test exposes a real implementation defect inside the approved scope;
- `plan`: update [iteration_plan.md]({{plan_path}}), then update the affected change set;
- `design`: update [design.md]({{design_path}}) and related architecture files, then update the affected plan/change set;
- `requirements`: stop for user discussion before material approval-scope changes; after approval, update [prd.md]({{prd_path}}), then affected design/plan/change set;
- `validation`: repair validation evidence, registry row accuracy, or Check Evidence consistency; do not change product behavior unless concrete evidence proves the blocker is a real product defect;
- `security`: change affected source/config/tests needed to remove the security blocker inside approved scope; if the fix changes public requirements, use the `requirements` rule;
- `code_review`: change the exact files or active change artifacts identified by the review finding; if review evidence is stale or wrong, update only the finding row with precise evidence.

{{path_resolution_rule}}
- Production/test/source/config changes may be outside `.phasedev/**` only when required by an `implementation`, `test`, `security`, or `code_review` repair finding.
- Design repair updates [design.md]({{design_path}}) and related active change folder `architecture/*.md` files; do not create a project-root `architecture/` directory as a flow design artifact.

Verdict rule:
- preserve `type` in YAML frontmatter as the scope of the latest validation: `iteration` for Iteration Validation repair, `final` for Final Validation repair; do not reset a final repair to the template default `iteration`;
- do not change `verdict: repair_required` while any current blocking finding does not have latest status `resolved`; the verdict is recorded only with phasedev set-verdict;
- when all current blocking findings have latest status `resolved`, run `phasedev set-verdict repaired` (the command validates consistency and updates the date);
- do not set `ready` or `ready_with_risks` during the Repair Loop phase.

Human reapproval:
- if repair changes an already approved `prd.md`, `architecture/design.md`, or `iteration_plan.md`, change that artifact's YAML frontmatter from `approved: true` to `approved: false` and clear `approved_by` if the field exists;
- this is allowed only for artifacts that are actually changed in this repair;
- updating only task checkboxes, iteration status, or `Check Evidence` in `iteration_plan.md` does not count as changing approved plan content and does not require resetting approval;
- for a pure `implementation` repair, do not change approval statuses for requirements, design, or plan.

{{validation_findings_artifact_contract}}

## Artifact allowlist

Allowed persistent artifacts for this phase:
- affected production/test code
- affected active change folder flow artifacts required by finding class
- active change folder `validation_findings.md` at the Artifact Build Contract Output path

Phase completion:
- After moving all current blocking findings to `resolved` and setting `verdict: repaired`, stop.
- Success final response is allowed only after the self-check passes. Use this compact template and include no extra sections:

```text
Repair ready for repeat validation.
Resolved findings: <F# list>
Changed files/artifacts: <paths>
Checks: <targeted checks and results>
Self-check: <exact command> -> <result>
{{skill_compliance_line}}
Next transition: phasedev advance (run by the user or orchestrator).
```

- For a blocker, do not use the success template. State the blocked finding IDs, the missing material decision/evidence or external failure, targeted checks already attempted, self-check status if reached, and skill compliance in no more than five bullets.
