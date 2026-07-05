import { ActivePhase, FlowState } from "../../entities/change/flow-state";
import { Route } from "./flow-route";

/**
 * Pipeline rank of a phase. The linear intake phases are strictly ordered; the
 * post-plan phases (implementation, validation, repair, final validation) share
 * one rank because the flow legitimately cycles among them per iteration, and
 * archive sits above them.
 */
const PHASE_RANK: Record<ActivePhase, number> = {
  change_intake: 0,
  code_research: 1,
  technical_design: 2,
  iteration_planning: 3,
  implementation: 4,
  iteration_validation: 4,
  finding_repair: 4,
  final_validation: 4,
  archive: 5
};

/**
 * Detect a state/route contradiction. state.activePhase is the phase lock;
 * route.phase is derived from the artifacts on disk. Normal forward progress
 * always has the route at or ahead of the lock, and approval/invalid/pending
 * variants keep the same phase. A route that resolves to an *earlier* pipeline
 * phase than the lock means a required upstream artifact regressed while the
 * lock still claims a later phase — the two disagree and advancing or rendering
 * would guess. Returns a blocker message in that case, otherwise null.
 */
export function detectStateRouteConflict(state: FlowState, route: Route): string | null {
  const statePhase = state.activePhase;
  const routePhase = route.phase as ActivePhase;

  if (PHASE_RANK[routePhase] >= PHASE_RANK[statePhase]) {
    return null;
  }

  return [
    `[PHASEDEV] BLOCKED: state.json and the change artifacts disagree on the current phase.`,
    `state.json phase: ${statePhase}`,
    `artifact-derived phase: ${routePhase}`,
    `An upstream artifact required by "${statePhase}" is missing or invalid, so the flow resolves back to "${routePhase}".`,
    `Recovery: restore or remove the stale artifact, or reset state.json (phasedev reset-change), then retry.`
  ].join("\n");
}
