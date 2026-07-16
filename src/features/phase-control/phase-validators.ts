import * as fs from "fs";
import * as path from "path";
import { ActivePhase, FLOW_STATE_FILE, readFindingsBaseline } from "../../entities/change/flow-state";
import { ChangePaths } from "../../entities/change/paths";
import { validatePrdArtifact } from "../../entities/prd/validate-prd";
import { validateExecutionContract } from "../../entities/execution-contract/validate-execution-contract";
import { validateResearchFacts } from "../../entities/research-facts/validate-research";
import { validateDesign } from "../../entities/design/validate-design";
import { validatePlanArtifact } from "../../entities/iteration-plan/validate-plan-artifact";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { iterationValidationBlockers } from "../../entities/iteration-plan/iteration-readiness";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { checkFindingsAgainstBaseline } from "../../entities/validation-findings/findings-baseline";
import { checkArchiveCompletion } from "./check-archive";
import { loadSchema, validateSchemaSections } from "../../entities/schema/load-schema";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY, blockingSeverityLabel } from "../../entities/validation-findings/blocking-severity";

export interface PhaseValidation {
  ok: boolean;
  issues: string[];
  message: string;
}

function okMessage(phase: string): PhaseValidation {
  return { ok: true, issues: [], message: `phase ${phase}: OK` };
}

function failMessage(phase: string, issues: string[]): PhaseValidation {
  return { ok: false, issues, message: `phase ${phase}: ISSUES\n${issues.map(i => `- ${i}`).join("\n")}` };
}

function findingsBaselineIssues(paths: ChangePaths): string[] {
  const baseline = readFindingsBaseline(path.join(paths.changeDir, FLOW_STATE_FILE));
  return baseline ? checkFindingsAgainstBaseline(paths.findingsPath, baseline) : [];
}

export function revalidationPendingMessage(): string {
  return "Re-validation pending: verdict is `repaired`. Re-run validation, then set a terminal verdict with `phasedev set-verdict ready|ready_with_risks|repair_required`.";
}

/**
 * Read file content for schema section validation.
 * Returns empty string if file doesn't exist.
 */
function readContent(filePath: string): string {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Validate artifacts for a given phase.
 *
 * Schema validation modes:
 * - Partial: optional sections may be absent (used during phase work).
 * - Full: all schema sections treated as required (used in final_validation).
 */
export function validatePhase(
  projectPath: string,
  phase: ActivePhase,
  paths: ChangePaths,
  activeIteration: number | null,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): PhaseValidation {
  switch (phase) {
    case "change_intake": {
      const prdIssues = validatePrdArtifact(paths.prdPath);
      const ecResult = validateExecutionContract(paths.executionContractPath);
      const issues = [...prdIssues, ...(ecResult.valid ? [] : ecResult.issues)];
      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "code_research": {
      const issues = validateResearchFacts(paths.researchPath, paths.prdPath);
      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "technical_design": {
      // Guard: if design.md doesn't exist, report once instead of N+1 issues
      if (!fs.existsSync(paths.designPath)) {
        return failMessage(phase, ["design.md does not exist."]);
      }

      const structIssues = validateDesign(paths.designPath, {
        prdPath: paths.prdPath,
        researchPath: paths.researchPath
      });

      // Schema partial validation: optional sections can be absent
      const schema = loadSchema("design");
      const sectionIssues = schema
        ? validateSchemaSections(readContent(paths.designPath), schema, "partial")
        : [];

      const issues = [...structIssues, ...sectionIssues];
      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "iteration_planning": {
      const issues = validatePlanArtifact(paths.iterationPlanPath, paths.prdPath, paths.designPath);
      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "implementation": {
      if (activeIteration === null) {
        return failMessage(phase, ["No active iteration set."]);
      }

      const plan = parsePlan(paths.iterationPlanPath);
      const iter = plan.find(p => p.id === activeIteration);
      if (!iter) {
        return failMessage(phase, [`Iteration ${activeIteration} not found in iteration plan.`]);
      }

      const blockers = iterationValidationBlockers(iter);
      if (blockers.length > 0) {
        return failMessage(phase, blockers);
      }

      return okMessage(phase);
    }

    case "iteration_validation": {
      const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
      const issues: string[] = [];

      if (!findings.exists) {
        return failMessage(phase, ["validation_findings.md does not exist."]);
      }

      if (findings.issues.length > 0) {
        issues.push(...findings.issues.map(issue => issue.message));
      }

      issues.push(...findingsBaselineIssues(paths));

      if (findings.type !== "iteration") {
        issues.push("YAML field `type` must be `iteration` for iteration validation.");
      }

      if (findings.verdict === "repaired" && findings.openBlockingRows.length === 0) {
        issues.push(revalidationPendingMessage());
      }

      // NOTE: iteration completeness (whether findings cover the active
      // iteration) is checkValidationCompletion's authority, not this gate's.
      // A prior row-matching gate here required findings rows to reference
      // the active iteration whenever the registry was non-empty, which
      // blocked a genuinely clean iteration N when only stale resolved rows
      // from earlier iterations remained; it was removed as redundant with
      // and divergent from checkValidationCompletion.
      //
      // [x] marking is the agent's job (see checkValidationCompletion), not
      // a requirement here. The B1 guard was removed because it created a
      // deadlock: validatePhase required [x], but the [x] side effect in
      // advance-flow only runs *after* validatePhase passes. If the agent set
      // verdict: ready without marking [x], resolveRoute returns the same
      // iteration and advanceFlow refuses with a same-state no-op message.

      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "final_validation": {
      const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
      const issues: string[] = [];

      if (!findings.exists) {
        return failMessage(phase, ["validation_findings.md does not exist."]);
      }

      if (findings.issues.length > 0) {
        issues.push(...findings.issues.map(issue => issue.message));
      }

      issues.push(...findingsBaselineIssues(paths));

      if (findings.type !== "final") {
        issues.push("YAML field `type` must be `final` for final validation.");
      }

      // Schema full validation: all sections required
      const schema = loadSchema("design");
      if (schema) {
        if (fs.existsSync(paths.designPath)) {
          const sectionIssues = validateSchemaSections(
            readContent(paths.designPath),
            schema,
            "full"
          );
          issues.push(...sectionIssues);
        } else {
          issues.push("design.md does not exist (required for final_validation schema check).");
        }
      }

      if (findings.verdict === "repaired" && findings.openBlockingRows.length === 0) {
        issues.push(revalidationPendingMessage());
      }

      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "finding_repair": {
      const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
      const issues: string[] = [];

      if (!findings.exists) {
        return failMessage(phase, ["validation_findings.md does not exist."]);
      }

      if (findings.issues.length > 0) {
        issues.push(...findings.issues.map(issue => issue.message));
      }

      issues.push(...findingsBaselineIssues(paths));

      // finding_repair is valid in two states: repair ongoing (open blocking
      // findings remain) or repair finished (verdict: repaired with all blocking
      // findings resolved — the exit state advance routes onward from). Anything
      // else (e.g. all findings resolved but verdict still repair_required) is
      // an inconsistent artifact.
      if (findings.openBlockingRows.length === 0 && findings.verdict !== "repaired") {
        issues.push(`No open blocking findings (${blockingSeverityLabel(blockingSeverity)}) in finding_repair phase. Either blocking findings must remain open/reopened, or set \`verdict: repaired\` after resolving them all.`);
      }

      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "archive": {
      const result = checkArchiveCompletion(paths.changeDir);
      if (!result.ok) {
        return failMessage(phase, result.issues);
      }
      return okMessage(phase);
    }

    default:
      throw new Error(`validatePhase reached unreachable phase "${phase}" (quick phases are validated by validateQuickPhase).`);
  }
}

/**
 * Exit gate for advance: structural validity (validatePhase) plus the
 * phase-completion conditions that must hold before the flow may leave the
 * phase. validatePhase answers "are the artifacts consistent for this phase
 * (in progress or done)"; validatePhaseExit answers "is the phase finished".
 * Entry conditions are resolveRoute's job, never checked here.
 */
export function validatePhaseExit(
  projectPath: string,
  phase: ActivePhase,
  paths: ChangePaths,
  activeIteration: number | null,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): PhaseValidation {
  const base = validatePhase(projectPath, phase, paths, activeIteration, blockingSeverity);
  if (!base.ok) {
    return base;
  }

  if (phase === "finding_repair") {
    const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
    const issues: string[] = [];

    if (findings.openBlockingRows.length > 0) {
      issues.push(`Repair not finished: ${findings.openBlockingRows.length} blocking finding(s) still open or reopened.`);
    }
    if (findings.verdict !== "repaired") {
      issues.push("Repair not finished: set `verdict: repaired` after resolving all blocking findings.");
    }

    if (issues.length > 0) {
      return failMessage(phase, issues);
    }
  }

  return base;
}
