import * as fs from "fs";
import { isDesignApproved, isPlanApproved, isSetupApproved } from "../../entities/change/approval";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { findInvalidArchiveState, findPendingArchiveState, ArchiveState, InvalidArchiveState } from "../../entities/change/archive-state";
import { buildChangePaths, ChangePaths } from "../../entities/change/paths";
import { parsePlan } from "../../entities/implementation-plan/parse-plan";
import { Phase } from "../../entities/implementation-plan/types";
import { hasPendingOrFailedEvidence, isPhaseReadyForValidation } from "../../entities/implementation-plan/phase-readiness";
import { validatePlanArtifact } from "../../entities/implementation-plan/validate-plan-artifact";
import { validatePrdArtifact } from "../../entities/prd/validate-prd";
import { validateRulesArtifact } from "../../entities/rules/validate-rules";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { validateResearchFacts } from "../../entities/research-facts/validate-research";
import { validateDesign } from "../../entities/design/validate-design";

export type Route =
  | { kind: "invalid_archive_state"; stage: "archive"; invalidArchiveState: InvalidArchiveState; issues: string[]; activeChangePath: string }
  | { kind: "pending_archive"; stage: "archive"; archiveState: ArchiveState; activeChangePath: string }
  | { kind: "setup"; stage: "setup"; activeChangePath: string | null }
  | { kind: "invalid_prd"; stage: "setup"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "invalid_rules"; stage: "setup"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "setup_approval"; stage: "setup"; paths: ChangePaths; activeChangePath: string }
  | { kind: "research"; stage: "research"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_research"; stage: "research"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "design"; stage: "design"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_design"; stage: "design"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "design_approval"; stage: "design"; paths: ChangePaths; activeChangePath: string }
  | { kind: "plan"; stage: "plan"; paths: ChangePaths; activeChangePath: string }
  | { kind: "plan_approval"; stage: "plan"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_plan"; stage: "plan"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "invalid_findings"; stage: "repair"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "repair"; stage: "repair"; paths: ChangePaths; activeChangePath: string }
  | { kind: "archive_readiness_blocked"; stage: "archive"; paths: ChangePaths; activeChangePath: string }
  | { kind: "archive_ready"; stage: "archive"; paths: ChangePaths; activeChangePath: string }
  | { kind: "phase"; stage: "implementation" | "phase_validation"; paths: ChangePaths; activePhase: Phase; activeChangePath: string }
  | { kind: "final_validation"; stage: "final_validation"; paths: ChangePaths; activeChangePath: string };

function phaseStage(activePhase: Phase): "implementation" | "phase_validation" {
  return isPhaseReadyForValidation(activePhase) ? "phase_validation" : "implementation";
}

function isVerdictOnlyOpenBlockingIssue(issue: string): boolean {
  return issue.startsWith("`verdict: ready`") ||
         issue.startsWith("`verdict: ready_with_risks`") ||
         issue.startsWith("`verdict: repaired`");
}

export function resolveRoute(projectPath: string): Route {
  const invalidArchiveState = findInvalidArchiveState(projectPath);
  if (invalidArchiveState) {
    return {
      kind: "invalid_archive_state",
      stage: "archive",
      invalidArchiveState,
      issues: [invalidArchiveState.reason],
      activeChangePath: invalidArchiveState.archivePath
    };
  }

  const pendingArchive = findPendingArchiveState(projectPath);
  if (pendingArchive) {
    return {
      kind: "pending_archive",
      stage: "archive",
      archiveState: pendingArchive,
      activeChangePath: pendingArchive.archivePath
    };
  }

  const changeDir = findActiveChangeDir(projectPath);
  if (!changeDir) {
    return { kind: "setup", stage: "setup", activeChangePath: null };
  }

  const paths = buildChangePaths(changeDir);
  if (!fs.existsSync(paths.prdPath) || !fs.existsSync(paths.rulesPath)) {
    return { kind: "setup", stage: "setup", activeChangePath: changeDir };
  }

  const prdIssues = validatePrdArtifact(paths.prdPath);
  if (prdIssues.length > 0) {
    return { kind: "invalid_prd", stage: "setup", paths, issues: prdIssues, activeChangePath: changeDir };
  }

  const rulesIssues = validateRulesArtifact(paths.rulesPath);
  if (rulesIssues.length > 0) {
    return { kind: "invalid_rules", stage: "setup", paths, issues: rulesIssues, activeChangePath: changeDir };
  }

  if (!isSetupApproved(changeDir).approved) {
    return { kind: "setup_approval", stage: "setup", paths, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.researchPath)) {
    return { kind: "research", stage: "research", paths, activeChangePath: changeDir };
  }

  const researchIssues = validateResearchFacts(paths.researchPath, paths.prdPath);
  if (researchIssues.length > 0) {
    return { kind: "invalid_research", stage: "research", paths, issues: researchIssues, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.designPath)) {
    return { kind: "design", stage: "design", paths, activeChangePath: changeDir };
  }

  const designIssues = validateDesign(paths.designPath, {
    prdPath: paths.prdPath,
    researchPath: paths.researchPath
  });
  if (designIssues.length > 0) {
    return { kind: "invalid_design", stage: "design", paths, issues: designIssues, activeChangePath: changeDir };
  }

  if (!isDesignApproved(changeDir)) {
    return { kind: "design_approval", stage: "design", paths, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.planPath)) {
    return { kind: "plan", stage: "plan", paths, activeChangePath: changeDir };
  }

  const planPhases = parsePlan(paths.planPath);
  const planIssues = validatePlanArtifact(paths.planPath, paths.prdPath, paths.designPath);
  if (planIssues.length > 0) {
    return { kind: "invalid_plan", stage: "plan", paths, issues: planIssues, activeChangePath: changeDir };
  }

  if (!isPlanApproved(changeDir)) {
    return { kind: "plan_approval", stage: "plan", paths, activeChangePath: changeDir };
  }

  const findings = parseValidationFindingsArtifact(paths.findingsPath);
  if (findings.exists) {
    const onlyVerdictCannotBypassOpenBlocking = findings.openBlockingRows.length > 0 &&
                                                 findings.issues.length > 0 &&
                                                 findings.issues.every(isVerdictOnlyOpenBlockingIssue);
    if (findings.issues.length > 0 && !onlyVerdictCannotBypassOpenBlocking) {
      return { kind: "invalid_findings", stage: "repair", paths, issues: findings.issues, activeChangePath: changeDir };
    }

    if (findings.openBlockingRows.length > 0) {
      return { kind: "repair", stage: "repair", paths, activeChangePath: changeDir };
    }

    if (findings.issues.length > 0) {
      return { kind: "invalid_findings", stage: "repair", paths, issues: findings.issues, activeChangePath: changeDir };
    }
  }

  const finalReady = findings.exists &&
                     findings.type === "final" &&
                     (findings.verdict === "ready" || findings.verdict === "ready_with_risks");
  if (finalReady) {
    const allPhasesCompleted = planPhases.length > 0 && planPhases.every(phase => phase.status === "completed");
    const hasAnyPendingOrFailed = planPhases.some(hasPendingOrFailedEvidence);
    if (!allPhasesCompleted || hasAnyPendingOrFailed) {
      return { kind: "archive_readiness_blocked", stage: "archive", paths, activeChangePath: changeDir };
    }

    return { kind: "archive_ready", stage: "archive", paths, activeChangePath: changeDir };
  }

  const activePhase = planPhases.find(phase => phase.status === "in_progress" || phase.status === "not_started");
  if (activePhase) {
    return {
      kind: "phase",
      stage: phaseStage(activePhase),
      paths,
      activePhase,
      activeChangePath: changeDir
    };
  }

  return { kind: "final_validation", stage: "final_validation", paths, activeChangePath: changeDir };
}
