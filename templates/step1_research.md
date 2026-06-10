Stage 1. Research.

Stage contract: create the factual basis for the design stage.

{{skill_policy}}

Input artifacts:
- PRD requirements and ADLC-style Intent Card: [prd.md]({{prd_path}})
- Development rules: [rules.md]({{rules_path}})

Output artifact:
- [research_facts.md]({{research_path}}) (must be initialized from the template: [research_facts.md template]({{research_template_path}}))

Requirements for `research_facts.md`:
- `research_facts.md` must be created strictly from [research_facts.md template]({{research_template_path}}). All HTML comments must be removed.
- include confirmed facts relevant to `R#` requirements, `SC#` success criteria, `Intent Card`, `Resolution signal`, `Risk envelope`, scope boundaries, `Accepted Assumptions`, and `Deferred Decisions` from `prd.md`;
- include a dedicated `## PRD Intent Trace` section that briefly records `Change type`, `User or business intent`, `Generation target`, `Resolution signal`, `Decision deadline`, `Risk envelope`, `Accepted Assumptions`, `Deferred Decisions`, and which parts of the research confirm, limit, or call those fields into question;
- include a dedicated trace for each `R#` and `SC#` in `## Requirements & Success Criteria Trace`: state which research facts confirm, limit, or block the concrete requirement/criterion;
- include file paths and line numbers for codebase facts in `## Source Facts`;
- include affected modules, public interfaces, dependencies, existing contracts, and constraints;
- include similar existing solutions if found;
- if research facts show that the approved PRD intent, generation target, a specific `R#`, a specific `SC#`, accepted assumptions, or risk envelope is incomplete, contradictory, or infeasible, do not turn that into a design assumption. Stop, report a PRD blocker to the user, and identify which PRD fields/IDs must be realigned;
- explicitly marked unknown or disputed areas are allowed only for non-blocking research gaps in `## Research Gaps & Blockers`; if they affect `Resolution signal`, `Risk envelope`, scope boundaries, or success criteria, they are blockers, not ordinary unknowns;
- do not include architecture decisions, implementation proposals, or refactoring proposals.

## Artifact self-check

After creating `research_facts.md`, immediately validate the new artifact before completing the stage:

```bash
{{self_check_command}}
```

If the check fails, fix the reported artifact issues in this same stage, then rerun the same command. Repeat until it exits successfully. Do not report research as ready until this self-check passes.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `research_facts.md`

Stage completion:
- After writing `research_facts.md`, run the artifact self-check, fix any reported issues, and stop only after the self-check passes.
- Tell the user that research is ready and the next transition is run through `flow next`.
