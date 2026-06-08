# Backlog

## Artifact Format Hardening

### 1. Canonicalize `architecture/design.md` package map

Issue:
- `templates/artifacts/design.md` defines `Architecture Package Map` as `Component | Target Files | Responsibility`.
- `templates/step2_design.md` requires `File | Purpose | Visual content | Review priority`.
- `validateDesign` only checks that some markdown table exists.

Risk:
- Different agents can create different design map formats, and both can pass the controller.

Recommendation:
- Use the stage prompt format as the canonical design package index:

```md
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| `architecture/design.md` | Entry point and approval summary for this design package. | approval summary, package map, top-level diagram/table | high |
```

- Treat `Architecture Package Map` as an index of approved design package files, not as a component implementation map.
- Keep implementation component mapping inside `## Key Design Decisions` or a linked architecture subdocument only when it adds review value.
- Update both `templates/artifacts/design.md` and `templates/step2_design.md` to use the same canonical format.

Deterministic validation:
- Validate only mechanical artifact-contract invariants, not design quality.
- `## Architecture Package Map` must contain exactly one markdown table.
- Table headers must be exactly `File`, `Purpose`, `Visual content`, `Review priority`.
- The first data row must be `architecture/design.md`.
- Every `File` value must start with `architecture/`, end with `.md`, and use kebab-case for subdocuments.
- Every table cell must be non-empty.
- `Review priority` must be one of `high`, `medium`, or `low`.
- Every listed file must exist.
- Every `architecture/*.md` file, except technical exclusions if any are explicitly defined, must be listed in the table.
- If more than one file is listed, `architecture/design.md` should contain at least one explicit visual review surface, such as a Mermaid block or review table.
- `design.md` must still reject unexpected `##` sections according to the design artifact contract.

Do not validate with scripts:
- Whether the architecture is correct.
- Whether `Purpose` fully matches the file contents.
- Whether the chosen decomposition is the best decomposition.
- Whether a subdocument should have existed for a given concern.

Those semantic checks stay in the design stage self-check, validation stage review, and human approval.

### 2. Add stricter validation for `implementation_plan.md`

Issue:
- The template defines a strict plan shape: `Approval Summary`, `Generation Bundle`, `Phase Overview`, then phase sections.
- `validatePlanStructure` mainly checks `Generation Bundle`, phase headings, task IDs, task statuses, and `Check Evidence`.
- It does not validate exact top-level section order, `Approval Summary`, `Phase Overview`, or unexpected `##` sections.

Risk:
- A plan can be valid for Flow routing but visually and structurally inconsistent across agents.

Recommendation:
- Add a plan artifact validator similar to PRD validation.
- Validate one top-level heading, allowed `##` sections in fixed order, exact table columns for `Approval Summary`, `Generation Bundle`, and `Phase Overview`, no extra top-level sections, and no placeholder-like content.

### 3. Prevent phase validation when check evidence is still pending or failed

Issue:
- `resolveFlowRoute` considers pending/failed `Check Evidence`.
- `handlePhase` can route to Phase Validation based only on completed top-level tasks.

Risk:
- An agent can mark tasks complete without updating `Check Evidence`, then receive a validation prompt instead of staying in Implementation.

Recommendation:
- Make `handlePhase` use the same readiness criteria as `phaseStage`: completed tasks plus no pending/failed relevant evidence.
- Keep Implementation active until evidence rows are updated to `passed`, `blocked`, or `not_applicable`.

### 4. Require complete `R#` and `SC#` traceability in `research_facts.md`

Issue:
- `validateResearchFacts` checks required sections and at least one `file:line` reference.
- It does not verify that every PRD `R#` and `SC#` appears in `Requirements & Success Criteria Trace`.

Risk:
- Research can contain general notes instead of complete traceability and still pass.

Recommendation:
- Convert `Requirements & Success Criteria Trace` to a strict table, for example `ID | Status | Evidence | Gaps/Blockers`.
- Validate that every `R#` and `SC#` from `prd.md` appears exactly once.

### 5. Add a real artifact contract for `rules.md`

Issue:
- `rules.md` is an approval artifact, but there is no artifact template or validator for it.
- Test commands are parsed later, during implementation routing.

Risk:
- A human can approve a structurally weak or malformed `rules.md`, and Flow detects missing command structure only later.

Recommendation:
- Add `templates/artifacts/rules.md`.
- Add `validateRulesArtifact`.
- Validate frontmatter, one `# Rules` heading, mandatory `## Test Commands`, exact `unit`, `phase`, and `full` command rows, non-empty commands, and blocked placeholders.
