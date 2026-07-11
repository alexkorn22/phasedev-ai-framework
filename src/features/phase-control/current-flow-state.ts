import { Phase } from "../../entities/phase/types";
import type { Route } from "./flow-route";
import { resolveRoute } from "./flow-route";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";

export interface CurrentState {
  phase: Phase;
  routeKind: Route["kind"];
  activeChangePath: string | null;
}

export function resolveCurrentState(
  projectPath: string,
  changeName?: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): CurrentState {
  const route = resolveRoute(projectPath, changeName, blockingSeverity);
  return { phase: route.phase, routeKind: route.kind, activeChangePath: route.activeChangePath };
}
