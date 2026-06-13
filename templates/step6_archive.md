Stage 6. Archive.

Your task is to complete the already archived change: sync OpenSpec specifications from the approved archived change artifacts and complete the machine state.

{{skill_policy}}

The controller has already checked the readiness gate:
- `prd.md`, `rules.md`, `architecture/design.md`, and `implementation_plan.md` are approved;
- all phases in `implementation_plan.md` have status `[x]`;
- `validation_findings.md` is a valid strict registry, has `type: final`, `verdict: ready` or `ready_with_risks`, and contains no open/reopened blocking findings.
- the active change has already been moved to archive path: `{{archive_path}}`.
- the pending-state file has been created: [{{archive_state_path}}]({{archive_state_path}}).

Input requirement and design artifacts (you must read them):
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Research facts: [research_facts.md]({{research_path}})
- Approved design: [design.md]({{design_path}})
- Implementation plan, including `Generation Bundle` and `Check Evidence`: [implementation_plan.md]({{plan_path}})

Gate-status file:
- Validation status: [validation_findings.md]({{findings_path}})

Do not use `validation_findings.md` as a source of requirements, product behavior, or architecture decisions. This file is only gate status.
Do not use `Generation Bundle`, `Expected Change Surface`, or `Check Evidence` as a source of new requirements, product behavior, or architecture decisions. These sections are only delivery evidence and context for the archive report.
Use `R#` requirements from `prd.md` as the primary source of requirement-level content for OpenSpec. Use `Intent`, `Risk boundaries`, and `SC#` only as context for the archive report and to verify that spec sync reflects approved requirements. Do not create OpenSpec requirements only from intent or risk notes unless they are expressed as requirement-level behavior in a concrete `R#`.

## Visual Formatting Scope

In the final report, visual formatting and emoji may be used as semantic visual markers when they help explain the archive step result.

Constraints:
- Do not use emoji, decorative callouts, or rich formatting in OpenSpec requirement text when they are not part of spec language.
- OpenSpec specs remain normative, stable, and suitable for long-lived reading without visual decoration.
- Do not use emoji in YAML frontmatter.
- Do not use emoji in commands, file paths, code blocks, or required machine-readable labels.

## Delta-first specs

Work only with requirement-level changes derived from the archived change artifacts for `{{change_name}}`.

1. Read the input artifacts and extract only user/system capability changes from concrete `R#` items that should land in long-lived OpenSpec specs. Cross-check the extraction with `Intent`, `Risk boundaries`, and `SC#`, but do not turn intent, risk notes, or evidence notes into specs without requirement-level behavior in `R#`.
2. Analyze existing specifications: [openspec/specs]({{main_specs_path}}).
3. If there are no spec-level changes, explicitly record this in the final report: `Spec sync skipped: no requirement-level changes`.
4. If there are changes, create delta specs in the archived change directory: [{{archive_path}}/specs]({{change_specs_path}}).
   - Capability spec path: `{{archive_path}}/specs/<capability>/spec.md`.
   - One spec file = one functional area.
   - Before creating files, extract functional areas from `prd.md`, `rules.md`, `research_facts.md`, `architecture/design.md`, and `implementation_plan.md`.
   - Do not create one large catch-all spec such as `specification`, `change`, `archive`, or `{{change_name}}`.
   - If the change affects multiple independent user scenarios, workflows, APIs/interfaces, modules, domains, roles, or integrations, create multiple capability directories.
   - Do not create a new capability when the change should update an existing capability.
   - If the change updates an existing capability, write a delta spec for that capability, but do not mix unrelated requirements from other functional areas.
   - Do not move internal implementation details, temporary tasks, test commands, or validation findings into specs.

Use the OpenSpec delta specs format:

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

After creating delta specs, sync them into `openspec/specs`:
- carefully add new capabilities;
- update existing capabilities only within the requirements of the current change;
- preserve existing requirements/scenarios that the current change does not modify;
- if you are unsure whether a change is spec-level, do not add it to specs and explain that in the report.

## Complete archive state

After successful spec sync or an explicit skip, update `.flow-archive.json` in the archived change:
- file: [{{archive_state_path}}]({{archive_state_path}})
- set `status: "completed"`;
- preserve `changeName`, `archivePath`, and `startedAt`;
- add `completedAt` in ISO-8601 format.

Stage completion:
- Stop after updating `.flow-archive.json`.
- In the report, state which specs were created/updated or why sync was skipped.
- Include the final archive path: `{{archive_path}}`.
- Do not suggest running the next flow stage.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- OpenSpec delta specs in `{{archive_path}}/specs`
- `openspec/specs`
- `{{archive_state_path}}`
