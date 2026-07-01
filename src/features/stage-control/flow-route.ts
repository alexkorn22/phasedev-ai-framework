import * as fs from "fs";
import { isDesignApproved, isPlanApproved, isSetupApproved } from "../../entities/change/approval";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { findInvalidArchiveState, findPendingArchiveState, ArchiveState, InvalidArchiveState } from "../../entities/change/archive-state";
import { buildChangePaths, ChangePaths } from "../../entities/change/paths";
import { parsePlan } from "../../entities/implementation-plan/parse-plan";
import { Phase } from "../../entities/implementation-plan/types";
import { isPhaseReadyForValidation, phaseValidationBlockers } from "../../entities/implementation-plan/phase-readiness";
import { validatePlanArtifact } from "../../entities/implementation-plan/validate-plan-artifact";
import { validatePrdArtifact } from "../../entities/prd/validate-prd";
import { validateRulesArtifact } from "../../entities/rules/validate-rules";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { validateResearchFacts } from "../../entities/research-facts/validate-research";
import { validateDesign } from "../../entities/design/validate-design";

export type Route =
  | { kind: "invalid_archive_state"; stage: "archive"; invalidArchiveState: InvalidArchiveState; issues: string[]; activeChangePath: string }
  | { kind: "pending_archive"; stage: "archive"; archiveState: ArchiveState; activeChangePath: string }
  | { kind: "change_intake"; stage: "change_intake"; activeChangePath: string | null }
  | { kind: "invalid_prd"; stage: "change_intake"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "invalid_execution_contract"; stage: "change_intake"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "change_intake_approval"; stage: "change_intake"; paths: ChangePaths; activeChangePath: string }
  | { kind: "code_research"; stage: "code_research"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_code_research"; stage: "code_research"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "technical_design"; stage: "technical_design"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_technical_design"; stage: "technical_design"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "technical_design_approval"; stage: "technical_design"; paths: ChangePaths; activeChangePath: string }
  | { kind: "iteration_planning"; stage: "iteration_planning"; paths: ChangePaths; activeChangePath: string }
  | { kind: "iteration_planning_approval"; stage: "iteration_planning"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_iteration_planning"; stage: "iteration_planning"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "invalid_findings"; stage: "finding_repair"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "finding_repair"; stage: "finding_repair"; paths: ChangePaths; activeChangePath: string }
  | { kind: "archive_readiness_blocked"; stage: "archive"; paths: ChangePaths; activeChangePath: string }
  | { kind: "archive_ready"; stage: "archive"; paths: ChangePaths; activeChangePath: string }
  | { kind: "phase"; stage: "implementation" | "iteration_validation"; paths: ChangePaths; activePhase: Phase; activeChangePath: string }
  | { kind: "final_validation"; stage: "final_validation"; paths: ChangePaths; activeChangePath: string };

function phaseStage(activePhase: Phase): "implementation" | "iteration_validation" {
  return isPhaseReadyForValidation(activePhase) ? "iteration_validation" : "implementation";
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
    return { kind: "change_intake", stage: "change_intake", activeChangePath: null };
  }

  const paths = buildChangePaths(changeDir);
  if (!fs.existsSync(paths.prdPath) || !fs.existsSync(paths.executionContractPath)) {
    return { kind: "change_intake", stage: "change_intake", activeChangePath: changeDir };
  }

  const prdIssues = validatePrdArtifact(paths.prdPath);
  if (prdIssues.length > 0) {
    return { kind: "invalid_prd", stage: "change_intake", paths, issues: prdIssues, activeChangePath: changeDir };
  }

  const rulesIssues = validateRulesArtifact(paths.executionContractPath);
  if (rulesIssues.length > 0) {
    return { kind: "invalid_execution_contract", stage: "change_intake", paths, issues: rulesIssues, activeChangePath: changeDir };
  }

  if (!isSetupApproved(changeDir).approved) {
    return { kind: "change_intake_approval", stage: "change_intake", paths, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.researchPath)) {
    return { kind: "code_research", stage: "code_research", paths, activeChangePath: changeDir };
  }

  const researchIssues = validateResearchFacts(paths.researchPath, paths.prdPath);
  if (researchIssues.length > 0) {
    return { kind: "invalid_code_research", stage: "code_research", paths, issues: researchIssues, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.designPath)) {
    return { kind: "technical_design", stage: "technical_design", paths, activeChangePath: changeDir };
  }

  const designIssues = validateDesign(paths.designPath, {
    prdPath: paths.prdPath,
    researchPath: paths.researchPath
  });
  if (designIssues.length > 0) {
    return { kind: "invalid_technical_design", stage: "technical_design", paths, issues: designIssues, activeChangePath: changeDir };
  }

  if (!isDesignApproved(changeDir)) {
    return { kind: "technical_design_approval", stage: "technical_design", paths, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.iterationPlanPath)) {
    return { kind: "iteration_planning", stage: "iteration_planning", paths, activeChangePath: changeDir };
  }

  const planPhases = parsePlan(paths.iterationPlanPath);
  const planIssues = validatePlanArtifact(paths.iterationPlanPath, paths.prdPath, paths.designPath);
  if (planIssues.length > 0) {
    return { kind: "invalid_iteration_planning", stage: "iteration_planning", paths, issues: planIssues, activeChangePath: changeDir };
  }

  if (!isPlanApproved(changeDir)) {
    return { kind: "iteration_planning_approval", stage: "iteration_planning", paths, activeChangePath: changeDir };
  }

  const findings = parseValidationFindingsArtifact(paths.findingsPath);
  if (findings.exists) {
    const onlyVerdictCannotBypassOpenBlocking = findings.openBlockingRows.length > 0 &&
                                                 findings.issues.length > 0 &&
                                                 findings.issues.every(isVerdictOnlyOpenBlockingIssue);
    if (findings.issues.length > 0 && !onlyVerdictCannotBypassOpenBlocking) {
      return { kind: "invalid_findings", stage: "finding_repair", paths, issues: findings.issues, activeChangePath: changeDir };
    }

    if (findings.openBlockingRows.length > 0) {
      return { kind: "finding_repair", stage: "finding_repair", paths, activeChangePath: changeDir };
    }

    if (findings.issues.length > 0) {
      return { kind: "invalid_findings", stage: "finding_repair", paths, issues: findings.issues, activeChangePath: changeDir };
    }
  }

  // After repair with `repaired` verdict and no open blocking rows,
  // always route to phase_validation for re-validation. Do not route
  // through phaseStage() which may return "implementation" due to
  // stale Check Evidence that the repair resolved.
  if (findings.exists && findings.verdict === "repaired" && findings.openBlockingRows.length === 0) {
    const activePhase = planPhases.find(phase => phase.status === "in_progress" || phase.status === "not_started");
    if (activePhase) {
      return {
        kind: "phase",
        stage: "iteration_validation",
        paths,
        activePhase,
        activeChangePath: changeDir
      };
    }
    return { kind: "final_validation", stage: "final_validation", paths, activeChangePath: changeDir };
  }

  const finalReady = findings.exists &&
                     findings.type === "final" &&
                     (findings.verdict === "ready" || findings.verdict === "ready_with_risks");
  if (finalReady) {
    const allPhasesCompleted = planPhases.length > 0 && planPhases.every(phase => phase.status === "completed");
    const hasAnyReadinessBlockers = planPhases.some(phase => phaseValidationBlockers(phase).length > 0);
    if (!allPhasesCompleted || hasAnyReadinessBlockers) {
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
