import { ChangePaths } from "../../entities/change/paths";
import { ActivePhase } from "../../entities/change/flow-state";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { resetVerdictToPending, setFindingsType } from "../artifact-ops/manage-findings";
import { expectedFindingsType } from "./expected-findings-type";

export interface ValidationStateNormalization {
  changed: boolean;
  notes: string[];
}

/**
 * Normalizes a newly entered validation scope. An inherited terminal verdict
 * would pre-pass the new scope and collapse final_validation into archive_ready.
 */
export function enterValidationPhase(
  paths: ChangePaths,
  enteredPhase: ActivePhase,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): ValidationStateNormalization {
  const expected = expectedFindingsType(enteredPhase);
  if (!expected) {
    return { changed: false, notes: [] };
  }

  setFindingsType(paths.findingsPath, expected);

  const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
  if (
    findings.exists &&
    (findings.verdict === "ready" || findings.verdict === "ready_with_risks") &&
    resetVerdictToPending(paths.findingsPath).ok
  ) {
    return {
      changed: true,
      notes: [
        `Reset the inherited \`${findings.verdict}\` verdict to \`pending\`: ${enteredPhase} is a new validation scope and starts unvalidated; run the validation, then set a terminal verdict with \`phasedev set-verdict\`.`
      ]
    };
  }

  return { changed: false, notes: [] };
}

/**
 * Pre-route normalization for the mutating commands (advance, sync-state).
 * Enforces Invariant T and invalidates a stale terminal-final verdict after a
 * scope change. resolveRoute stays pure; all writes happen here.
 */
export function normalizeValidationState(
  paths: ChangePaths,
  activePhase: ActivePhase,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): ValidationStateNormalization {
  const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
  if (!findings.exists) {
    return { changed: false, notes: [] };
  }

  const notes: string[] = [];

  // Rule (a): stale terminal-final verdict + an incomplete iteration -> pending.
  const isTerminalFinal =
    findings.type === "final" &&
    (findings.verdict === "ready" || findings.verdict === "ready_with_risks");
  if (isTerminalFinal) {
    const plan = parsePlan(paths.iterationPlanPath);
    const hasIncompleteIteration = plan.some(
      iteration => iteration.status === "not_started" || iteration.status === "in_progress"
    );
    if (hasIncompleteIteration && resetVerdictToPending(paths.findingsPath).ok) {
      notes.push(
        "Reset the stale final verdict to `pending`: a scope change left an incomplete iteration after final validation passed; re-validation is required before archive."
      );
    }
  }

  // Rule (b): findings type must match the locked validation phase (Invariant T).
  const expected = expectedFindingsType(activePhase);
  if (expected && findings.type !== expected) {
    setFindingsType(paths.findingsPath, expected);
    notes.push(
      `Normalized validation_findings.md \`type\` to \`${expected}\` to match the locked ${activePhase} phase (stale \`type\` left over from a prior validation).`
    );
  }

  return { changed: notes.length > 0, notes };
}
