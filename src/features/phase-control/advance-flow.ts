import * as path from "path";
import { Config } from "../../entities/config/config";
import { FlowState, loadFlowState, saveFlowState, locateChangeDir, ActivePhase } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { findCompletedArchiveState, findInvalidArchiveState } from "../../entities/change/archive-state";
import { validatePhaseExit } from "./phase-validators";
import { approveArtifact } from "../artifact-ops/approve-artifact";
import { resolveRoute, Route } from "./flow-route";
import { detectStateRouteConflict } from "./state-route-consistency";
import { writeFindingsBaseline } from "../../entities/validation-findings/findings-baseline";
import { setFindingsType } from "../artifact-ops/manage-findings";
import { expectedFindingsType } from "./expected-findings-type";
import { gitHeadSha } from "../../shared/shell/git";
import { recordCommitLogStart, recordIterationBoundary } from "../../entities/change/commit-log";
import { normalizeValidationState } from "./normalize-validation-state";
import { quickAdvance } from "./quick-advance";
import { AdvanceResult, commitGateBlocks } from "./advance-shared";

export type { AdvanceResult };

import {
  invalidPrdBlocker, invalidRulesBlocker, invalidResearchBlocker,
  invalidDesignBlocker, invalidPlanBlocker, validationFindingsBlocker,
  approvalBlocker,
  iterationCommitBlocker
} from "./prompt-blockers";

import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { updateIterationStatus } from "../../entities/iteration-plan/update-iteration-status";

function refuse(message: string): AdvanceResult {
  return { ok: false, advanced: false, finished: false, newState: null, message };
}

/**
 * Terminal success: the flow has finished (e.g. archive completed).
 * Returns ok:true with finished:true so an external orchestrator
 * can distinguish a clean finish from an error (refuse).
 */
function done(message: string): AdvanceResult {
  return { ok: true, advanced: false, finished: true, newState: null, message };
}

function ok(newState: FlowState, message: string, finished = false): AdvanceResult {
  return { ok: true, advanced: true, finished, newState, message };
}

const ADVANCEABLE_ROUTE_KINDS = [
  "change_intake",
  "code_research",
  "technical_design",
  "iteration_planning",
  "iteration",
  "final_validation",
  "finding_repair"
] as const;

type AdvanceableRouteKind = (typeof ADVANCEABLE_ROUTE_KINDS)[number];

/**
 * Compile-time totality proof: every Route["kind"] that routeToState does not
 * handle must be listed here explicitly. If Route gains a new kind, this
 * Record fails to typecheck (missing or excess key) until the new kind is
 * assigned to either ADVANCEABLE_ROUTE_KINDS (handled below) or this map
 * (refused before reaching routeToState) — the compiler catches a missed
 * route kind instead of only the routeToState default throwing at runtime.
 */
const NON_ADVANCEABLE_ROUTE_KIND_CHECK: Record<Exclude<Route["kind"], AdvanceableRouteKind>, true> = {
  invalid_archive_state: true,
  invalid_prd: true,
  invalid_execution_contract: true,
  change_intake_approval: true,
  invalid_code_research: true,
  invalid_technical_design: true,
  technical_design_approval: true,
  iteration_planning_approval: true,
  invalid_iteration_planning: true,
  invalid_findings: true,
  archive_readiness_blocked: true,
  archive_ready: true,
  pending_archive: true
};
void NON_ADVANCEABLE_ROUTE_KIND_CHECK;

/**
 * Map a Route kind (from resolveRoute) to a FlowState.
 *
 * | route.kind                    | activePhase           | activeIteration |
 * |-------------------------------|-----------------------|-----------------|
 * | change_intake                 | change_intake         | null            |
 * | code_research                 | code_research         | null            |
 * | technical_design              | technical_design      | null            |
 * | iteration_planning            | iteration_planning    | null            |
 * | iteration (implementation)        | implementation        | iteration.id    |
 * | iteration (iteration_validation)  | iteration_validation  | iteration.id    |
 * | final_validation              | final_validation      | null            |
 * | finding_repair                | finding_repair        | current state's activeIteration (preserved by advanceFlow, not this map) |
 */
function routeToState(route: Route): FlowState {
  switch (route.kind) {
    case "change_intake":
      return { activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 };
    case "code_research":
      return { activePhase: "code_research", activeIteration: null, repairCycleCount: 0 };
    case "technical_design":
      return { activePhase: "technical_design", activeIteration: null, repairCycleCount: 0 };
    case "iteration_planning":
      return { activePhase: "iteration_planning", activeIteration: null, repairCycleCount: 0 };
    case "iteration":
      return {
        activePhase: route.phase,
        activeIteration: route.activeIteration.id,
        repairCycleCount: 0
      };
    case "final_validation":
      return { activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 };
    case "finding_repair":
      return { activePhase: "finding_repair", activeIteration: null, repairCycleCount: 0 };
    default:
      throw new Error(
        `Unexpected route kind "${route.kind}" in routeToState. ` +
        "invalid_*, *_approval, archive_readiness_blocked, and archive_ready should be handled before reaching routeToState."
      );
  }
}

type SideEffectResult = { ok: true } | { ok: false; reason: string };

function planUpdateFailure(iterationId: number, target: "in_progress" | "completed"): SideEffectResult {
  return {
    ok: false,
    reason:
      `iteration_plan.md could not be updated: Iteration ${iterationId} heading was not flipped to ${target} ` +
      "(file missing or heading format drift). Restore the `## Iteration N: Name [ ]` heading, or run `phasedev sync-state` to non-destructively realign state.json with the artifacts, then run advance again."
  };
}

/**
 * Apply side-effects when advancing from one state to the next.
 *
 * Side effects:
 * 1. When entering implementation of a new iteration: flip not_started→in_progress.
 * 2. When leaving iteration_validation (moving to next iteration or final_validation):
 *    mark the current iteration as [x] (completed).
 *
 * Returns a failure when a required flip did not actually happen, so advance can
 * refuse instead of saving a new flow state that iteration_plan.md never caught
 * up to.
 */
function applyStateSideEffects(
  projectPath: string,
  paths: ReturnType<typeof buildChangePaths>,
  currentState: FlowState,
  nextState: FlowState,
  route: Route
): SideEffectResult {
  const planPath = paths.iterationPlanPath;

  // When entering implementation of a new iteration, flip not_started→in_progress
  // Only flip if the iteration is actually not_started — don't re-flip already
  // in_progress iterations (idempotent guard).
  if (nextState.activePhase === "implementation" && nextState.activeIteration !== null) {
    const plan = parsePlan(planPath);
    const iter = plan.find(p => p.id === nextState.activeIteration);
    if (iter && iter.status === "not_started") {
      if (!updateIterationStatus(planPath, nextState.activeIteration, "in_progress")) {
        return planUpdateFailure(nextState.activeIteration, "in_progress");
      }
    }
  }

  // When leaving iteration_validation: mark [x] only when validation actually passed.
  // This means the route transitions to the NEXT iteration (different ID) or to final_validation.
  // Do NOT mark [x] when route goes to finding_repair (repair_required verdict).
  if (
    currentState.activePhase === "iteration_validation" &&
    currentState.activeIteration !== null
  ) {
    const isNextIteration =
      route.kind === "iteration" &&
      route.activeIteration.id !== currentState.activeIteration;
    const isFinalValidation = route.kind === "final_validation";

    if (isNextIteration || isFinalValidation) {
      if (!updateIterationStatus(planPath, currentState.activeIteration, "completed")) {
        return planUpdateFailure(currentState.activeIteration, "completed");
      }
    }
  }

  return { ok: true };
}


/**
 * Main advance function: transition from the current phase to the next.
 *
 * Responsibility split across three cooperating modules:
 *
 * | Module                | Role                                                |
 * |-----------------------|-----------------------------------------------------|
 * | validatePhaseExit     | Check the CURRENT phase's output is structurally    |
 * |                       | valid and complete (exit gate). Artifact shape,     |
 * |                       | required sections, frontmatter — not routing.       |
 * | resolveRoute          | Determine the NEXT phase from artifact files on     |
 * |                       | disk. Answers "where should we go?" by scanning     |
 * |                       | artifacts, checking approvals, iteration states.    |
 * | detectStateRouteConflict | Detect when state.json (phase lock) and the    |
 * |                       | artifact-derived route disagree, preventing silent  |
 * |                       | regression below the locked phase.                  |
 * | advanceFlow (here)    | Orchestrate: run exit gates (A), run route (C),     |
 * |                       | then apply state side-effects and save (E). Stop    |
 * |                       | at approval gates, invalid artifacts, and          |
 * |                       | iteration-completion boundaries.                    |
 *
 * Algorithm:
 * 1. Load flow state. If none → refuse.
 * 2. validatePhaseExit for active phase. If not finished → refuse.
 * 3. resolveRoute():
 *    - invalid_* → refuse.
 *    - *_approval → refuse with approval prompt (or autoApprove).
 *    - archive_readiness_blocked → refuse (not every iteration completed).
 *    - archive_ready → flow is finished; `phasedev archive` owns the mutation.
 *    - else → routeToState + applyStateSideEffects + saveFlowState.
 */
export function advanceFlow(projectPath: string, config: Config, changeName?: string): AdvanceResult {
  const state = loadFlowState(projectPath, changeName);
  if (!state) {
    const completedArchive = findCompletedArchiveState(projectPath, changeName);
    if (completedArchive) {
      return done("Archive complete. Flow finished.");
    }
    return refuse("No active change. Run: phasedev create-change <name>.");
  }

  if (state.flowMode === "quick") {
    return quickAdvance(projectPath, config, state, changeName);
  }

  const changeDir = locateChangeDir(projectPath, state, changeName);
  if (!changeDir) {
    if (state.activePhase === "archive") {
      const invalid = findInvalidArchiveState(projectPath, changeName);
      if (invalid) {
        return refuse(`Archive state is invalid: ${invalid.reason} (${invalid.statePath}).`);
      }
    }
    return refuse("Cannot locate change directory for the current flow state.");
  }

  const paths = buildChangePaths(changeDir);

  const normalization = normalizeValidationState(paths, state.activePhase, config.blockingSeverity);

  // Consistency gate: the phase lock (state.json) and the artifact-derived route
  // must not point at different phases in a way that means the artifacts
  // regressed below the locked phase. Refuse rather than guess.
  const conflict = detectStateRouteConflict(state, resolveRoute(projectPath, changeName, config.blockingSeverity));
  if (conflict) {
    return refuse(conflict);
  }

  // (A) Per-phase exit gate: structural validity plus phase-completion
  // conditions. Entry conditions are resolveRoute's job (step C).
  const v = validatePhaseExit(projectPath, state.activePhase, paths, state.activeIteration, config.blockingSeverity);
  if (!v.ok) {
    return refuse(
      `Cannot leave phase "${state.activePhase}":\n${v.issues.join("\n")}`
    );
  }

  // (C) Resolve next route from files
  let route = resolveRoute(projectPath, changeName, config.blockingSeverity);

  // autoApprove: approval gates are reached only after the artifacts passed
  // validation (resolveRoute checks invalid_* first), so approving here is
  // safe. Without the flag, advance refuses below and waits for a human.
  if (config.autoApprove && route.kind.endsWith("_approval")) {
    const approvalTargets =
      route.kind === "change_intake_approval" ? [paths.prdPath, paths.executionContractPath]
      : route.kind === "technical_design_approval" ? [paths.designPath]
      : route.kind === "iteration_planning_approval" ? [paths.iterationPlanPath]
      : [];
    for (const artifactPath of approvalTargets) {
      approveArtifact(artifactPath, "PhaseDev autoApprove");
    }
    route = resolveRoute(projectPath, changeName, config.blockingSeverity);
  }

  // (C1) invalid_* → refuse with rich blocker
  if (route.kind === "invalid_prd") {
    return refuse(invalidPrdBlocker(route.paths.prdPath, route.issues, changeName).prompt);
  }
  if (route.kind === "invalid_execution_contract") {
    return refuse(invalidRulesBlocker(route.paths.executionContractPath, route.issues, changeName).prompt);
  }
  if (route.kind === "invalid_code_research") {
    return refuse(invalidResearchBlocker(route.paths.researchPath, route.issues, changeName).prompt);
  }
  if (route.kind === "invalid_technical_design") {
    return refuse(invalidDesignBlocker(route.paths.designPath, route.issues, changeName).prompt);
  }
  if (route.kind === "invalid_iteration_planning") {
    return refuse(invalidPlanBlocker(route.paths.iterationPlanPath, route.issues, changeName).prompt);
  }
  if (route.kind === "invalid_findings") {
    return refuse(validationFindingsBlocker(route.paths.findingsPath, route.issues, changeName).prompt);
  }
  // Fallback for any remaining invalid_ kind (e.g. invalid_archive_state)
  if (route.kind.startsWith("invalid_")) {
    return refuse(
      `Cannot advance: ${route.kind}. Fix artifact, rerun check, then advance.`
    );
  }

  // (C2) *_approval → refuse with rich blocker
  if (route.kind === "change_intake_approval") {
    return refuse(approvalBlocker(route.phase, "Setup Approval Required", route.paths.prdPath, "prd.md and execution_contract.md", changeName).prompt);
  }
  if (route.kind === "technical_design_approval") {
    return refuse(approvalBlocker(route.phase, "Design Approval Required", route.paths.designPath, "design.md", changeName).prompt);
  }
  if (route.kind === "iteration_planning_approval") {
    return refuse(approvalBlocker(route.phase, "Plan Approval Required", route.paths.iterationPlanPath, "iteration_plan.md", changeName).prompt);
  }
  // Fallback for any remaining *_approval kind
  if (route.kind.endsWith("_approval")) {
    return refuse(
      `Cannot advance: ${route.kind}. Run: phasedev approve <artifact> (or enable autoApprove).`
    );
  }

  // (C3) archive_readiness_blocked → refuse: not every iteration is completed
  if (route.kind === "archive_readiness_blocked") {
    return refuse(
      "Final validation reported ready, but not every iteration is completed / some " +
      "iterations still have open readiness blockers. Complete each iteration and mark " +
      "it [x] in iteration_plan.md, then run advance again."
    );
  }

  // (D) archive_ready → flow is finished; the archive mutation is owned by
  // `phasedev archive`, not by advance.
  if (route.kind === "archive_ready") {
    return done("Final validation passed. Flow complete.");
  }

  // Repair cycle guard: refuse after N consecutive repair attempts
  if (route.kind === "finding_repair" && state.repairCycleCount >= config.maxRepairCycles) {
    return refuse(
      `Repair cycle limit reached (${config.maxRepairCycles}). ` +
      "Review the findings and resolve them manually, or increase maxRepairCycles in config.yaml, then run advance again."
    );
  }

  // (E) Normal phase transition
  const routedState = routeToState(route);

  // routeToState always clears activeIteration for finding_repair (it has no
  // route-derived iteration of its own). Carry over the current state's
  // activeIteration instead, so the repaired iteration survives the repair
  // cycle: entering repair from iteration_validation preserves N, and staying
  // in repair keeps the value equal so the same-state guard below still fires.
  const nextState: FlowState =
    routedState.activePhase === "finding_repair"
      ? { ...routedState, activeIteration: state.activeIteration }
      : routedState;

  // Refuse honestly instead of saving an identical state and reporting
  // "Advanced": the route still resolves to the current phase, so the phase
  // work is not finished (e.g. iteration validation passed but the iteration
  // is not marked [x] in iteration_plan.md, or implementation tasks remain).
  if (
    nextState.activePhase === state.activePhase &&
    nextState.activeIteration === state.activeIteration
  ) {
    const iterNote = state.activeIteration ? ` (iter ${state.activeIteration})` : "";
    return refuse(
      `Nothing to advance: flow still resolves to ${state.activePhase}${iterNote}. ` +
      "Complete the current phase output first (for iteration_validation: mark the iteration [x] in iteration_plan.md when the verdict allows it), then run advance again."
    );
  }

  // maxIterations guard: the resolved route targets an iteration beyond
  // the configured limit. Refuse rather than silently overflowing.
  if (route.kind === "iteration" && route.activeIteration.id > config.maxIterations) {
    return refuse(
      `Max iterations (${config.maxIterations}) reached. ` +
      `Route targets iteration ${route.activeIteration.id}. ` +
      `Increase maxIterations in config.yaml or mark the remaining iterations as not_started.`
    );
  }

  // Passing exit from iteration_validation: the exact condition applyStateSideEffects
  // uses to mark the iteration [x] below — route moved to final_validation, or to the
  // next iteration. Placed here (after the maxIterations guard, before any state
  // mutation) so finding_repair entries (repair_required verdict) are never gated.
  const leavingIterationValidation =
    state.activePhase === "iteration_validation" && state.activeIteration !== null;
  const iterationValidationPassed =
    leavingIterationValidation &&
    (route.kind === "final_validation" ||
      (route.kind === "iteration" && route.activeIteration.id !== state.activeIteration));

  if (iterationValidationPassed && commitGateBlocks(projectPath, config)) {
    const iter = parsePlan(paths.iterationPlanPath).find(p => p.id === state.activeIteration);
    return refuse(
      iterationCommitBlocker(
        state.activeIteration as number,
        iter?.name ?? "",
        path.basename(changeDir),
        changeName
      ).prompt
    );
  }

  const sideEffect = applyStateSideEffects(projectPath, paths, state, nextState, route);
  if (!sideEffect.ok) {
    return refuse(`Cannot advance: ${sideEffect.reason}`);
  }

  // Invariant T: on entering a validation phase, validation_findings.md's `type`
  // must match that phase (iteration_validation -> iteration, final_validation ->
  // final). Idempotent; no-op when the file is absent. Other phases (finding_repair,
  // quick_*) are left untouched so the repaired->final branch keeps type: final.
  const enteredType = expectedFindingsType(nextState.activePhase);
  if (enteredType) {
    setFindingsType(paths.findingsPath, enteredType);
  }

  // Snapshot the findings table as the repair-gate baseline whenever entering
  // a phase that reads or writes validation_findings.md, so later gates diff
  // against what the validator/repairer produced, not a stale earlier pass.
  const BASELINE_PHASES: ReadonlySet<ActivePhase> = new Set(["iteration_validation", "final_validation", "finding_repair"]);
  if (BASELINE_PHASES.has(nextState.activePhase)) {
    writeFindingsBaseline(paths.findingsPath, paths.findingsBaselinePath);
  }

  // Preserve repair cycle count through repair↔validation cycles.
  // Increment when entering repair. Keep the count when stepping back to
  // validation for re-checking. Reset only on true forward progress.
  const enteringRepair = nextState.activePhase === "finding_repair";
  const leavingRepair = state.activePhase === "finding_repair";
  const goingToValidation = nextState.activePhase === "iteration_validation" || nextState.activePhase === "final_validation";

  let nextRepairCount: number;
  if (enteringRepair) {
    nextRepairCount = state.repairCycleCount + 1;
  } else if (leavingRepair && goingToValidation) {
    nextRepairCount = state.repairCycleCount;
  } else {
    nextRepairCount = 0;
  }
  const finalNextState = { ...nextState, repairCycleCount: nextRepairCount };
  saveFlowState(projectPath, finalNextState, changeName);

  if (finalNextState.activePhase === "implementation") {
    const head = gitHeadSha(projectPath);
    if (head) recordCommitLogStart(paths.commitLogPath, head);
  }
  if (iterationValidationPassed) {
    const head = gitHeadSha(projectPath);
    if (head) recordIterationBoundary(paths.commitLogPath, state.activeIteration as number, head);
  }

  const iterSuffix = finalNextState.activeIteration
    ? ` (iter ${finalNextState.activeIteration})`
    : "";
  return ok(
    finalNextState,
    `Advanced to ${finalNextState.activePhase}${iterSuffix}.` +
      (normalization.changed ? ` ${normalization.notes.join(" ")}` : "")
  );
}
