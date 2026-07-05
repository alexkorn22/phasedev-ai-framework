Phase 3. Technical Design.

Phase contract: prepare an approvable visual-first architecture package based on requirements and research facts.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [execution_contract.md]({{rules_path}})
- Research results: [research_facts.md]({{research_path}})

## Context retrieval protocol

Use this bounded retrieval order before designing:
1. Read this prompt and the embedded Artifact Build Contract so the output shape is fixed before analysis.
2. Read [prd.md]({{prd_path}}), [research_facts.md]({{research_path}}), and [execution_contract.md]({{rules_path}}) completely when they are reasonably sized.
   If a phase input is too large for useful full reading, first extract its headings, tables, and IDs (`Intent`, `R#`, `SC#`, `F#`, `S#`, risk boundaries, test commands), then read only the sections needed for design decisions and final traceability.
{{phase_skill_step}}
3. Inspect repository files only to answer a concrete PRD/research/design question. Prefer targeted `rg` searches and open only the smallest set of files needed to confirm contracts, boundaries, ownership, or feasibility.

Context budget and stop condition:
- Start with PRD, research facts, rules, and active change paths; do not broad-scan the repository by default.
- For repository evidence, first run targeted searches for named files, APIs, modules, commands, or concepts from the PRD/research. If those searches identify no relevant surface, record the absence as a bounded risk instead of continuing an open-ended scan.
- Stop retrieval when every `R#` and `SC#` can be mapped to valid research evidence, at least one `D#`, affected boundaries, and plan impact, and no material approval ambiguity remains.
- Do not inspect `config.yaml`, framework template files, generated prompt output, or unrelated project areas unless a phase input explicitly requires that evidence.

Required output artifact:
- [architecture/design.md]({{design_path}}) inside the active change folder.

{{path_resolution_rule}}
- `architecture/*.md` subdocuments are also design-package paths relative to the active change folder; do not create a project-root `architecture/` directory.

Use the Artifact Build Contract below as the only source of structure for `architecture/design.md`.

{{design_artifact_contract}}

`architecture/design.md` is the required design-phase entry point, the only design approval gate, and the architecture package entrypoint/index.

Additional architecture files inside `architecture/` are allowed and expected for any non-trivial design. Examples: `data-flow.md`, `api-contracts.md`, `ui-architecture.md`, `migration-plan.md`, `persistence.md`, `runtime-layout.md`, `validation.md`.

Small/single-file design:
- If the change is small, touches 1-3 tightly related areas, and the whole design reads compactly, it may stay entirely in `architecture/design.md`.
- Even a small/single-file design must have a compact visual review surface near the top.
- For small/single-file design, list only `architecture/design.md` in `Architecture Package Map`.

Decomposition rules:
- `architecture/design.md` target size: up to 120 lines; hard guidance: do not bloat it beyond 180 lines.
- If the design covers 4+ material areas, create a linked subdocument for each major area.
- If an individual section becomes longer than 40 lines, move the details into a linked subdocument.
- If there are separate contracts, data flow, API surface, UI flow, persistence, migration, security boundary, validation, or runtime ownership concerns, prefer a separate `architecture/*.md`.
- Linked subdocument names must be short, kebab-case, and reflect the area: `command-surface.md`, `runtime-layout.md`, `parser-config.md`, `persistence.md`, `backend-boundaries.md`, `frontend-boundaries.md`, `validation.md`.
- Do not split artificially: a subdocument is needed only when it genuinely improves human review.
- Do not duplicate large prose fragments between `design.md` and subdocuments; `design.md` summarizes and links, subdocuments hold details.
- Each linked subdocument must have a minimal review contract: purpose, one diagram/table/tree review surface, the decisions/contracts/details it expands, and a backlink or clear reference from `architecture/design.md`.

Artifact-specific content rules:
- Preserve the six-section structure from the embedded artifact template exactly; do not add headings beyond the required `# Design` title and those six required `##` sections.
- In `## Executive Summary`, provide a compact approval snapshot table that states the solution direction, approval scope, out-of-scope boundaries, key reviewer attention, and validation plan.
- Explicitly connect the design direction to PRD `Intent`, `Target state`, `R#`, `SC#`, and `Risk boundaries`; do not introduce design work outside those approved inputs.
- In `## Traceability Mapping`, include one row for every `R#` and `SC#`; each row must reference at least one valid `D#` and either valid `F#`/`S#` evidence or `not_applicable: <short reason>` when the validated research record justifies no applicable evidence for that row.
- Define each `D#` exactly once in `## Key Design Decisions`, and make every `D#` traceable from at least one row.
- Use `## Contracts, Interfaces & Boundaries` for changed contracts, public interfaces, dependency boundaries, schemas, APIs, runtime ownership, or `not_applicable: <reason>` only when there is no material contract surface.
- Use `## Architecture Package Map` only as the index of approvable design files. Its `File` column uses active-change-folder design package paths, not project-root paths. Link every additional `architecture/*.md` file that is part of approval.
- The controller checks approval only on `architecture/design.md`; explicitly listed subdocuments are approved through that entrypoint.

## Visual-first policy

Human reviewers must quickly understand what will change and how it is planned. Write the design as a reviewable architecture map, not as a long prose essay.

Visual review aids:
- For a non-trivial design package, use at least one Mermaid diagram.
- Use schemas, diagrams, tables, matrix views, directory trees, callouts, and semantic visual markers only when they speed up review inside the allowed template sections.
- Optional Mermaid/callouts/visual markers must never change YAML frontmatter, table headers, required section structure, machine-readable labels, or required traceability fields.
- Use Mermaid `flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, or `stateDiagram` when the design affects runtime flow, dependency direction, persistence, API contracts, UI states, or validation paths.
- Use tables for contracts, public interfaces, risks, ownership, decisions, alternatives, and validation mapping.
- A visual must explain real changes or planned architecture; do not add decorative diagrams.
- Every linked subdocument must start with purpose, then a diagram/table/tree review surface, then decisions/contracts/details.
- Do not bury material risks, changed contracts, accepted assumptions, or ownership boundaries deep in prose; show them in `## Executive Summary` or the relevant required section.

## Artifact allowlist

Allowed persistent artifacts for this phase:
- active change folder `architecture/design.md` at the Artifact Build Contract Output path
- linked files inside the active change folder `architecture/`, only when they are referenced from `architecture/design.md`

Constraints:
- do not change production code at this phase;
- do not create or update project-root `architecture/` files;
- the AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.

## Human Review Formatting Policy

`architecture/design.md` is the approval artifact and index for the whole architecture package, so format it for quick human review.

Formatting rules:
- YAML frontmatter remains first in the file.
- The first visible part of the document must quickly explain the technical direction the user is approving.
- Use `## Executive Summary` as the compact visual review surface. It should contain 2-5 high-signal table rows or callouts with the most important approval information, not a separate invented section.
- In the compact visual review surface, use semantic emoji markers when they add signal: 📌 approval scope, 🚫 out of scope, ✅ key decision/success, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
- Do not accept a technical direction that changes `Intent`, `Target state`, `R#` requirements, `SC#` success criteria, `Evidence` types, or `Risk boundaries` from the PRD. If design requires that kind of change, stop and ask the user to realign the PRD.
- Use short paragraphs, bullets, tables, blockquotes, and bold where they help readability inside the required sections.
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.
- Reflect `Risk boundaries` in design decisions, validation mapping, and rollout/rollback considerations where relevant.
- Emoji may be used as semantic visual markers when they help scan the document.
- Do not use emoji in YAML frontmatter.
- Do not use emoji in commands, file paths, code blocks, or required machine-readable labels.
- In `architecture/design.md`, preserve all machine-readable approval frontmatter elements and explicitly list linked architecture files if they are part of the approved design.

## Uncertainty decision flow

Prefer a complete, approvable design when the available inputs support one:
1. If a design choice is directly supported by PRD rows and research facts, make the decision, assign a `D#`, and map it in traceability.
2. If evidence is incomplete but the missing detail does not change approval scope, PRD semantics, public contracts, or downstream implementation boundaries, choose the smallest conservative design that satisfies the PRD and record the bounded note in `## Risks & Open Questions` with an explicit label such as `assumption: ...` or `risk: ...`.
3. If a question changes what the user is approving, expands scope, contradicts research, changes a public contract, weakens a risk boundary, or requires a PRD/research update, ask the user and stop before writing or finalizing `architecture/design.md`.
4. Treat material unknowns as blockers before finalizing the artifact. Do not hide them with placeholder words or write pending material questions into `architecture/design.md` as a substitute for asking the user.
5. `not_applicable: <reason>` is a valid mapping only when justified by the validated research record and the reason is specific enough for review.

`## Risks & Open Questions` is for bounded review notes that do not block approval of the proposed architecture. It is not a backlog for unresolved material decisions.

## Completion self-check

Before completing the phase, confirm the rules defined above hold (do not restate them): decomposition/size respected; every linked subdocument listed in `Architecture Package Map` and linked from `architecture/design.md`, each starting with purpose plus a visual review surface without duplicating prose; a non-trivial package has at least one non-decorative Mermaid diagram; every `R#`/`SC#` appears in `Traceability Mapping` with valid `F#`/`S#` evidence or `not_applicable: <short reason>` plus valid `D#`; every `D#` defined once and referenced by a row; no divergence from PRD intent, target state, `R#`, `SC#`, evidence types, or risk boundaries.

Then immediately validate the new design artifact before completing the phase:

```bash
{{self_check_command}}
```

If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `architecture/design.md` until this self-check passes.

{{self_check_fallback}}

Phase completion:
- After writing the architecture package, run the artifact self-check, fix any reported issues, and stop only after the self-check passes.
- Final response must be compact and include:
  - artifact path: `architecture/design.md`;
  - linked architecture docs created, or `none`;
  - self-check command and result;
  - {{skill_compliance_line}}
  - exact next step: review `architecture/design.md`, set `approved: true` only if accepted, then run `phasedev advance`.
