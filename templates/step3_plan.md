Stage 3. Plan.

Your task is to decompose the approved technical design into a step-by-step implementation plan.

{{skill_policy}}

Input artifacts (you must read them):
- PRD intent, requirements, and success criteria: [prd.md]({{prd_path}})
- Approved design: [design.md]({{design_path}})
- Development rules: [rules.md]({{rules_path}})

## Context retrieval protocol

Use this bounded retrieval order before planning:
1. Read this prompt and the embedded Artifact Build Contract first so the output shape is fixed before analysis.
2. Confirm that [prd.md]({{prd_path}}), [design.md]({{design_path}}), and [rules.md]({{rules_path}}) exist and are readable. If any required input is missing or unreadable, report `Missing required input artifact: <exact linked path>` and stop without creating or partially writing `implementation_plan.md`.
3. Read [prd.md]({{prd_path}}), [design.md]({{design_path}}), and [rules.md]({{rules_path}}) completely when they are reasonably sized. Verify that `prd.md` and `design.md` have `approved: true`; if either is not approved, report the route inconsistency and do not create `implementation_plan.md`.
4. Extract `Intent`, `Target state`, `Risk boundaries`, every `R#`, every `SC#`, each `SC#` Evidence type, and every relevant approved `D#`.
5. If configured/router skills apply, use their method after the stage contract is understood and map their output back into the embedded implementation plan template only.
6. Inspect repository files only to answer a concrete planning question about phase boundaries, change surface, checks, or sequencing. Prefer targeted `rg` searches and open only the smallest set of files needed to confirm the answer.

Context budget and stop condition:
- Start with approved PRD, approved design, rules, and active change paths; do not broad-scan the repository by default.
- For repository evidence, use at most 2-4 broad file listings/searches total as a soft cap, then focused searches for concrete identifiers, modules, commands, or paths named by PRD/design/rules.
- Stop retrieval when every `R#`, `SC#`, Evidence type, relevant `D#`, and risk boundary can be mapped to at least one phase, expected change surface row, task, and check, or once a material PRD/design realignment blocker is identified.
- Do not inspect `config.yaml`, framework template files, generated prompt output, or unrelated project areas unless an approved input explicitly requires that evidence.

Planning instructions:
1. Use the Artifact Build Contract below as the only source of structure for [implementation_plan.md]({{plan_path}}).
2. Create the implementation plan file: [implementation_plan.md]({{plan_path}}), filling that template for the current change.
3. Apply the contract's canonical fill rules for comments, placeholders, status values, trace IDs, review formatting, and machine-readable fields.
4. Split implementation into sequential autonomous phases:
   - every phase, including the only phase, goes through `Implementation -> Phase Validation`;
   - after successful Phase Validation for all phases, the flow proceeds to `Final Validation`;
   - each phase must fit fully into one AI-agent working session without context overflow;
   - the optimal phase size is a 3-10 file change; do not artificially split a small change.
5. The plan must trace `Intent` from [prd.md]({{prd_path}}):
   - phase sequencing must cover every `R#`, every `SC#`, and every relevant approved design decision `D#`;
   - checks must cover each `SC#` according to its PRD `Evidence` type;
   - risk boundaries must be represented in the generated plan.
6. The plan must not introduce work that is not grounded in `Target state`, a concrete `R#`, a concrete `SC#`, or `Risk boundaries` from the PRD.
7. Stop for user realignment only when bounded planning evidence reveals a material PRD/design contradiction, missing approval authority, a public contract or risk-boundary decision the approved inputs do not authorize, or an impossible-to-name required check. Do not stop for low-level implementation details that do not change approval scope; make the smallest conservative scoped planning assumption and record it with concrete trace IDs.

{{implementation_plan_artifact_contract}}

## Uncertainty decision flow

Prefer a complete, approvable plan when approved inputs support one:
1. If the phase, task, check, or change-surface choice is directly supported by approved PRD/design/rules, make the planning decision and map it to concrete `R#`, `SC#`, and `D#` IDs.
2. If a detail is missing but does not change approval scope, PRD semantics, approved design decisions, public contracts, risk boundaries, phase ordering, or required checks, choose the smallest conservative planning assumption and record it in an existing `Approval Summary`, `Phase Overview`, or phase-local field with concrete trace IDs.
3. If the missing answer would change what the user is approving, expand scope, contradict approved PRD/design, weaken a risk boundary, change a public contract, or make required checks impossible to name, ask the user and stop before writing or finalizing `implementation_plan.md`.
4. Do not write pending material questions into `implementation_plan.md` as a substitute for asking the user. Do not encode assumptions or deferred decisions unless they are grounded in approved design and concrete PRD rows.

## Artifact self-check

After creating `implementation_plan.md`, immediately validate the new artifact before completing the stage:

```bash
{{self_check_command}}
```

If the check fails, fix the reported artifact issues in this same stage, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `implementation_plan.md` until this self-check passes.

If the `phasedev` executable name is unavailable, first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route plan_approval` subcommand, such as a repository-confirmed `npm exec -- phasedev check --project-path ... --expect-route plan_approval`, `bunx phasedev check --project-path ... --expect-route plan_approval`, or local CLI invocation like `bun run src/cli.ts check --project-path ... --expect-route plan_approval` when package/source entrypoint evidence supports it. Use an equivalent executable only when repository evidence or controller output identifies it; record the exact command used. If no equivalent executable is available after this documented lookup, report the exact command failure as a blocker/unavailable self-check result and do not report the plan as ready.

Stage completion:
- After writing `implementation_plan.md`, run the artifact self-check, fix any reported issues, and stop only after the self-check passes.
- Final response must use this compact template and include no extra sections:
  - `Plan ready: implementation_plan.md`
  - `Plan path: {{plan_path}}`
  - `Self-check: <exact command> -> <result>`
  - `Skill compliance: <configured/router skills used; skipped/unavailable skills>`
  - `Next: review implementation_plan.md, set approved: true and approved_by: "<your name>" only if accepted, then run phasedev next.`

## Artifact allowlist

Allowed persistent artifacts for this stage:
- active change folder `implementation_plan.md` at the Artifact Build Contract Output path
