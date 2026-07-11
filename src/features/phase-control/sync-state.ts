import * as fs from "fs";
import { ActivePhase, loadFlowState, saveFlowState } from "../../entities/change/flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { resolveRoute } from "./flow-route";
import { PHASE_RANK } from "./state-route-consistency";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";

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

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return { ok: false, changed: false, message: "Cannot locate active change directory." };
  }

  const route = resolveRoute(projectPath, changeName, blockingSeverity);
  const routePhase = route.phase as ActivePhase;
  if (routePhase === state.activePhase) {
    return {
      ok: true,
      changed: false,
      fromPhase: state.activePhase,
      toPhase: routePhase,
      message: `state.json is already consistent (activePhase: ${state.activePhase}, artifact-derived: ${routePhase}). Nothing to sync.`
    };
  }

  if (PHASE_RANK[routePhase] >= PHASE_RANK[state.activePhase]) {
    return {
      ok: true,
      changed: false,
      fromPhase: state.activePhase,
      toPhase: routePhase,
      message: `state.json is locked at ${state.activePhase} but artifacts resolve to ${routePhase}; run \`phasedev advance\` to move forward. sync-state only rolls state.json backward and will not do that here.`
    };
  }

  const paths = buildChangePaths(changeDir);
  // The baseline would otherwise compare the findings table against a snapshot
  // from before this rollback, rejecting legitimate rework.
  fs.rmSync(paths.findingsBaselinePath, { force: true });

  saveFlowState(projectPath, { activePhase: routePhase, activeIteration: null, repairCycleCount: 0 }, changeName);

  return {
    ok: true,
    changed: true,
    fromPhase: state.activePhase,
    toPhase: routePhase,
    message: `Synced state.json: activePhase ${state.activePhase} -> ${routePhase} (activeIteration cleared, repairCycleCount reset). No artifacts were modified. Run: phasedev phase.`
  };
}
