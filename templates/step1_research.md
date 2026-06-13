Stage 1. Research.

Stage contract: create the factual basis for the design stage.

{{skill_policy}}

Input artifacts:
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Test command rules: [rules.md]({{rules_path}})
- Existing project specs: [openspec/specs]({{project_specs_path}})

Output artifact:
- [research_facts.md]({{research_path}})

Use the Artifact Build Contract below as the only source of structure for `research_facts.md`.

{{research_artifact_contract}}

Requirements for `research_facts.md`:
- Source priority:
  1. actual implementation in code, config, tests, and runtime wiring;
  2. existing specifications in `openspec/specs`;
  3. `prd.md` and `rules.md` as the contract for the current change.
- Read `openspec/specs` if that folder exists. Use it to identify already documented capabilities, domain terms, existing spec areas, and likely future archive/spec-sync targets.
- Code evidence determines the final research status. Specs provide documented context, but cannot confirm actual implementation behavior by themselves.
- If code and specs conflict, treat code as current truth and record specs as documented context or stale/conflicting context.
- Do not conclude that the project actually supports a capability only because it appears in specs.
- include confirmed facts relevant to `Intent`, `Target state`, `Risk boundaries`, `R#` requirements, `SC#` success criteria, and `Evidence` types from `prd.md`;
- include a dedicated `## PRD Intent Trace` section with exactly `Change type`, `Why`, `Target state`, and `Risk boundaries`;
- include a dedicated trace for each `R#` and `SC#` in `## Requirements & Success Criteria Trace`: state which code facts confirm, limit, or block the concrete requirement/criterion, and record spec context separately;
- include file paths and line numbers for every `F#` and `S#` in `## Source Facts`;
- include affected modules, public interfaces, dependencies, existing contracts, and constraints;
- include similar existing solutions if found;
- include only spec facts that affect `Intent`, `R#`, `SC#`, evidence type, risk boundaries, or future spec-sync context;
- Do not copy large spec excerpts.
- Do not perform a standalone spec audit.
- if research facts show that approved `Intent`, `Target state`, `Risk boundaries`, a specific `R#`, a specific `SC#`, or an `Evidence` type is incomplete, contradictory, or infeasible, do not turn that into a design assumption. Stop, report a PRD blocker to the user, and identify which PRD fields/IDs must be realigned;
- explicitly marked unresolved gaps or disputed facts are allowed only for non-blocking research gaps in `## Research Gaps & Blockers`; if they affect `Target state`, `Risk boundaries`, requirements, success criteria, or evidence type, they are blockers, not ordinary gaps;
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
