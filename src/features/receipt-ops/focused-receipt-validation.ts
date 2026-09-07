import * as fs from "fs";
import { ChangePaths } from "../../entities/change/paths";
import {
  focusedReceiptBlockers,
  focusedReceiptRequirementsFromIteration,
  repairFocusedReceiptRequirements,
  repairReceiptScope
} from "../../entities/execution-receipts/focused-receipt-gates";
import { requiresManualAcceptance } from "../../entities/execution-receipts/manual-acceptance";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";
import { scanChangedFilesOutsidePhasedev } from "../phase-control/changed-file-inventory";
import { computeDiffDigest, resolveScopeDiffBase } from "./compute-diff-digest";
import { loadExecutionReceiptsFile } from "./receipt-context";

export function hasProductCodeChanges(projectPath: string): boolean {
  const scan = scanChangedFilesOutsidePhasedev(projectPath);
  return scan.ok && scan.entries.length > 0;
}

export function implementationFocusedReceiptIssues(
  projectPath: string,
  paths: ChangePaths,
  activeIteration: number
): string[] {
  const loaded = loadExecutionReceiptsFile(paths.executionReceiptsPath);
  if (!loaded.ok) {
    return [loaded.message];
  }

  const iteration = parsePlan(paths.iterationPlanPath).find(entry => entry.id === activeIteration);
  if (!iteration) {
    return [`Iteration ${activeIteration} was not found in iteration_plan.md.`];
  }

  const testCommands = parseTestCommands(paths.executionContractPath).commands;
  const scope = { kind: "iteration" as const, iterationId: activeIteration };
  const diffDigest = computeDiffDigest(projectPath, resolveScopeDiffBase(paths.statePath, scope));

  return focusedReceiptBlockers({
    file: loaded.file,
    scope,
    diffDigest,
    requirements: focusedReceiptRequirementsFromIteration(iteration, testCommands)
  });
}

export function repairFocusedReceiptIssues(
  projectPath: string,
  paths: ChangePaths,
  blockingSeverity: BlockingSeverity
): string[] {
  if (!hasProductCodeChanges(projectPath)) {
    return [];
  }

  const loaded = loadExecutionReceiptsFile(paths.executionReceiptsPath);
  if (!loaded.ok) {
    return [loaded.message];
  }

  const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
  const findingRows = findings.rows.map(row => ({
    phase: row.phase,
    blocksPr: row.blocksPr,
    latestStatus: row.status
  }));
  const plan = parsePlan(paths.iterationPlanPath);
  const testCommands = parseTestCommands(paths.executionContractPath).commands;
  const scope = repairReceiptScope(plan, findingRows);
  const diffDigest = computeDiffDigest(projectPath, resolveScopeDiffBase(paths.statePath, scope));

  return focusedReceiptBlockers({
    file: loaded.file,
    scope,
    diffDigest,
    requirements: repairFocusedReceiptRequirements(plan, testCommands, findingRows)
  });
}

export function manualAcceptanceRequired(paths: ChangePaths): boolean {
  const planContent = fs.existsSync(paths.iterationPlanPath)
    ? fs.readFileSync(paths.iterationPlanPath, "utf-8")
    : "";
  const prdContent = fs.existsSync(paths.prdPath)
    ? fs.readFileSync(paths.prdPath, "utf-8")
    : "";
  return requiresManualAcceptance({ planContent, prdContent });
}
