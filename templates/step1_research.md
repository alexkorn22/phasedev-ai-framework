Stage 1. Research.

Stage contract: create the factual basis for the design stage.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Existing project specs: [.phasedev/specs]({{project_specs_path}})
- Target project root for repository evidence: `{{project_path}}`

Output artifact:
- [research_facts.md]({{research_path}}) inside the active change folder.

Path resolution rule:
- `research_facts.md` in this prompt is a path inside the active change folder, not a path from the project repository root.
- Write the artifact only to the absolute Output path in the Artifact Build Contract below.
- Do not create or update a project-root `research_facts.md` file during this stage.
- Run all code, config, test, and runtime evidence searches under `{{project_path}}` unless an explicit input artifact path in this prompt points elsewhere.

Use the Artifact Build Contract below as the only source of structure for `research_facts.md`.

{{research_artifact_contract}}

Decision flow:
1. Read approved `prd.md` and `rules.md` first. Extract `Intent`, `Target state`, `Risk boundaries`, every `R#`, every `SC#`, and each requested evidence type as the research targets.
2. Gather only enough repository evidence to trace those targets:
   - Retrieval order: project instructions and package/test metadata, then code/config/tests/runtime wiring directly tied to the PRD targets, then `.phasedev/specs` if present, then focused follow-up searches for unresolved target-specific evidence gaps.
   - Context budget: use a small bounded number of broad file listings/searches, at most one per target area such as package layout, source modules, tests, runtime/config, and specs, then focused `rg` queries and file reads for concrete identifiers, modules, commands, tests, and spec areas. Do not perform exhaustive repository or spec audits.
   - Stop condition: stop reading once every `Intent` field, `R#`, `SC#`, evidence type, and risk boundary can be recorded as `confirmed`, `limited`, `blocked`, or `not_applicable` with cited evidence, or once a material PRD blocker is identified.
3. Fill `research_facts.md` from current-state evidence. Code, config, tests, and runtime wiring create `F#` facts. Existing specs create `S#` facts. PRD-only values are allowed only for intent fields that are not repository facts.
4. Resolve conflicts by source priority: current code/config/tests/runtime wiring is implementation truth; `.phasedev/specs` is documented context; `prd.md` and `rules.md` define the requested change contract. If code and specs conflict, record code as current truth and the spec as stale or conflicting context.
5. Use blockers only for material realignment needs. Current code lacking the target behavior is usually a `limited` or `blocked` current-state fact for the relevant `R#`/`SC#`, not a reason to stop. Stop and report a PRD blocker only when the approved PRD/rules are internally contradictory, infeasible against hard repository constraints, or cannot be truthfully traced after bounded retrieval without changing `Intent`, `Target state`, `Risk boundaries`, a specific `R#`, a specific `SC#`, or an evidence type.

Research artifact requirements:
- Include exactly the four sections from the embedded template.
- In `## PRD Intent Trace`, include exactly `Change type`, `Why`, `Target state`, and `Risk boundaries`.
- In `## Requirements & Success Criteria Trace`, include one row for each `R#` and each `SC#`; use code evidence for implementation status and spec context only in the `Spec Context` column.
- In `## Source Facts`, include file paths and line numbers for every `F#` and `S#`. Put affected modules, public interfaces, dependencies, existing contracts, constraints, and similar existing solutions in the `Fact` text only when they directly support a PRD target.
- Include only spec facts that affect `Intent`, `R#`, `SC#`, evidence type, risk boundaries, or future spec-sync context. Do not copy large spec excerpts.
- If `.phasedev/specs` is absent or irrelevant, use `none` or `not_applicable` instead of inventing spec context.
- Use `## Research Gaps & Blockers` only for non-blocking residual gaps or for a concise blocker summary that names the affected PRD/rules fields or IDs.
- Do not conclude that the project actually supports a capability only because it appears in specs.
- Do not include architecture decisions, implementation proposals, or refactoring proposals.

## Artifact self-check

After creating `research_facts.md`, immediately validate the new artifact before completing the stage:

```bash
{{self_check_command}}
```

If the check fails, fix the reported artifact issues in this same stage, then rerun the same command. Repeat until it exits successfully. Report `Research ready` only after this self-check passes.

If the `phasedev` executable name is unavailable, first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route design` subcommand, such as a repository-confirmed `npm exec -- phasedev check --project-path ... --expect-route design` or `bunx phasedev check --project-path ... --expect-route design` form. Use an equivalent executable only when repository evidence or controller output identifies it; record the exact command used. If no equivalent executable is available after this documented lookup, report the exact command failure as a blocker/unavailable self-check result and do not report research as ready.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- active change folder `research_facts.md` at the Artifact Build Contract Output path

Stage completion:
- After writing `research_facts.md`, run the artifact self-check, fix any reported issues, and stop only after the self-check passes. If the self-check is unavailable after the documented command lookup, stop with a blocker/unavailable self-check result instead of the ready template.
- Final response must use this compact template and include no extra sections:

```text
Research ready: {{research_path}}
Self-check: {{self_check_command}} -> <result>
Route: design
Next: phasedev next
Skill compliance: <configured/router skills used; skipped/unavailable skills>
```
