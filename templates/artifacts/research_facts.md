# Research Facts

<!--
Authoring instructions for the research agent:
- Instantiate this template into the active change directory as research_facts.md.
- Do not create or update a project-root research_facts.md file.
- Remove every HTML comment from the final research_facts.md.
- Keep exactly one visible top-level title: # Research Facts.
- The final research_facts.md may contain only the # Research Facts title and the four ## sections shown below, in this exact order.
- Do not add other ## sections.
- Do not add ### or deeper headings.
- Do not write TBD, TODO, unknown, clarify later, or to be decided.
- Every table cell is required and must be non-empty, including Notes.
- Code evidence is primary. Specs are context and cannot confirm actual implementation behavior by themselves.
- `F#` is only for code, config, tests, or runtime wiring facts.
- `S#` is only for facts from `.phasedev/specs`.
- `prd-only` is allowed only in PRD Intent Trace Evidence for intent fields that are not repository facts.
- If `.phasedev/specs` is absent, use `none` or `not_applicable` in Spec Context without placeholder prose.
- Source Facts Supports must use R#/SC#; do not use none/not_applicable.
- In Research Gaps & Blockers, explicitly declare any remaining unresolved gaps or disputed facts.
-->

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type |  | not_applicable | prd-only | Classification comes from PRD intent. |
| Why |  | not_applicable | prd-only | Rationale comes from PRD intent. |
| Target state | Requested target from PRD. | limited | F1 | Current implementation partially supports the requested target; F1 records what exists and what does not yet fully support the target. |
| Risk boundaries | Requested risk boundary from PRD. | limited | F2 | Current tests or configuration partially cover this boundary; F2 records current enforcement gaps without claiming target completion. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | S1 | none |
| SC1 | limited | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | `src/file.ts:42` | Current implementation does X. | R1 |
| F2 | code | `test/file.test.ts:12` | Tests verify behavior X. | SC1 |
| S1 | spec | `.phasedev/specs/foo/spec.md:12` | Existing spec describes capability Y. | R1 |

## Research Gaps & Blockers

No non-blocking gaps.
