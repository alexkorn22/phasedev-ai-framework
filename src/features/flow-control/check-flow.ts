import { FlowStage } from "../../entities/flow-stage/types";
import { FlowRoute, resolveFlowRoute } from "./flow-route";

export type FlowRouteKind = FlowRoute["kind"];

export interface FlowCheckResult {
  ok: boolean;
  route: FlowRouteKind;
  stage: FlowStage;
  message: string;
}

const ROUTE_KINDS = new Set<FlowRouteKind>([
  "pending_archive",
  "setup",
  "invalid_prd",
  "invalid_rules",
  "setup_approval",
  "research",
  "invalid_research",
  "design",
  "invalid_design",
  "design_approval",
  "plan",
  "plan_approval",
  "invalid_plan",
  "invalid_findings",
  "repair",
  "archive_readiness_blocked",
  "archive_ready",
  "phase",
  "final_validation"
]);

function hasIssues(route: FlowRoute): route is FlowRoute & { issues: string[] } {
  return "issues" in route;
}

export function isFlowRouteKind(value: string): value is FlowRouteKind {
  return ROUTE_KINDS.has(value as FlowRouteKind);
}

export function flowRouteKinds(): string[] {
  return Array.from(ROUTE_KINDS);
}

export function checkFlow(projectPath: string, expectedRoute?: FlowRouteKind): FlowCheckResult {
  const route = resolveFlowRoute(projectPath);

  if (hasIssues(route)) {
    return {
      ok: false,
      route: route.kind,
      stage: route.stage,
      message: [
        `[FLOW CHECK] FAILED: ${route.kind} (stage: ${route.stage})`,
        ...route.issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  if (expectedRoute && route.kind !== expectedRoute) {
    return {
      ok: false,
      route: route.kind,
      stage: route.stage,
      message: `[FLOW CHECK] FAILED: expected route ${expectedRoute}, got ${route.kind} (stage: ${route.stage}).`
    };
  }

  if (route.kind === "archive_ready") {
    return {
      ok: true,
      route: route.kind,
      stage: route.stage,
      message: "[FLOW CHECK] OK: archive_ready. Archive is ready; no files were moved by check."
    };
  }

  return {
    ok: true,
    route: route.kind,
    stage: route.stage,
    message: `[FLOW CHECK] OK: current route is ${route.kind} (stage: ${route.stage}).`
  };
}
