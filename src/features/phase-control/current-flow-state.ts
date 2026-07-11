import { Phase } from "../../entities/phase/types";
import type { Route } from "./flow-route";
import { resolveRoute } from "./flow-route";
import { loadFlowState } from "../../entities/change/flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";

export interface CurrentState {
  phase: Phase;
  routeKind: Route["kind"] | "quick";
  activeChangePath: string | null;
}

export function resolveCurrentState(
  projectPath: string,
  changeName?: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): CurrentState {
  const flowState = loadFlowState(projectPath, changeName);
  if (flowState?.flowMode === "quick") {
    return {
      phase: flowState.activePhase,
      routeKind: "quick",
      activeChangePath: resolveChangeDir(projectPath, changeName)
    };
  }

  const route = resolveRoute(projectPath, changeName, blockingSeverity);
  return { phase: route.phase, routeKind: route.kind, activeChangePath: route.activeChangePath };
}
