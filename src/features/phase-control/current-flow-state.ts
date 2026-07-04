import { Phase } from "../../entities/phase/types";
import type { Route } from "./flow-route";
import { resolveRoute } from "./flow-route";

export interface CurrentState {
  phase: Phase;
  routeKind: Route["kind"];
  activeChangePath: string | null;
}

export function resolveCurrentState(projectPath: string): CurrentState {
  const route = resolveRoute(projectPath);
  return { phase: route.phase, routeKind: route.kind, activeChangePath: route.activeChangePath };
}
