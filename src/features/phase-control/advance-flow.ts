import * as fs from "fs";
import * as path from "path";
import { Config } from "../../entities/config/config";
import { FlowState, loadFlowState, saveFlowState, locateChangeDir, ActivePhase } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { findCompletedArchiveState, findInvalidArchiveState, readArchiveState } from "../../entities/change/archive-state";
import { validatePhaseExit } from "./phase-validators";
import { approveArtifact } from "../artifact-ops/approve-artifact";
import { resolveRoute, Route } from "./flow-route";
import { startArchiveStage } from "./archive-stage";
import { detectStateRouteConflict } from "./state-route-consistency";

import {
  invalidPrdBlocker, invalidRulesBlocker, invalidResearchBlocker,
  invalidDesignBlocker, invalidPlanBlocker, validationFindingsBlocker,
  approvalBlocker, archiveReadinessBlocker
} from "./prompt-blockers";

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
    case "pending_archive":
      return { activePhase: "archive", activeIteration: null, repairCycleCount: 0 };
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
 * |                       | at approval gates, invalid artifacts, and archive   |
 * |                       | readiness boundaries.                               |
 *
 * Algorithm:
 * 1. Load flow state. If none → refuse.
 * 2. validatePhaseExit for active phase. If not finished → refuse.
 * 3. If activePhase === "archive" → flow is finished (exit gate already passed).
 * 4. resolveRoute():
 *    - invalid_* → refuse.
 *    - *_approval → refuse with approval prompt (or autoApprove).
 *    - archive_readiness_blocked → refuse.
 *    - archive_ready → if runArchiveStage → mutate, else refuse.
 *    - else → routeToState + applyStateSideEffects + saveFlowState.
 */
export function advanceFlow(projectPath: string, config: Config): AdvanceResult {
  const state = loadFlowState(projectPath);
  if (!state) {
    const completedArchive = findCompletedArchiveState(projectPath);
    if (completedArchive) {
      return done("Archive complete. Flow finished.");
    }
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

  // Pre-move crash recovery: if the archive phase has a pre-move marker
  // (.phase-archive.json in_progress without movedAt) in the still-active
  // change dir, complete the archive mutation before checking exit gates.
  if (state.activePhase === "archive") {
    const preMoveState = readArchiveState(changeDir);
    if (preMoveState && preMoveState.status === "in_progress" && !preMoveState.movedAt) {
      const archiveResult = startArchiveStage(projectPath, changeDir, new Date(), config);
      if (archiveResult.blocked) {
        return refuse(
          `Cannot recover archive transition: ${archiveResult.reason ?? "archive mutation blocked"}.\n${archiveResult.prompt}`
        );
      }
      return ok(
        { activePhase: "archive", activeIteration: null, repairCycleCount: 0 },
        "Advanced to archive phase (recovered from pre-move crash)."
      );
    }
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

  // (C1) invalid_* → refuse with rich blocker
  if (route.kind === "invalid_prd") {
    return refuse(invalidPrdBlocker(route.paths.prdPath, route.issues).prompt);
  }
  if (route.kind === "invalid_execution_contract") {
    return refuse(invalidRulesBlocker(route.paths.executionContractPath, route.issues).prompt);
  }
  if (route.kind === "invalid_code_research") {
    return refuse(invalidResearchBlocker(route.paths.researchPath, route.issues).prompt);
  }
  if (route.kind === "invalid_technical_design") {
    return refuse(invalidDesignBlocker(route.paths.designPath, route.issues).prompt);
  }
  if (route.kind === "invalid_iteration_planning") {
    return refuse(invalidPlanBlocker(route.paths.iterationPlanPath, route.issues).prompt);
  }
  if (route.kind === "invalid_findings") {
    return refuse(validationFindingsBlocker(route.paths.findingsPath, route.issues).prompt);
  }
  // Fallback for any remaining invalid_ kind (e.g. invalid_archive_state)
  if (route.kind.startsWith("invalid_")) {
    return refuse(
      `Cannot advance: ${route.kind}. Fix artifact, rerun check, then advance.`
    );
  }

  // (C2) *_approval → refuse with rich blocker
  if (route.kind === "change_intake_approval") {
    return refuse(approvalBlocker(route.phase, "Setup Approval Required", route.paths.prdPath, "prd.md and execution_contract.md").prompt);
  }
  if (route.kind === "technical_design_approval") {
    return refuse(approvalBlocker(route.phase, "Design Approval Required", route.paths.designPath, "design.md").prompt);
  }
  if (route.kind === "iteration_planning_approval") {
    return refuse(approvalBlocker(route.phase, "Plan Approval Required", route.paths.iterationPlanPath, "iteration_plan.md").prompt);
  }
  // Fallback for any remaining *_approval kind
  if (route.kind.endsWith("_approval")) {
    return refuse(
      `Cannot advance: ${route.kind}. Run: phasedev approve <artifact> (or enable autoApprove).`
    );
  }

  // (C3) archive_readiness_blocked → refuse with rich blocker
  if (route.kind === "archive_readiness_blocked") {
    return refuse(archiveReadinessBlocker(
      "Not all iterations are completed",
      route.paths.iterationPlanPath,
      "Complete validation for each iteration and mark it [x] in iteration_plan.md."
    ).prompt);
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

    const newState: FlowState = { activePhase: "archive", activeIteration: null, repairCycleCount: 0 };

    return ok(
      newState,
      "Advanced to archive phase. Run: phasedev phase for the archive contract."
    );
  }

  // Repair cycle guard: refuse after N consecutive repair attempts
  const MAX_REPAIR_CYCLES = 3;
  if (route.kind === "finding_repair" && state.repairCycleCount >= MAX_REPAIR_CYCLES) {
    return refuse(
      `Repair cycle limit reached (${MAX_REPAIR_CYCLES}). ` +
      "Manual intervention required. Review the findings, resolve them directly, then run advance again."
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

  // maxIterations guard: the resolved route targets an iteration beyond
  // the configured limit. Refuse rather than silently overflowing.
  if (route.kind === "iteration" && route.activeIteration.id > config.maxIterations) {
    return refuse(
      `Max iterations (${config.maxIterations}) reached. ` +
      `Route targets iteration ${route.activeIteration.id}. ` +
      `Increase maxIterations in config.yaml or mark the remaining iterations as not_started.`
    );
  }

  const sideEffect = applyStateSideEffects(projectPath, paths, state, nextState, route);
  if (!sideEffect.ok) {
    return refuse(`Cannot advance: ${sideEffect.reason}`);
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
  saveFlowState(projectPath, finalNextState);

  const iterSuffix = finalNextState.activeIteration
    ? ` (iter ${finalNextState.activeIteration})`
    : "";
  return ok(
    finalNextState,
    `Advanced to ${finalNextState.activePhase}${iterSuffix}.`
  );
}
