import { FlowStage } from "../../entities/flow-stage/types";
import { findActiveChangeDir } from "../../entities/flow-change/active-change";
import { buildChangePaths, ChangePaths } from "../../entities/flow-change/paths";
import { parsePlan } from "../../entities/implementation-plan/parse-plan";
import { parseValidationFindingsArtifact, ValidationFindingsVerdict } from "../../entities/validation-findings/parse-validation-findings";
import { FlowRoute, resolveFlowRoute } from "./flow-route";

export type FlowRouteKind = FlowRoute["kind"];

export interface FlowCheckResult {
  ok: boolean;
  route: FlowRouteKind;
  stage: FlowStage;
  message: string;
}

export type ValidationCheckOptions =
  | { scope: "phase"; phaseId: number }
  | { scope: "final" };

export interface ValidationCheckResult {
  ok: boolean;
  route: FlowRouteKind;
  message: string;
}

const ROUTE_KINDS = new Set<FlowRouteKind>([
  "invalid_archive_state",
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

function hasPaths(route: FlowRoute): route is FlowRoute & { paths: ChangePaths } {
  return "paths" in route;
}

function pathsForValidation(projectPath: string, route: FlowRoute): ChangePaths | null {
  if (hasPaths(route)) {
    return route.paths;
  }

  const activeChangeDir = findActiveChangeDir(projectPath);
  return activeChangeDir ? buildChangePaths(activeChangeDir) : null;
}

function isReadyVerdict(verdict: ValidationFindingsVerdict | "unknown"): boolean {
  return verdict === "ready" || verdict === "ready_with_risks";
}

function readyPhaseIssue(verdict: ValidationFindingsVerdict | "unknown", phaseId: number): string {
  return `\`verdict: ${verdict}\` is valid only after Phase ${phaseId} is marked [x].`;
}

function repairRequiredIssue(scope: ValidationCheckOptions["scope"], routeKind: FlowRouteKind): string {
  return `\`verdict: repair_required\` is valid for ${scope} validation only when the current route is repair; got ${routeKind}.`;
}

export function isFlowRouteKind(value: string): value is FlowRouteKind {
  return ROUTE_KINDS.has(value as FlowRouteKind);
}

export function flowRouteKinds(): string[] {
  return Array.from(ROUTE_KINDS);
}

export function checkValidationCompletion(projectPath: string, options: ValidationCheckOptions): ValidationCheckResult {
  const route = resolveFlowRoute(projectPath);
  const paths = pathsForValidation(projectPath, route);
  const issues: string[] = [];

  if (!paths) {
    issues.push("No active change with validation_findings.md was found.");
  }

  const findings = paths ? parseValidationFindingsArtifact(paths.findingsPath) : null;
  if (!findings?.exists) {
    issues.push("validation_findings.md must exist before validation completion can pass.");
  }

  if (findings) {
    issues.push(...findings.issues);
  }

  if (findings?.exists && options.scope === "phase") {
    if (findings.type !== "phase") {
      issues.push("YAML field `type` must be `phase` for Phase Validation.");
    }

    if (findings.verdict === "repaired") {
      issues.push("`verdict: repaired` is not valid for Phase Validation stage output.");
    }

    if (isReadyVerdict(findings.verdict)) {
      const phase = paths ? parsePlan(paths.planPath).find(candidate => candidate.id === options.phaseId) : undefined;
      if (!phase) {
        issues.push(`Phase ${options.phaseId} was not found in implementation_plan.md.`);
      } else if (phase.status !== "completed") {
        issues.push(readyPhaseIssue(findings.verdict, options.phaseId));
      }
    }

    if (findings.verdict === "repair_required" && route.kind !== "repair") {
      issues.push(repairRequiredIssue("phase", route.kind));
    }
  }

  if (findings?.exists && options.scope === "final") {
    if (findings.type !== "final") {
      issues.push("YAML field `type` must be `final` for Final Validation.");
    }

    if (findings.verdict === "repaired") {
      issues.push("`verdict: repaired` is not valid for Final Validation stage output.");
    }

    if (isReadyVerdict(findings.verdict) && route.kind !== "archive_ready") {
      if (route.kind === "archive_readiness_blocked") {
        issues.push("Final Validation declared ready, but route is archive_readiness_blocked.");
      } else {
        issues.push(`Final Validation declared ready, but route is ${route.kind}; expected archive_ready.`);
      }
    }

    if (findings.verdict === "repair_required" && route.kind !== "repair") {
      issues.push(repairRequiredIssue("final", route.kind));
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      route: route.kind,
      message: [
        `[FLOW VALIDATION CHECK] FAILED: ${options.scope} (route: ${route.kind})`,
        ...issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  return {
    ok: true,
    route: route.kind,
    message: `[FLOW VALIDATION CHECK] OK: ${options.scope} validation is complete.`
  };
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
