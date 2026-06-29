import { Stage } from "../../entities/stage/types";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths, ChangePaths } from "../../entities/change/paths";
import { phaseValidationBlockers } from "../../entities/implementation-plan/phase-readiness";
import { parsePlan } from "../../entities/implementation-plan/parse-plan";
import { parseValidationFindingsArtifact, ValidationFindingsVerdict } from "../../entities/validation-findings/parse-validation-findings";
import { Route, resolveRoute } from "./flow-route";

export type RouteKind = Route["kind"];

export interface FlowCheckResult {
  ok: boolean;
  route: RouteKind;
  stage: Stage;
  message: string;
}

export type ValidationCheckOptions =
  | { scope: "phase"; phaseId: number }
  | { scope: "final" };

export interface ValidationCheckResult {
  ok: boolean;
  route: RouteKind;
  message: string;
}

const ROUTE_KINDS = new Set<RouteKind>([
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

const STAGE_KINDS = new Set<Stage>([
  "init",
  "setup",
  "research",
  "design",
  "plan",
  "implementation",
  "phase_validation",
  "final_validation",
  "repair",
  "archive"
]);

function hasIssues(route: Route): route is Route & { issues: string[] } {
  return "issues" in route;
}

function hasPaths(route: Route): route is Route & { paths: ChangePaths } {
  return "paths" in route;
}

function pathsForValidation(projectPath: string, route: Route): ChangePaths | null {
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

function repairRequiredIssue(scope: ValidationCheckOptions["scope"], routeKind: RouteKind): string {
  return `\`verdict: repair_required\` is valid for ${scope} validation only when the current route is repair; got ${routeKind}.`;
}

export function isRouteKind(value: string): value is RouteKind {
  return ROUTE_KINDS.has(value as RouteKind);
}

export function routeKinds(): string[] {
  return Array.from(ROUTE_KINDS);
}

export function isStageKind(value: string): value is Stage {
  return STAGE_KINDS.has(value as Stage);
}

export function stageKinds(): string[] {
  return Array.from(STAGE_KINDS);
}

export function checkValidationCompletion(projectPath: string, options: ValidationCheckOptions): ValidationCheckResult {
  const route = resolveRoute(projectPath);
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
      } else {
        const blockers = phaseValidationBlockers(phase);
        if (blockers.length > 0) {
          issues.push(`\`verdict: ${findings.verdict}\` is valid only after Phase ${options.phaseId} has no validation readiness blockers: ${blockers.join("; ")}.`);
        }
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
        `[PHASEDEV VALIDATION CHECK] FAILED: ${options.scope} (route: ${route.kind})`,
        ...issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  return {
    ok: true,
    route: route.kind,
    message: `[PHASEDEV VALIDATION CHECK] OK: ${options.scope} validation is complete.`
  };
}

export function checkRoute(projectPath: string, expectedRoute?: RouteKind, expectedStage?: Stage): FlowCheckResult {
  const route = resolveRoute(projectPath);

  if (hasIssues(route)) {
    return {
      ok: false,
      route: route.kind,
      stage: route.stage,
      message: [
        `[PHASEDEV CHECK] FAILED: ${route.kind} (stage: ${route.stage})`,
        ...route.issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  if (expectedRoute && route.kind !== expectedRoute) {
    return {
      ok: false,
      route: route.kind,
      stage: route.stage,
      message: `[PHASEDEV CHECK] FAILED: expected route ${expectedRoute}, got ${route.kind} (stage: ${route.stage}).`
    };
  }

  if (expectedStage && route.stage !== expectedStage) {
    return {
      ok: false,
      route: route.kind,
      stage: route.stage,
      message: `[PHASEDEV CHECK] FAILED: expected stage ${expectedStage}, got ${route.stage} (route: ${route.kind}).`
    };
  }

  if (route.kind === "archive_ready") {
    return {
      ok: true,
      route: route.kind,
      stage: route.stage,
      message: "[PHASEDEV CHECK] OK: archive_ready. Archive is ready; no files were moved by check."
    };
  }

  return {
    ok: true,
    route: route.kind,
    stage: route.stage,
    message: `[PHASEDEV CHECK] OK: current route is ${route.kind} (stage: ${route.stage}).`
  };
}
