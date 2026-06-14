import { Stage } from "../../entities/stage/types";
import type { Route } from "./flow-route";
import { resolveRoute } from "./flow-route";

export interface CurrentState {
  stage: Stage;
  routeKind: Route["kind"];
  activeChangePath: string | null;
}

export function resolveCurrentState(projectPath: string): CurrentState {
  const route = resolveRoute(projectPath);
  return { stage: route.stage, routeKind: route.kind, activeChangePath: route.activeChangePath };
}
