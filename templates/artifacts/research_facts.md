# Research Facts

<!--
Authoring instructions for the research agent:
- Instantiate this template into the change directory as research_facts.md.
- Remove every HTML comment from the final research_facts.md.
- Keep exactly one visible top-level title: # Research Facts.
- The final research_facts.md may contain only the # Research Facts title and the four ## sections shown below, in this exact order.
- Do not add other ## sections.
- Do not add ### or deeper headings.
- Do not write TBD, TODO, unknown, clarify later, or to be decided.
- Code evidence is primary. Specs are context and cannot confirm actual implementation behavior by themselves.
- `F#` is only for code, config, tests, or runtime wiring facts.
- `S#` is only for facts from `openspec/specs`.
- `prd-only` is allowed only in PRD Intent Trace Evidence for intent fields that are not repository facts.
- If `openspec/specs` is absent, use `none` or `not_applicable` in Spec Context without placeholder prose.
- In Research Gaps & Blockers, explicitly declare any remaining unresolved gaps or disputed facts.
-->

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type |  | not_applicable | prd-only |  |
| Why |  | not_applicable | prd-only |  |
| Target state |  | confirmed | F1 |  |
| Risk boundaries |  | confirmed | F2 |  |

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
| S1 | spec | `openspec/specs/foo/spec.md:12` | Existing spec describes capability Y. | R1 |

## Research Gaps & Blockers

No non-blocking gaps.
