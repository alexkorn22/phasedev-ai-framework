import * as fs from "fs";
import { ActivePhase, loadFlowState, saveFlowState } from "../../entities/change/flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { resolveRoute } from "./flow-route";
import { classifyStateRoute } from "./state-route-consistency";
import { validatePhaseExit } from "./phase-validators";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";
import { normalizeValidationState } from "./normalize-validation-state";

export interface SyncStateResult {
  ok: boolean;
  changed: boolean;
  message: string;
  fromPhase?: string;
  toPhase?: string;
}

export function syncState(
  projectPath: string,
  changeName?: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): SyncStateResult {
  const state = loadFlowState(projectPath, changeName);
  if (!state) {
    return { ok: false, changed: false, message: "No active change. Run: phasedev create-change <name>." };
  }

  if (state.flowMode === "quick") {
    return {
      ok: true,
      changed: false,
      fromPhase: state.activePhase,
      toPhase: state.activePhase,
      message: "Quick mode uses a linear state sequence; sync-state does not apply. Use `phasedev advance`."
    };
  }

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return { ok: false, changed: false, message: "Cannot locate active change directory." };
  }

  const paths = buildChangePaths(changeDir);
  const normalization = normalizeValidationState(paths, state.activePhase, blockingSeverity);
  const resetNote = normalization.changed ? ` ${normalization.notes.join(" ")}` : "";

  const route = resolveRoute(projectPath, changeName, blockingSeverity);
  const routePhase = route.phase as ActivePhase;
  if (routePhase === state.activePhase) {
    const inactionNote = normalization.changed ? " state.json needs no sync." : " Nothing to sync.";
    return {
      ok: true,
      changed: false,
      fromPhase: state.activePhase,
      toPhase: routePhase,
      message: `state.json is already consistent (activePhase: ${state.activePhase}, artifact-derived: ${routePhase}).${inactionNote}${resetNote}`
    };
  }

  const exitGateOk = validatePhaseExit(projectPath, state.activePhase, paths, state.activeIteration, blockingSeverity).ok;
  const relation = classifyStateRoute(state, route, exitGateOk);

  if (relation === "advance_pending") {
    const applicabilityNote = normalization.changed ? "" : " sync-state does not apply here.";
    return {
      ok: true,
      changed: false,
      fromPhase: state.activePhase,
      toPhase: routePhase,
      message: `state.json is locked at ${state.activePhase} but artifacts resolve to ${routePhase}; the locked phase is not stuck (its exit gate still passes), so run \`phasedev advance\` to move forward.${applicabilityNote}${resetNote}`
    };
  }

  if (relation === "forward_deadlock") {
    if (routePhase === "archive") {
      return {
        ok: true,
        changed: false,
        fromPhase: state.activePhase,
        toPhase: routePhase,
        message: `state.json is locked at ${state.activePhase}, whose exit gate has failed, and artifacts resolve to archive; fix the failing exit gate, then run \`phasedev advance\`, which performs the archive mutation. sync-state will not fabricate an archive transition.${resetNote}`
      };
    }

    // The baseline would otherwise compare the findings table against a
    // snapshot from before this reconciliation, rejecting legitimate rework.
    fs.rmSync(paths.findingsBaselinePath, { force: true });

    const nextIteration = route.kind === "iteration" ? route.activeIteration.id : state.activeIteration;
    saveFlowState(
      projectPath,
      { activePhase: routePhase, activeIteration: nextIteration, repairCycleCount: state.repairCycleCount },
      changeName
    );

    const forwardArtifactsNote = normalization.changed ? "" : " No artifacts were modified.";
    return {
      ok: true,
      changed: true,
      fromPhase: state.activePhase,
      toPhase: routePhase,
      message: `Synced state.json forward: ${state.activePhase} -> ${routePhase} (the locked phase's exit gate had failed; activeIteration and repairCycleCount preserved).${forwardArtifactsNote} Run: phasedev phase.${resetNote}`
    };
  }

  // relation === "backward_conflict"
  // The baseline would otherwise compare the findings table against a snapshot
  // from before this rollback, rejecting legitimate rework.
  fs.rmSync(paths.findingsBaselinePath, { force: true });

  saveFlowState(projectPath, { activePhase: routePhase, activeIteration: null, repairCycleCount: 0 }, changeName);

  const backwardArtifactsNote = normalization.changed ? "" : " No artifacts were modified.";
  return {
    ok: true,
    changed: true,
    fromPhase: state.activePhase,
    toPhase: routePhase,
    message: `Synced state.json: activePhase ${state.activePhase} -> ${routePhase} (activeIteration cleared, repairCycleCount reset).${backwardArtifactsNote} Run: phasedev phase.${resetNote}`
  };
}
