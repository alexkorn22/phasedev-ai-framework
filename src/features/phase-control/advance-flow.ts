import * as fs from "fs";
import * as path from "path";
import { Config } from "../../entities/config/config";
import { FlowState, loadFlowState, saveFlowState, locateChangeDir, ActivePhase } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { findPendingArchiveState, createArchiveState, readArchiveState } from "../../entities/change/archive-state";
import { validatePhase } from "./phase-validators";
import { resolveRoute, Route } from "./flow-route";
import { startArchiveStage } from "./archive-stage";

import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { updateIterationStatus } from "../../entities/iteration-plan/update-iteration-status";

export interface AdvanceResult {
  ok: boolean;
  advanced: boolean;
  finished: boolean;
  newState: FlowState | null;
  message: string;
}

function refuse(message: string): AdvanceResult {
  return { ok: false, advanced: false, finished: false, newState: null, message };
}

function ok(newState: FlowState, message: string, finished = false): AdvanceResult {
  return { ok: true, advanced: true, finished, newState, message };
}

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
 * | finding_repair                | finding_repair        | null            |
 * | pending_archive               | archive               | null            |
 */
function routeToState(route: Route): FlowState {
  switch (route.kind) {
    case "change_intake":
      return { activePhase: "change_intake", activeIteration: null };
    case "code_research":
      return { activePhase: "code_research", activeIteration: null };
    case "technical_design":
      return { activePhase: "technical_design", activeIteration: null };
    case "iteration_planning":
      return { activePhase: "iteration_planning", activeIteration: null };
    case "iteration":
      return {
        activePhase: route.phase,
        activeIteration: route.activeIteration.id
      };
    case "final_validation":
      return { activePhase: "final_validation", activeIteration: null };
    case "finding_repair":
      return { activePhase: "finding_repair", activeIteration: null };
    case "pending_archive":
      return { activePhase: "archive", activeIteration: null };
    default:
      throw new Error(
        `Unexpected route kind "${(route as any).kind}" in routeToState. ` +
        "invalid_*, *_approval, archive_readiness_blocked, and archive_ready should be handled before reaching routeToState."
      );
  }
}

/**
 * Apply side-effects when advancing from one state to the next.
 *
 * Side effects:
 * 1. When entering implementation of a new iteration: flip not_started→in_progress.
 * 2. When leaving iteration_validation (moving to next iteration or final_validation):
 *    mark the current iteration as [x] (completed).
 */
function applyStateSideEffects(
  projectPath: string,
  paths: ReturnType<typeof buildChangePaths>,
  currentState: FlowState,
  nextState: FlowState,
  route: Route
): void {
  const planPath = paths.iterationPlanPath;

  // When entering implementation of a new iteration, flip not_started→in_progress
  // Only flip if the iteration is actually not_started — don't re-flip already
  // in_progress iterations (idempotent guard).
  if (nextState.activePhase === "implementation" && nextState.activeIteration !== null) {
    const plan = parsePlan(planPath);
    const iter = plan.find(p => p.id === nextState.activeIteration);
    if (iter && iter.status === "not_started") {
      updateIterationStatus(planPath, nextState.activeIteration, "in_progress");
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
      updateIterationStatus(planPath, currentState.activeIteration, "completed");
    }
  }
}

/**
 * Handle advance when the current phase is 'archive'.
 * Checks .phase-archive.json status.
 */
function handleArchiveAdvance(projectPath: string, changeDir: string): AdvanceResult {
  const archiveState = readArchiveState(changeDir);
  if (!archiveState || archiveState.status !== "completed") {
    return refuse(
      "Archive not complete: finish delta specs and set .phase-archive.json status=completed."
    );
  }

  // Archive complete; flow is done
  return ok(
    { activePhase: "archive", activeIteration: null },
    "Archive complete. Flow finished.",
    true
  );
}

/**
 * Main advance function.
 *
 * Algorithm:
 * 1. Load flow state. If none → refuse.
 * 2. validatePhase for active phase. If invalid → refuse.
 * 3. If activePhase === "archive" → handleArchiveAdvance.
 * 4. resolveRoute():
 *    - invalid_* → refuse.
 *    - *_approval → refuse with approval prompt.
 *    - archive_readiness_blocked → refuse.
 *    - archive_ready → if runArchiveStage → mutate, else refuse.
 *    - else → routeToState + applyStateSideEffects + saveFlowState.
 */
export function advanceFlow(projectPath: string, config: Config): AdvanceResult {
  const state = loadFlowState(projectPath);
  if (!state) {
    return refuse("No active change. Run: phasedev create-change <name>.");
  }

  const changeDir = locateChangeDir(projectPath, state);
  if (!changeDir) {
    return refuse("Cannot locate change directory for the current flow state.");
  }

  const paths = buildChangePaths(changeDir);

  // (A) Per-phase validation
  const v = validatePhase(projectPath, state.activePhase, paths, state.activeIteration);
  if (!v.ok) {
    return refuse(
      `Active phase "${state.activePhase}" artifacts invalid:\n${v.issues.join("\n")}`
    );
  }

  // (B) Archive special case
  if (state.activePhase === "archive") {
    return handleArchiveAdvance(projectPath, changeDir);
  }

  // (C) Resolve next route from files
  const route = resolveRoute(projectPath);

  // (C1) invalid_* → refuse (invalid_findings already starts with "invalid_")
  if (route.kind.startsWith("invalid_")) {
    return refuse(
      `Cannot advance: ${route.kind}. Fix artifact, rerun check, then advance.`
    );
  }

  // (C2) *_approval → refuse
  if (route.kind.endsWith("_approval")) {
    return refuse(
      `Cannot advance: ${route.kind}. Run: phasedev approve <artifact> (or enable autoApprove).`
    );
  }

  // (C3) archive_readiness_blocked → refuse
  if (route.kind === "archive_readiness_blocked") {
    return refuse(
      "Cannot advance: not all iterations are [x]. Complete validation for each iteration."
    );
  }

  // (D) archive_ready → mutate archive
  if (route.kind === "archive_ready") {
    if (!config.runArchiveStage) {
      return refuse("Archive is disabled (runArchiveStage=false).");
    }

    // startArchiveStage moves the change dir and creates .phase-archive.json.
    // We still need to update state.json activePhase.
    startArchiveStage(projectPath, changeDir, new Date(), config);

    // After archive, state.json moves with the change dir. Update activePhase.
    const newState: FlowState = { activePhase: "archive", activeIteration: null };
    saveFlowState(projectPath, newState);

    return ok(
      newState,
      "Advanced to archive phase. Run: phasedev phase for the archive contract."
    );
  }

  // (E) Normal phase transition
  const nextState = routeToState(route);
  applyStateSideEffects(projectPath, paths, state, nextState, route);
  saveFlowState(projectPath, nextState);

  const iterSuffix = nextState.activeIteration
    ? ` (iter ${nextState.activeIteration})`
    : "";
  return ok(
    nextState,
    `Advanced to ${nextState.activePhase}${iterSuffix}.`
  );
}
