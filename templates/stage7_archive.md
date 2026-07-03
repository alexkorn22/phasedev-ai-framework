Stage 7. Archive.

Your task is to complete the already archived change: sync long-lived specifications from the approved archived change artifacts, run the archive self-check, and complete the machine state.

{{skill_policy}}

The controller has already checked the readiness gate:
- `prd.md`, `execution_contract.md`, `architecture/design.md`, and `iteration_plan.md` are approved;
- all phases in `iteration_plan.md` have status `[x]`;
- `validation_findings.md` is a valid strict registry, has `type: final`, `verdict: ready` or `ready_with_risks`, and contains no open/reopened blocking findings.
- the active change has already been moved to archive path: `{{archive_path}}`.
- the pending-state file has been created: [{{archive_state_path}}]({{archive_state_path}}).

Input requirement and design artifacts (you must read them):
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [execution_contract.md]({{rules_path}})
- Research facts: [research_facts.md]({{research_path}})
- Approved design: [design.md]({{design_path}})
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
`.phasedev/specs` is long-lived AI context for future Research stages. Prefer omission over speculative requirements.

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
2. Classify every `R#`.
3. Create delta specs when needed.
4. Sync `.phasedev/specs` when needed.
5. Set `.phase-archive.json` to completed.
6. Run the archive self-check.
7. Report changed specs or skipped sync, then stop.

## Spec-level classification

Before creating or updating specs, classify every `R#` requirement in the final response using this exact table:

```text
R# | Spec-level? | Capability | Operation | Target spec | Reason
```

Classification rules:
- `Spec-level? = yes` only for observable user/system behavior.
- `Operation = ADDED | MODIFIED | REMOVED | RENAMED | skipped`.
- This matrix is not a persistent artifact. Do not create a file for it.
- If you are unsure whether an item is spec-level, set `Operation = skipped`, omit it from specs, and explain the omission in `Reason`.

Spec-level items include only concrete behavior from `R#`:
- user-visible workflows or UI behavior;
- API, CLI, SDK, or public interface contracts;
- persisted data behavior visible to users or other systems;
- integration behavior with external or internal systems;
- authorization, permission, privacy, or security behavior;
- business rules, invariants, limits, validation rules, and error behavior;
- compatibility, deprecation, or migration behavior when expressed as required behavior.

Do not add to specs:
- implementation tasks;
- file, module, or class names unless they are part of a public contract;
- test commands;
- `Check Evidence`;
- validation findings;
- repair notes;
- internal refactoring details without observable behavior;
- architecture rationale from `architecture/design.md` unless tied to concrete `R#` behavior;
- `Intent`, `Risk boundaries`, or `SC#` content unless the same behavior is expressed in an `R#`;
- speculative future behavior.

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
   - Do not move internal implementation details, temporary tasks, test commands, or validation findings into specs.

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

After creating delta specs, sync them into `.phasedev/specs`:
- carefully add new capabilities;
- update existing capabilities only within the requirements of the current change;
- preserve existing requirements/scenarios that the current change does not modify;
- if you are unsure whether a change is spec-level, do not add it to specs and explain that in the report.

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

If the check fails, fix only Archive artifacts allowed by this stage and rerun the same command. Do not report Archive as complete until this command exits successfully.

Stage completion:
- Stop after the archive self-check passes.
- In the report, include the `R#` classification table and state which specs were created/updated or why sync was skipped.
- Include the final archive path: `{{archive_path}}`.
- Include {{skill_compliance_line}}
- Do not suggest running the next flow stage.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- Delta specs in `{{archive_path}}/specs`
- `.phasedev/specs`
- `{{archive_state_path}}`
