import { ChangePaths } from "../../entities/change/paths";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { resetVerdictToPending } from "../artifact-ops/manage-findings";

export interface StaleFinalVerdictReset {
  reset: boolean;
  message?: string;
}

/**
 * When a scope change adds a new incomplete iteration to a change whose final
 * validation already passed, the terminal-final verdict is stale. Reset it to
 * `pending` so a fresh final validation is forced before archive. Runs only in
 * the mutating commands (advance, sync-state); resolveRoute stays pure.
 */
export function invalidateStaleFinalVerdict(
  paths: ChangePaths,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): StaleFinalVerdictReset {
  const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
  const isTerminalFinal =
    findings.exists &&
    findings.type === "final" &&
    (findings.verdict === "ready" || findings.verdict === "ready_with_risks");
  if (!isTerminalFinal) {
    return { reset: false };
  }

  const plan = parsePlan(paths.iterationPlanPath);
  const hasIncompleteIteration = plan.some(
    iteration => iteration.status === "not_started" || iteration.status === "in_progress"
  );
  if (!hasIncompleteIteration) {
    return { reset: false };
  }

  const result = resetVerdictToPending(paths.findingsPath);
  if (!result.ok) {
    return { reset: false };
  }

  return {
    reset: true,
    message: "Reset the stale final verdict to `pending`: a scope change left an incomplete iteration after final validation passed; re-validation is required before archive."
  };
}
