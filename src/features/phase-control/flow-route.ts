import * as fs from "fs";
import { isDesignApproved, isPlanApproved, isSetupApproved } from "../../entities/change/approval";
import { resolveChangeDir } from "../../entities/change/active-change";
import { findInvalidArchiveState, findPendingArchiveState, ArchiveState, InvalidArchiveState } from "../../entities/change/archive-state";
import { loadFlowState, FlowState } from "../../entities/change/flow-state";
import { buildChangePaths, ChangePaths } from "../../entities/change/paths";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { Iteration } from "../../entities/iteration-plan/types";
import { isIterationReadyForValidation, iterationValidationBlockers } from "../../entities/iteration-plan/iteration-readiness";
import { validatePlanArtifact } from "../../entities/iteration-plan/validate-plan-artifact";
import { validatePrdArtifact } from "../../entities/prd/validate-prd";
import { validateExecutionContract } from "../../entities/execution-contract/validate-execution-contract";
import { parseFindingRowIteration, parseValidationFindingsArtifact, ValidationFindingIssue, ValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { validateResearchFacts } from "../../entities/research-facts/validate-research";
import { validateDesign } from "../../entities/design/validate-design";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";

export type Route =
  | { kind: "invalid_archive_state"; phase: "archive"; invalidArchiveState: InvalidArchiveState; issues: string[]; activeChangePath: string }
  | { kind: "pending_archive"; phase: "archive"; archiveState: ArchiveState; activeChangePath: string }
  | { kind: "change_intake"; phase: "change_intake"; activeChangePath: string | null }
  | { kind: "invalid_prd"; phase: "change_intake"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "invalid_execution_contract"; phase: "change_intake"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "change_intake_approval"; phase: "change_intake"; paths: ChangePaths; activeChangePath: string }
  | { kind: "code_research"; phase: "code_research"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_code_research"; phase: "code_research"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "technical_design"; phase: "technical_design"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_technical_design"; phase: "technical_design"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "technical_design_approval"; phase: "technical_design"; paths: ChangePaths; activeChangePath: string }
  | { kind: "iteration_planning"; phase: "iteration_planning"; paths: ChangePaths; activeChangePath: string }
  | { kind: "iteration_planning_approval"; phase: "iteration_planning"; paths: ChangePaths; activeChangePath: string }
  | { kind: "invalid_iteration_planning"; phase: "iteration_planning"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "invalid_findings"; phase: "finding_repair"; paths: ChangePaths; issues: string[]; activeChangePath: string }
  | { kind: "finding_repair"; phase: "finding_repair"; paths: ChangePaths; activeChangePath: string }
  | { kind: "archive_readiness_blocked"; phase: "archive"; paths: ChangePaths; activeChangePath: string }
  | { kind: "archive_ready"; phase: "archive"; paths: ChangePaths; activeChangePath: string }
  | { kind: "iteration"; phase: "implementation" | "iteration_validation"; paths: ChangePaths; activeIteration: Iteration; activeChangePath: string }
  | { kind: "final_validation"; phase: "final_validation"; paths: ChangePaths; activeChangePath: string };

function iterationPhase(activeIteration: Iteration): "implementation" | "iteration_validation" {
  return isIterationReadyForValidation(activeIteration) ? "iteration_validation" : "implementation";
}

const VERDICT_ONLY_OPEN_BLOCKING_ISSUE_CODES: ReadonlySet<ValidationFindingIssue["code"]> = new Set([
  "verdict_ready_with_open_findings",
  "verdict_ready_with_risks_with_open_blocking",
  "verdict_repaired_with_open_blocking"
]);

function isVerdictOnlyOpenBlockingIssue(issue: ValidationFindingIssue): boolean {
  return VERDICT_ONLY_OPEN_BLOCKING_ISSUE_CODES.has(issue.code);
}

// A `repaired` verdict clears state.json's activeIteration, so the target
// iteration must be re-derived: prefer the state-tracked iteration, then the
// iteration referenced by a still-open finding row, then the highest
// iteration referenced across all rows (the just-repaired findings identify
// which iteration was under repair).
function deriveRepairedIteration(
  planPhases: Iteration[],
  flowState: FlowState | null,
  findings: ValidationFindingsArtifact
): Iteration | undefined {
  if (flowState?.activeIteration != null) {
    const tracked = planPhases.find(phase => phase.id === flowState.activeIteration);
    if (tracked) return tracked;
  }

  const openIteration = findings.openRows
    .map(row => parseFindingRowIteration(row.phase))
    .find((n): n is number => n != null);
  if (openIteration != null) {
    const fromOpen = planPhases.find(phase => phase.id === openIteration);
    if (fromOpen) return fromOpen;
  }

  const scopedIterations = findings.rows
    .map(row => parseFindingRowIteration(row.phase))
    .filter((n): n is number => n != null);
  if (scopedIterations.length > 0) {
    const highest = planPhases.find(phase => phase.id === Math.max(...scopedIterations));
    if (highest) return highest;
  }

  return undefined;
}

export function resolveRoute(
  projectPath: string,
  changeName?: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): Route {
  const invalidArchiveState = findInvalidArchiveState(projectPath, changeName);
  if (invalidArchiveState) {
    return {
      kind: "invalid_archive_state",
      phase: "archive",
      invalidArchiveState,
      issues: [invalidArchiveState.reason],
      activeChangePath: invalidArchiveState.archivePath
    };
  }

  const pendingArchive = findPendingArchiveState(projectPath, changeName);
  if (pendingArchive) {
    return {
      kind: "pending_archive",
      phase: "archive",
      archiveState: pendingArchive,
      activeChangePath: pendingArchive.archivePath
    };
  }

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return { kind: "change_intake", phase: "change_intake", activeChangePath: null };
  }

  const paths = buildChangePaths(changeDir);
  if (!fs.existsSync(paths.prdPath) || !fs.existsSync(paths.executionContractPath)) {
    return { kind: "change_intake", phase: "change_intake", activeChangePath: changeDir };
  }

  const prdIssues = validatePrdArtifact(paths.prdPath);
  if (prdIssues.length > 0) {
    return { kind: "invalid_prd", phase: "change_intake", paths, issues: prdIssues, activeChangePath: changeDir };
  }

  const rulesResult = validateExecutionContract(paths.executionContractPath);
  if (!rulesResult.valid) {
    return { kind: "invalid_execution_contract", phase: "change_intake", paths, issues: rulesResult.issues, activeChangePath: changeDir };
  }

  if (!isSetupApproved(changeDir).approved) {
    return { kind: "change_intake_approval", phase: "change_intake", paths, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.researchPath)) {
    return { kind: "code_research", phase: "code_research", paths, activeChangePath: changeDir };
  }

  const researchIssues = validateResearchFacts(paths.researchPath, paths.prdPath);
  if (researchIssues.length > 0) {
    return { kind: "invalid_code_research", phase: "code_research", paths, issues: researchIssues, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.designPath)) {
    return { kind: "technical_design", phase: "technical_design", paths, activeChangePath: changeDir };
  }

  const designIssues = validateDesign(paths.designPath, {
    prdPath: paths.prdPath,
    researchPath: paths.researchPath
  });
  if (designIssues.length > 0) {
    return { kind: "invalid_technical_design", phase: "technical_design", paths, issues: designIssues, activeChangePath: changeDir };
  }

  if (!isDesignApproved(changeDir)) {
    return { kind: "technical_design_approval", phase: "technical_design", paths, activeChangePath: changeDir };
  }

  if (!fs.existsSync(paths.iterationPlanPath)) {
    return { kind: "iteration_planning", phase: "iteration_planning", paths, activeChangePath: changeDir };
  }

  const planPhases = parsePlan(paths.iterationPlanPath);
  const planIssues = validatePlanArtifact(paths.iterationPlanPath, paths.prdPath, paths.designPath);
  if (planIssues.length > 0) {
    return { kind: "invalid_iteration_planning", phase: "iteration_planning", paths, issues: planIssues, activeChangePath: changeDir };
  }

  if (!isPlanApproved(changeDir)) {
    return { kind: "iteration_planning_approval", phase: "iteration_planning", paths, activeChangePath: changeDir };
  }

  const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
  if (findings.exists) {
    const onlyVerdictCannotBypassOpenBlocking = findings.openBlockingRows.length > 0 &&
                                                 findings.issues.length > 0 &&
                                                 findings.issues.every(isVerdictOnlyOpenBlockingIssue);
    if (findings.issues.length > 0 && !onlyVerdictCannotBypassOpenBlocking) {
      return { kind: "invalid_findings", phase: "finding_repair", paths, issues: findings.issues.map(issue => issue.message), activeChangePath: changeDir };
    }

    if (findings.openBlockingRows.length > 0) {
      return { kind: "finding_repair", phase: "finding_repair", paths, activeChangePath: changeDir };
    }
  }

  // After repair with `repaired` verdict and no open blocking rows,
  // always route to re-validation. Do not route through iterationPhase()
  // which may return "implementation" due to stale Check Evidence that the
  // repair resolved.
  if (findings.exists && findings.verdict === "repaired" && findings.openBlockingRows.length === 0) {
    if (findings.type === "final") {
      return { kind: "final_validation", phase: "final_validation", paths, activeChangePath: changeDir };
    }

    const flowState = loadFlowState(projectPath, changeName);
    const targetIteration = deriveRepairedIteration(planPhases, flowState, findings);
    if (targetIteration) {
      return {
        kind: "iteration",
        phase: "iteration_validation",
        paths,
        activeIteration: targetIteration,
        activeChangePath: changeDir
      };
    }

    // No state-tracked or findings-referenced iteration: route the first
    // in_progress/not_started iteration through iterationPhase() — a
    // not_started iteration was never implemented and must go to
    // implementation, not iteration_validation.
    const fallbackIteration = planPhases.find(phase => phase.status === "in_progress" || phase.status === "not_started");
    if (fallbackIteration) {
      return {
        kind: "iteration",
        phase: iterationPhase(fallbackIteration),
        paths,
        activeIteration: fallbackIteration,
        activeChangePath: changeDir
      };
    }

    return { kind: "final_validation", phase: "final_validation", paths, activeChangePath: changeDir };
  }

  const incompleteIteration = planPhases.find(phase => phase.status === "in_progress" || phase.status === "not_started");
  if (incompleteIteration) {
    return {
      kind: "iteration",
      phase: iterationPhase(incompleteIteration),
      paths,
      activeIteration: incompleteIteration,
      activeChangePath: changeDir
    };
  }

  const finalReady = findings.exists &&
                     findings.type === "final" &&
                     (findings.verdict === "ready" || findings.verdict === "ready_with_risks");
  if (finalReady) {
    const allPhasesCompleted = planPhases.length > 0 && planPhases.every(phase => phase.status === "completed");
    const hasAnyReadinessBlockers = planPhases.some(phase => iterationValidationBlockers(phase).length > 0);
    if (!allPhasesCompleted || hasAnyReadinessBlockers) {
      return { kind: "archive_readiness_blocked", phase: "archive", paths, activeChangePath: changeDir };
    }

    return { kind: "archive_ready", phase: "archive", paths, activeChangePath: changeDir };
  }

  return { kind: "final_validation", phase: "final_validation", paths, activeChangePath: changeDir };
}
