import { ActivePhase, FlowState } from "../../entities/change/flow-state";
import { Route } from "./flow-route";

/**
 * Pipeline rank of a phase. The linear intake phases are strictly ordered; the
 * post-plan phases (implementation, validation, repair, final validation) share
 * one rank because the flow legitimately cycles among them per iteration, and
 * archive sits above them.
 */
export const PHASE_RANK: Record<ActivePhase, number> = {
  change_intake: 0,
  code_research: 1,
  technical_design: 2,
  iteration_planning: 3,
  implementation: 4,
  iteration_validation: 4,
  finding_repair: 4,
  final_validation: 4,
  // Quick phases run their own mode-scoped route and never compare against the
  // standard pipeline ranks above; rank 4 keeps them out of the archive/intake
  // boundary until quick-mode routing lands.
  quick_plan: 4,
  quick_implementation: 4,
  quick_validation: 4,
  quick_spec_revision: 4,
  archive: 5
};

export type StateRouteRelation =
  | "consistent"
  | "backward_conflict"
  | "advance_pending"
  | "forward_deadlock";

/**
 * Classify how state.activePhase (the lock) relates to route.phase (the
 * artifact-derived phase), given whether the locked phase's own exit gate
 * currently passes:
 * - "consistent": lock and route agree.
 * - "backward_conflict": route resolved to an earlier phase than the lock
 *   (an upstream artifact regressed).
 * - "advance_pending": route is ahead of (or same-rank as) the lock, but the
 *   lock's exit gate still passes — normal forward progress waiting on
 *   `phasedev advance`, not a deadlock.
 * - "forward_deadlock": route is ahead of (or same-rank as) the lock, and the
 *   lock's own exit gate fails — the lock can never satisfy `advance`'s entry
 *   condition, so state.json is stuck pointing at a phase that cannot exit.
 */
export function classifyStateRoute(
  state: FlowState,
  route: Route,
  exitGateOk: boolean
): StateRouteRelation {
  const routePhase = route.phase as ActivePhase;
  if (routePhase === state.activePhase) return "consistent";
  if (PHASE_RANK[routePhase] < PHASE_RANK[state.activePhase]) return "backward_conflict";
  return exitGateOk ? "advance_pending" : "forward_deadlock";
}

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
    `Recovery: restore the stale artifact, or run \`phasedev sync-state\` to non-destructively roll state.json back to "${routePhase}", then retry.`
  ].join("\n");
}
