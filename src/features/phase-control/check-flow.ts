import { buildChangePaths, ChangePaths } from "../../entities/change/paths";
import { iterationValidationBlockers } from "../../entities/iteration-plan/iteration-readiness";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseValidationFindingsArtifact, ValidationFindingsVerdict } from "../../entities/validation-findings/parse-validation-findings";
import { Route, resolveRoute } from "./flow-route";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { loadFlowState, locateChangeDir, isActivePhase, ActivePhase } from "../../entities/change/flow-state";
import { validatePhase } from "./phase-validators";

export type RouteKind = Route["kind"];

export interface PhaseCheckResult {
  ok: boolean;
  phase: ActivePhase | string;
  message: string;
}

export type ValidationCheckOptions =
  | { scope: "iteration"; iterationId: number }
  | { scope: "final" };

export interface ValidationCheckResult {
  ok: boolean;
  route: RouteKind;
  message: string;
}

const ROUTE_KINDS = new Set<RouteKind>([
  "invalid_archive_state",
  "pending_archive",
  "change_intake",
  "invalid_prd",
  "invalid_execution_contract",
  "change_intake_approval",
  "code_research",
  "invalid_code_research",
  "technical_design",
  "invalid_technical_design",
  "technical_design_approval",
  "iteration_planning",
  "iteration_planning_approval",
  "invalid_iteration_planning",
  "invalid_findings",
  "finding_repair",
  "archive_readiness_blocked",
  "archive_ready",
  "iteration",
  "final_validation"
]);

const PHASE_KINDS = new Set<string>([
  "init",
  "change_intake",
  "code_research",
  "technical_design",
  "iteration_planning",
  "implementation",
  "iteration_validation",
  "final_validation",
  "finding_repair",
  "archive"
]);

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

function readyIterationIssue(verdict: ValidationFindingsVerdict | "unknown", phaseId: number): string {
  return `\`verdict: ${verdict}\` is valid only after Iteration ${phaseId} is marked [x].`;
}

function repairRequiredIssue(scope: ValidationCheckOptions["scope"], routeKind: RouteKind): string {
  return `\`verdict: repair_required\` is valid for ${scope} validation only when the current route is finding_repair; got ${routeKind}.`;
}

export function isRouteKind(value: string): value is RouteKind {
  return ROUTE_KINDS.has(value as RouteKind);
}

export function routeKinds(): string[] {
  return Array.from(ROUTE_KINDS);
}

export function isPhaseKind(value: string): value is string {
  return PHASE_KINDS.has(value);
}

export function phaseKinds(): string[] {
  return Array.from(PHASE_KINDS);
}

// ── check-phase (new per-phase validator) ──────────────────

/**
 * Per-phase artifact validator.
 *
 * Validates artifacts of the active phase (or phaseOverride if provided).
 * Does NOT compute route. Does NOT accept --expect-route.
 */
export function checkPhase(
  projectPath: string,
  phaseOverride?: string
): PhaseCheckResult {
  const state = loadFlowState(projectPath);
  if (!state) {
    return {
      ok: false,
      phase: "unknown",
      message: "[PHASEDEV CHECK] FAILED: No active change. Run: phasedev create-change <name>."
    };
  }

  const phase = phaseOverride ?? state.activePhase;
  if (!isActivePhase(phase)) {
    return {
      ok: false,
      phase,
      message: `[PHASEDEV CHECK] FAILED: Unknown phase: ${phase}.`
    };
  }

  const changeDir = locateChangeDir(projectPath, state);
  if (!changeDir) {
    return {
      ok: false,
      phase,
      message: `[PHASEDEV CHECK] FAILED: Cannot locate change directory for phase ${phase}.`
    };
  }

  const paths = buildChangePaths(changeDir);
  const v = validatePhase(projectPath, phase, paths, state.activeIteration);

  return {
    ok: v.ok,
    phase,
    message: v.ok
      ? `[PHASEDEV CHECK] OK: phase ${phase} is valid.`
      : `[PHASEDEV CHECK] FAILED: phase ${phase} has issues.\n${v.issues.map(i => `- ${i}`).join("\n")}`
  };
}

// ── check-validation (specialized, unchanged) ──────────────

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

  if (findings?.exists && options.scope === "iteration") {
    if (findings.type !== "iteration") {
      issues.push("YAML field `type` must be `iteration` for Iteration Validation.");
    }

    if (findings.verdict === "repaired") {
      issues.push("`verdict: repaired` is not valid for Iteration Validation stage output.");
    }

    if (isReadyVerdict(findings.verdict)) {
      const phaseIteration = paths ? parsePlan(paths.iterationPlanPath).find(candidate => candidate.id === options.iterationId) : undefined;
      if (!phaseIteration) {
        issues.push(`Iteration ${options.iterationId} was not found in iteration_plan.md.`);
      } else if (phaseIteration.status !== "completed") {
        issues.push(readyIterationIssue(findings.verdict, options.iterationId));
      } else {
        const blockers = iterationValidationBlockers(phaseIteration);
        if (blockers.length > 0) {
          issues.push(`\`verdict: ${findings.verdict}\` is valid only after Iteration ${options.iterationId} has no validation readiness blockers: ${blockers.join("; ")}.`);
        }
      }
    }

    if (findings.verdict === "repair_required" && route.kind !== "finding_repair") {
      issues.push(repairRequiredIssue("iteration", route.kind));
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

    if (findings.verdict === "repair_required" && route.kind !== "finding_repair") {
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
