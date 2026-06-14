import { FlowStage } from "../../entities/flow-stage/types";
import type { FlowRoute } from "./flow-route";
import { resolveFlowRoute } from "./flow-route";

export interface CurrentFlowState {
  stage: FlowStage;
  routeKind: FlowRoute["kind"];
  activeChangePath: string | null;
}

export function resolveCurrentFlowState(projectPath: string): CurrentFlowState {
  const route = resolveFlowRoute(projectPath);
  return { stage: route.stage, routeKind: route.kind, activeChangePath: route.activeChangePath };
}
