Phase 7. Archive.

Your task is to complete the already archived change: delegate specification work to a `spec_sync` sub-agent, resolve its escalations with the user, run the archive self-check, and complete the machine state.

{{skill_policy}}

The controller has already checked the readiness gate:
- `prd.md`, `execution_contract.md`, `architecture/design.md`, and `iteration_plan.md` are approved;
- all phases in `iteration_plan.md` have status `[x]`;
- `validation_findings.md` is a valid strict registry, has `type: final`, `verdict: ready` or `ready_with_risks`, and contains no open/reopened blocking findings. A `verdict: pending` (CLI self-heal transient) blocks archive readiness until final validation re-runs and sets a terminal verdict.
- the active change has already been moved to archive path: `{{archive_path}}`.
- the pending-state file has been created: [{{archive_state_path}}]({{archive_state_path}}).

Input requirement and design artifacts (you must read them):
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [execution_contract.md]({{rules_path}})
- Research facts: [research_facts.md]({{research_path}})
- Approved design: [architecture/design.md]({{design_path}})
- Implementation plan, including `Generation Bundle` and `Check Evidence`: [iteration_plan.md]({{plan_path}})

Gate-status file:
- Validation status: [validation_findings.md]({{findings_path}})

Path resolution rule:
- Short flow artifact names in this prompt (`prd.md`, `execution_contract.md`, `research_facts.md`, `architecture/design.md`, `iteration_plan.md`, `validation_findings.md`) refer to files inside the archived change at `{{archive_path}}`, not paths from the project repository root.
- Delta specs belong only under `{{archive_path}}/specs/<capability>/spec.md`.
- Long-lived synced specs belong only under the project `.phasedev/specs` path linked below.
- The archive state file is only [{{archive_state_path}}]({{archive_state_path}}); do not create or update a project-root `.phase-archive.json`.

Do not use `validation_findings.md` as a source of requirements, product behavior, or architecture decisions. This file is only gate status.
Do not use `Generation Bundle`, `Expected Change Surface`, or `Check Evidence` as a source of new requirements, product behavior, or architecture decisions. These sections are only delivery evidence and context for the final response.
Use `R#` requirements from `prd.md` as the only source of new requirement-level content for long-lived specs. Use `Intent`, `Risk boundaries`, and `SC#` only as context for the final response and to verify that spec sync reflects approved requirements. Do not create spec requirements only from intent, risk notes, or success criteria unless the same behavior is expressed as requirement-level behavior in a concrete `R#`.
`.phasedev/specs` is long-lived AI context for future Research phases. Prefer omission over speculative requirements.

## Visual Formatting Scope

In the final report, visual formatting and emoji may be used as semantic visual markers when they help explain the archive step result.

Constraints:
- Do not use emoji, decorative callouts, or rich formatting in requirement text when they are not part of spec language.
- Specs remain normative, stable, and suitable for long-lived reading without visual decoration.
- Do not use emoji in YAML frontmatter.
- Do not use emoji in commands, file paths, code blocks, or required machine-readable labels.

## Archive Procedure

Work only with requirement-level changes derived from the archived change artifacts for `{{change_name}}`.

1. Read inputs.
2. Spawn exactly one `spec_sync` sub-agent. Its delegation prompt is the full content of the sections `Spec-level classification`, `Delta-first specs`, `Sync specs`, `## Ripple search`, `## Gap control`, `## UI literals`, and `## Truth direction and escalations` below, plus the artifact links above. Do not classify requirements, create delta specs, or edit any spec yourself.
3. Read the sub-agent report. If it contains escalations: stop, present every escalation to the user as a question, and do not set `.phase-archive.json` to completed until all are resolved. After the user answers, re-dispatch `spec_sync` with the decisions to apply and repeat this step.
4. When the report has no unresolved escalations, set `.phase-archive.json` to completed.
5. Run the archive self-check.
6. Report, then stop: include the sub-agent's classification table, changed specs or skipped sync, ripple/gap findings, and escalation outcomes.

## Spec-level classification

Before creating or updating specs, the `spec_sync` sub-agent classifies every `R#` requirement in its report using this exact table:

```text
R# | Spec-level? | Capability | Operation | Target spec | Reason
```

Classification rules:
- `Spec-level? = yes` only for observable user/system behavior.
- `Operation = ADDED | MODIFIED | REMOVED | RENAMED | skipped`.
- This matrix is not a persistent artifact. Do not create a file for it.
- If you are unsure whether an item is spec-level, set `Operation = skipped`, omit it from specs, and explain the omission in `Reason`.

Spec-level items are concrete `R#` behavior: user-visible workflows or UI; API/CLI/SDK/public interface contracts; user- or system-visible persisted data behavior; external/internal integration behavior; authorization, permission, privacy, or security behavior; business rules, invariants, limits, validation rules, and error behavior; and compatibility/deprecation/migration behavior expressed as required behavior.

Never add to specs: implementation tasks or internal refactoring details without observable behavior; file/module/class names that are not part of a public contract; test commands; `Check Evidence`; validation findings; repair notes; architecture rationale from `architecture/design.md` not tied to a concrete `R#`; `Intent`, `Risk boundaries`, or `SC#` content unless the same behavior is expressed in an `R#`; and speculative future behavior.

## Delta-first specs

1. Analyze existing specifications: [.phasedev/specs]({{main_specs_path}}).
2. If there are no spec-level changes, explicitly record this in the final report: `Spec sync skipped: no requirement-level changes`.
3. If there are changes, create delta specs in the archived change directory: [{{archive_path}}/specs]({{change_specs_path}}).
   - Capability spec path: `{{archive_path}}/specs/<capability>/spec.md`.
   - One spec file = one functional area.
   - Before creating files, extract functional areas from `prd.md`, `execution_contract.md`, `research_facts.md`, `architecture/design.md`, and `iteration_plan.md`.
   - Do not create one large catch-all spec such as `specification`, `change`, `archive`, or `{{change_name}}`.
   - If the change affects multiple independent user scenarios, workflows, APIs/interfaces, modules, domains, roles, or integrations, create multiple capability directories.
   - Do not create a new capability when the change should update an existing capability.
   - If the change updates an existing capability, write a delta spec for that capability, but do not mix unrelated requirements from other functional areas.

Use the delta specs format:

```md
## ADDED Requirements

### Requirement: <requirement name>
The system SHALL ...

#### Scenario: <scenario name>
- WHEN ...
- THEN ...

## MODIFIED Requirements

### Requirement: <existing requirement name>
The system SHALL ...

#### Scenario: <scenario name>
- WHEN ...
- THEN ...

## REMOVED Requirements

### Requirement: <existing requirement name>
Reason: <why removed>

## RENAMED Requirements

### Requirement: <old requirement name>
Renamed to: <new requirement name>
```

Format rules:
- Use only sections that are actually needed: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`.
- Every requirement starts with `### Requirement: ...`.
- Every scenario starts exactly with `#### Scenario: ...`.
- Write normative requirements with `SHALL` or `MUST`.
- For `MODIFIED`, include the full updated requirement, not a patch fragment.

## Sync specs

After creating delta specs, merge them into `.phasedev/specs`. Merging is never copying a delta file over a live spec:
- carefully add new capabilities;
- update existing capabilities only within the requirements of the current change;
- preserve existing requirements/scenarios that the current change does not modify;
- when a requirement replaces a cancelled model, remove the obsolete requirement — do not leave it next to the new one;
- delta section headings (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`) must never appear in a live spec;
- normalize every touched live spec so that its first `##` heading is `## Purpose` (a single leading `# ` title line may precede it).

## Ripple search

After the merge, check the rest of the spec corpus against what the change actually did:

1. Read `commitLog` from `state.json` inside `{{archive_path}}` and take the change diff `commitLog.start..HEAD`. If `commitLog` is absent or has no `start` (the repository had no commits when the change was created), fall back to the change branch's full diff via git, and state in the report which diff source was used.
2. From the diff, extract added/removed/renamed names: files, exported symbols, classes, routes, CSS variables, database fields, environment variables, and user-facing string literals.
3. Grep every extracted name across all files under `.phasedev/specs`. For every hit, decide whether the change made that statement false. Token grep is the floor, not the ceiling: inside specs touched by the change, verify statements by meaning, not only by matched names.

## Gap control

For every persistent entity the diff adds (database column, route, environment variable, public CSS variable): if it is mentioned in no spec at all, record a finding `requirement not written` in the report. A zero-hit grep for a new entity is a finding, not a clean result.

## UI literals

Any spec statement that quotes user-facing text must be checked against the actual constant in code. When the change deliberately updated the literal, fix the spec text to match the code.

## Truth direction and escalations

A divergence between a spec statement and the code is a finding, not an automatic edit:
- Edit the spec only in the obvious case: the spec lags behind a deliberate decision recorded in this change's `prd.md` or `iteration_plan.md`.
- In every ambiguous case (the code may be defective, or the intent is unclear), do NOT edit. Add an escalation item to the report: spec file, quoted statement, what the code actually does, and why the truth direction is unclear.
- The final report must list all spec edits, all ripple and gap findings, and all escalations. An empty escalation list must be stated explicitly.

## Complete archive state

After successful spec sync or an explicit skip, update `.phase-archive.json` in the archived change:
- file: [{{archive_state_path}}]({{archive_state_path}})
- set `status: "completed"`;
- preserve `changeName`, `archivePath`, and `startedAt`;
- add `completedAt` in ISO-8601 format.

## Archive self-check

After updating `.phase-archive.json`, run:

```bash
phasedev check-archive --archive-path {{archive_path}}
```

If the check fails, fix only Archive artifacts allowed by this phase and rerun the same command. Do not report Archive as complete until this command exits successfully.

Phase completion:
- Stop after the archive self-check passes.
- In the report, include the `R#` classification table and state which specs were created/updated or why sync was skipped.
- Include the final archive path: `{{archive_path}}`.
- Include {{skill_compliance_line}}
- Do not suggest running the next flow phase.

## Artifact allowlist

Allowed persistent artifacts for this phase:
- Delta specs in `{{archive_path}}/specs`
- `.phasedev/specs`
- `{{archive_state_path}}`
