import { FlowStage } from "../../entities/flow-stage/types";
import { resolveFlowRoute } from "./flow-route";

export interface CurrentFlowState {
  stage: FlowStage;
  activeChangePath: string | null;
}

export function resolveCurrentFlowState(projectPath: string): CurrentFlowState {
  const route = resolveFlowRoute(projectPath);
  return { stage: route.stage, activeChangePath: route.activeChangePath };
}
