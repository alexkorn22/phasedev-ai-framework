import { ChangePaths } from "../../entities/change/paths";
import { parseBrowserValidation } from "../../entities/execution-contract/parse-browser-validation";
import {
  FinalGateName,
  FinalGateRow,
  parseFinalGateEvidence
} from "../../entities/final-gate-evidence/parse-final-gate-evidence";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { normalizeTestCommand } from "../../entities/test-commands/resolve-check-commands";
import * as fs from "fs";

function gateIssue(gate: FinalGateName, detail: string): string {
  return `Final gate \`${gate}\` ${detail}.`;
}

function gateRowIssue(row: FinalGateRow | undefined, gate: FinalGateName, expectedCommand: string): string | null {
  if (!row) {
    return gateIssue(gate, "is not recorded");
  }
  if (normalizeTestCommand(row.command) !== normalizeTestCommand(expectedCommand)) {
    return gateIssue(gate, "command is stale or does not match the execution contract");
  }
  if (row.result === "passed") {
    return null;
  }
  if (row.result === "blocked") {
    return gateIssue(gate, "result is blocked (must be passed)");
  }
  if (row.result === "failed") {
    return gateIssue(gate, "result is failed (must be passed)");
  }
  return gateIssue(gate, `result is ${row.result} (must be passed)`);
}

export function finalReadyGateIssues(paths: ChangePaths): string[] {
  const issues: string[] = [];
  const artifact = parseFinalGateEvidence(paths.finalGateEvidencePath);
  const rows = artifact.rows;

  const { commands, missing } = parseTestCommands(paths.executionContractPath);
  if (missing.includes("full") || !commands.full) {
    issues.push(gateIssue("full", "is required but execution contract is missing the full test command"));
  } else {
    const fullRow = rows.find(row => row.gate === "full");
    const fullIssue = gateRowIssue(fullRow, "full", commands.full);
    if (fullIssue) {
      issues.push(fullIssue);
    }
  }

  const browser = parseBrowserValidation(paths.executionContractPath);
  if (browser.present && browser.url && browser.url.trim().length > 0) {
    const browserRow = rows.find(row => row.gate === "browser");
    const browserIssue = gateRowIssue(browserRow, "browser", browser.url);
    if (browserIssue) {
      issues.push(browserIssue);
    }
  }

  return issues;
}

// Gate issues apply only when every iteration is [x] (archive-bound). An
// incomplete plan skips gate checks so a stale final ready verdict can still
// advance out of final_validation during scope-change un-wedge.
export function finalReadyGateIssuesWhenArchiveBound(paths: ChangePaths): string[] {
  if (!fs.existsSync(paths.iterationPlanPath)) {
    return finalReadyGateIssues(paths);
  }
  const plan = parsePlan(paths.iterationPlanPath);
  if (plan.length === 0 || !plan.every(iteration => iteration.status === "completed")) {
    return [];
  }
  return finalReadyGateIssues(paths);
}
