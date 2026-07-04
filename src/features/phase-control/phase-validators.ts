import * as fs from "fs";
import { ActivePhase } from "../../entities/change/flow-state";
import { ChangePaths } from "../../entities/change/paths";
import { validatePrdArtifact } from "../../entities/prd/validate-prd";
import { validateExecutionContract } from "../../entities/execution-contract/validate-execution-contract";
import { validateResearchFacts } from "../../entities/research-facts/validate-research";
import { validateDesign } from "../../entities/design/validate-design";
import { validatePlanArtifact } from "../../entities/iteration-plan/validate-plan-artifact";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { iterationValidationBlockers } from "../../entities/iteration-plan/iteration-readiness";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { checkArchiveCompletion } from "./check-archive";
import { loadSchema, validateSchemaSections } from "../../entities/schema/load-schema";

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
  activeIteration: number | null
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
      const findings = parseValidationFindingsArtifact(paths.findingsPath);
      const issues: string[] = [];

      if (!findings.exists) {
        return failMessage(phase, ["validation_findings.md does not exist."]);
      }

      if (findings.issues.length > 0) {
        issues.push(...findings.issues);
      }

      if (findings.type !== "iteration") {
        issues.push("YAML field `type` must be `iteration` for iteration validation.");
      }

      // Verify that findings reference the active iteration
      if (activeIteration !== null && findings.rows.length > 0) {
        const iterStr = String(activeIteration);
        const matchingRows = findings.rows.filter(row =>
          row.phase === iterStr ||
          row.phase === `Iteration ${iterStr}` ||
          row.phase.startsWith(`${iterStr}`)
        );
        if (matchingRows.length === 0) {
          issues.push(
            `No findings reference iteration ${activeIteration}. Findings Iteration column must match the active iteration.`
          );
        }
      }

      // NOTE: [x] marking is done by applyStateSideEffects in advance-flow.ts
      // when advance transitions from iteration_validation. The B1 guard was
      // removed because it created a deadlock: validatePhase required [x], but
      // [x] is only set by advance *after* validatePhase passes. resolveRoute
      // already handles iteration transitions correctly — when verdict=ready,
      // it returns the next iteration (or final_validation), so advance never
      // no-ops on the same iteration.

      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "final_validation": {
      const findings = parseValidationFindingsArtifact(paths.findingsPath);
      const issues: string[] = [];

      if (!findings.exists) {
        return failMessage(phase, ["validation_findings.md does not exist."]);
      }

      if (findings.issues.length > 0) {
        issues.push(...findings.issues);
      }

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

      return issues.length === 0 ? okMessage(phase) : failMessage(phase, issues);
    }

    case "finding_repair": {
      const findings = parseValidationFindingsArtifact(paths.findingsPath);
      const issues: string[] = [];

      if (!findings.exists) {
        return failMessage(phase, ["validation_findings.md does not exist."]);
      }

      if (findings.issues.length > 0) {
        issues.push(...findings.issues);
      }

      // finding_repair phase requires at least one open (non-resolved) blocking finding
      if (findings.openBlockingRows.length === 0) {
        issues.push("No open blocking findings (MUST-FIX) in finding_repair phase. Findings must exist with open or reopened status.");
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
  }
}
