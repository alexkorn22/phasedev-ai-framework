# State Sync After Feedback Scope Change — Design Spec

Date: 2026-07-10
Status: approved design, pending implementation plan

## Problem

When `phasedev feedback` output is executed as a scope change, the agent (per `templates/feedback.md`) edits `prd.md` and flips `approved: false` on the artifacts it changed — but nothing updates `state.json.activePhase`, and nothing keeps downstream artifacts consistent. The next `phasedev advance`/`phase` hits `detectStateRouteConflict` (`src/features/phase-control/state-route-consistency.ts:31-46`) because the artifact-derived route (via `resolveRoute`) now resolves to a strictly lower-ranked phase (e.g. `change_intake`) than the locked `state.json` phase (e.g. `iteration_validation`), and the flow is BLOCKED.

Three concrete defects:

1. **Dangerous recovery hint.** The BLOCKED message suggests "reset state.json (phasedev reset-change)", but `reset-change` does not reset state — it moves the entire change directory to `.phasedev/changes/.trash` (`src/features/flow-state/reset-change.ts`), destroying PRD/design/plan/findings. Following the hint loses all work.
2. **No non-destructive rollback.** There is no way to move `activePhase` back to `change_intake`/`code_research`: `phasedev reopen` supports only `design` and `plan` targets (`src/features/phase-control/reopen-phase.ts`).
3. **Hidden cascade from stale `research_facts.md`.** `feedback` edits the PRD but never touches `research_facts.md`, which has a hard validation dependency on the PRD (verbatim Intent values for Target state / Risk boundaries, plus full R#/SC# trace — `src/entities/research-facts/validate-research.ts`). The route therefore collapses to `code_research`, and recovery gets stuck sequentially at each stale downstream artifact (research facts, then iteration plan with invalid Check Evidence enums, …) before converging with `state.json`.

## Decisions (agreed with the user)

1. Resolve the desync with an **explicit non-destructive command** (`phasedev sync-state`), not a silent auto-rollback inside `advance`/`phase` — the conflict check keeps its safety role for accidentally corrupted artifacts.
2. The `feedback` template must make the agent **cascade-check every downstream artifact** when the PRD changes (execution contract, research facts, design, iteration plan): check whether each is affected, update only the ones that are.
3. Of the two side observations, only the **uninformative `--change` message outside a phasedev project** is in scope. The transient list/`--change` "Unknown change" write race is deferred to a separate task.

## 1. New command: `phasedev sync-state`

New feature module `src/features/phase-control/sync-state.ts`, wired into `src/cli.ts` and `help` output. Accepts the standard `--project-path`/`--change` options.

Behavior:

- Load `state.json` (`loadFlowState`) and compute the artifact-derived route via the existing `resolveRoute`.
- If `PHASE_RANK[route.phase] >= PHASE_RANK[state.activePhase]` (same ranking as `detectStateRouteConflict`): print that `state.json` is already consistent and write nothing.
- Otherwise, non-destructively rewrite `state.json` via `saveFlowState` to `{ activePhase: <route.phase>, activeIteration: null, repairCycleCount: 0 }`, delete `.findings-baseline.json` in the change directory (mirroring `reopen`, so a stale baseline does not reject legitimate rework), and print the transition, e.g. `activePhase: iteration_validation -> change_intake`.
- No artifacts are touched or removed. No `--yes` confirmation is required: the operation is reversible by walking the phases forward again.
- Supports `--json` like other commands.
- Documented in the README command tables (Flow Control section); the `reset-change` row gains a warning that it discards the whole change and is not a state reset.

## 2. BLOCKED message rewording (`state-route-consistency.ts`)

Replace the recovery line. The mention of `reset-change` is removed entirely so an agent cannot pick the destructive path. New recovery line (by meaning):

> Recovery: restore the stale artifact, or run `phasedev sync-state` to non-destructively roll state.json back to "<artifact-derived phase>", then retry.

## 3. `templates/feedback.md` — cascading artifact consistency check

Extend the "Scope / design / plan feedback" branch. When the feedback is a scope change, the agent must walk the artifact chain **in phase order** and for each artifact check consistency with the updated PRD:

1. `prd.md` — apply the scope change itself.
2. `execution_contract.md` — check whether the contract is affected; update if so.
3. `research_facts.md` — mandatory trace sync: copy the new Intent values verbatim into the PRD Intent Trace, and reconcile the Requirements & Success Criteria Trace with the new set of PRD R#/SC# IDs so `validate-research` passes. New requirements without researched facts are honestly researched at this step.
4. `architecture/design.md` — check whether the design covers the new/changed requirements; update if not (design validation hard-depends on prd.md and research_facts.md, so this step must follow step 3).
5. `iteration_plan.md` — check whether the plan reflects the changes (including valid Check Evidence enums); update if not (plan validation hard-depends on prd.md and design.md).
6. **Findings and iteration statuses** — the route re-enters the implementation tier through the old `validation_findings.md` and plan statuses (`flow-route.ts:138-150, 233`), so:
   - review open findings and resolve the ones obsoleted by the scope change via `phasedev resolve-finding <id> --evidence "obsoleted by scope change: <reason>"` (never hand-edit `validation_findings.md` — existing rule preserved);
   - reset the status of completed iterations invalidated by the scope change via `phasedev set-iteration-status`, so their rework is actually scheduled.

Rules:

- **Check first, change only what is actually affected.** Artifacts untouched by the scope change stay approved.
- `approved: false` is set on every artifact actually changed (existing template rule, preserved).
- **Self-verification loop:** after updating each artifact, run `phasedev validate-artifact` for it and fix the reported issues until clean — validator messages state the exact expected values (verbatim Intent copies, missing/unexpected PRD IDs), so the agent iterates against concrete errors instead of guessing.
- After the cascade, the agent runs `phasedev sync-state` so `state.json` immediately agrees with the artifacts, and only then the final `phasedev check` (this order matters: `check` would otherwise report the state/route conflict). The existing prohibition on running `phasedev advance` from the feedback flow remains.

Effect: the phase rolls back exactly to the earliest genuinely changed artifact instead of collapsing through forgotten dependencies — `approved: false` on prd.md fails `isSetupApproved` and routes to `change_intake_approval`; a design-only change routes to `technical_design_approval`; and the flow converges forward through the normal approve → advance steps.

## 4. `--change` message outside a phasedev project

In the change-resolution path (`resolveChangeDir` in `src/entities/change/active-change.ts` / `UnknownChangeError` handling in `src/cli.ts`): when `<projectPath>/.phasedev` does not exist, the error becomes:

> No .phasedev directory found at \<path\>. Run from the project root or pass --project-path.

instead of `Unknown change "…". Available changes: none.`

## 5. Orchestrator skill updates (`skills/phasedev-orchestrator/SKILL.md`)

The orchestrator playbook must know the new command and the feedback recovery flow:

- **Command list** ("Commands the orchestrator runs" section): add `phasedev sync-state [--change <change>]` — non-destructive rollback of `state.json.activePhase` to the artifact-derived phase; explicitly note it is the correct fix for the state/route BLOCKED conflict, and that `reset-change` must NEVER be used for that (it trashes the whole change).
- **User Feedback Handling, delegated path:** after the feedback sub-agent returns, the existing rule already runs `phasedev check`. Add a deterministic safety net: if `check` reports the "state.json and the change artifacts disagree" conflict (the sub-agent forgot to run `sync-state`), the orchestrator runs `phasedev sync-state --change <change>` itself — no sub-agent, no `reset-change` — then re-runs `phasedev check` and continues the loop from the resulting state.
- **Expectation note in the same section:** after a scope change the loop legitimately resumes from an earlier phase (approval gates for the re-edited artifacts); this is normal convergence, not a failure.

## 6. Tests

- Unit tests for `sync-state`: conflict present (state rewritten, baseline deleted, transition printed), no conflict (no write), `--json` shape.
- Update any tests asserting the old BLOCKED recovery text.
- Test for the new missing-`.phasedev` message.
- Focused tests first, then full `bun test` + `npm run typecheck`.

## Frozen contracts

No frozen contract changes: `state.json` shape, phase routing, and YAML keys are untouched. The `feedback.md` template change is an intentional wording/behavior update explicitly requested by the user in this conversation.

## Out of scope

- The transient list/`--change` "Unknown change" error during a change-directory write race (needs separate reproduction).
- Extending `phasedev reopen` to more phases (superseded by `sync-state`).
