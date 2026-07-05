import * as fs from "fs";
import * as path from "path";
import { Config } from "../../entities/config/config";
import { FlowState, loadFlowState, saveFlowState, locateChangeDir, ActivePhase } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { findInvalidArchiveState } from "../../entities/change/archive-state";
import { validatePhaseExit } from "./phase-validators";
import { approveArtifact } from "../artifact-ops/approve-artifact";
import { resolveRoute, Route } from "./flow-route";
import { startArchiveStage } from "./archive-stage";
import { detectStateRouteConflict } from "./state-route-consistency";

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

const ADVANCEABLE_ROUTE_KINDS = [
  "change_intake",
  "code_research",
  "technical_design",
  "iteration_planning",
  "iteration",
  "final_validation",
  "finding_repair",
  "pending_archive"
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
  archive_ready: true
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
      "(file missing or heading format drift). Restore the `## Iteration N: Name [ ]` heading, or reset state.json, then run advance again."
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
 * Main advance function.
 *
 * Algorithm:
 * 1. Load flow state. If none → refuse.
 * 2. validatePhaseExit for active phase. If the phase is not finished → refuse.
 * 3. If activePhase === "archive" → flow is finished (exit gate already passed).
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
    if (state.activePhase === "archive") {
      const invalid = findInvalidArchiveState(projectPath);
      if (invalid) {
        return refuse(`Archive state is invalid: ${invalid.reason} (${invalid.statePath}).`);
      }
    }
    return refuse("Cannot locate change directory for the current flow state.");
  }

  const paths = buildChangePaths(changeDir);

  // Consistency gate: the phase lock (state.json) and the artifact-derived route
  // must not point at different phases in a way that means the artifacts
  // regressed below the locked phase. Refuse rather than guess.
  const conflict = detectStateRouteConflict(state, resolveRoute(projectPath));
  if (conflict) {
    return refuse(conflict);
  }

  // (A) Per-phase exit gate: structural validity plus phase-completion
  // conditions. Entry conditions are resolveRoute's job (step C).
  const v = validatePhaseExit(projectPath, state.activePhase, paths, state.activeIteration);
  if (!v.ok) {
    return refuse(
      `Cannot leave phase "${state.activePhase}":\n${v.issues.join("\n")}`
    );
  }

  // (B) Archive special case: the exit gate (checkArchiveCompletion via
  // validatePhaseExit) already refused unless .phase-archive.json says
  // completed, so reaching here means the flow is done.
  if (state.activePhase === "archive") {
    return ok(
      { activePhase: "archive", activeIteration: null },
      "Archive complete. Flow finished.",
      true
    );
  }

  // (C) Resolve next route from files
  let route = resolveRoute(projectPath);

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
    route = resolveRoute(projectPath);
  }

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

    // startArchiveStage creates .phase-archive.json, writes activePhase:"archive"
    // into state.json, then moves the change dir — so the phase lock travels with
    // the directory. It returns a blocker (without moving anything) when the
    // mutation cannot run, e.g. the date-prefixed archive target already exists.
    const archiveResult = startArchiveStage(projectPath, changeDir, new Date(), config);
    if (archiveResult.blocked) {
      return refuse(`Cannot advance to archive: ${archiveResult.reason ?? "archive mutation blocked"}.\n${archiveResult.prompt}`);
    }

    const newState: FlowState = { activePhase: "archive", activeIteration: null };

    return ok(
      newState,
      "Advanced to archive phase. Run: phasedev phase for the archive contract."
    );
  }

  // (E) Normal phase transition
  const nextState = routeToState(route);

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

  const sideEffect = applyStateSideEffects(projectPath, paths, state, nextState, route);
  if (!sideEffect.ok) {
    return refuse(`Cannot advance: ${sideEffect.reason}`);
  }
  saveFlowState(projectPath, nextState);

  const iterSuffix = nextState.activeIteration
    ? ` (iter ${nextState.activeIteration})`
    : "";
  return ok(
    nextState,
    `Advanced to ${nextState.activePhase}${iterSuffix}.`
  );
}
