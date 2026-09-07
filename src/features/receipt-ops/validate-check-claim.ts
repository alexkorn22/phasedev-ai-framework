import * as fs from "fs";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import {
  evidenceMatchesCheckRecipe,
  normalizeTestCommand,
  parseRepairFindingScope,
  resolveFocusedGateCommand,
  resolveIterationFocusedCheckCommands,
  resolveRepairFocusedCheckCommands,
  requiredFocusedGateNames
} from "../../entities/test-commands/resolve-check-commands";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import { ReceiptUnit } from "../../entities/execution-receipts/types";
import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";
import { ReceiptContext } from "./receipt-context";

function gateFromUnit(unit: ReceiptUnit): "unit" | "phase" | "full" | null {
  if (unit === "check:unit") return "unit";
  if (unit === "check:phase") return "phase";
  if (unit === "check:full") return "full";
  return null;
}

export function validateCheckClaimCommand(input: {
  context: ReceiptContext;
  unit: ReceiptUnit;
  command?: string;
  blockingSeverity: BlockingSeverity;
}): string[] {
  const gate = gateFromUnit(input.unit);
  if (!gate) {
    return [];
  }

  if (!input.command || input.command.trim().length === 0) {
    return [`${input.unit} requires --command with the exact instantiated command.`];
  }

  const testCommands = parseTestCommands(input.context.paths.executionContractPath).commands;
  const normalizedCommand = normalizeTestCommand(input.command);

  if (gate === "full") {
    if (input.context.scope.kind !== "final") {
      return ["check:full is only valid for scope final."];
    }
    const fullCommand = testCommands.full;
    if (!fullCommand) {
      return ["execution_contract.md is missing the full gate command."];
    }
    if (normalizeTestCommand(fullCommand) !== normalizedCommand) {
      return ["check:full command must exactly equal execution_contract.md full gate command."];
    }
    return [];
  }

  const iterationId = input.context.scope.kind === "iteration"
    ? input.context.scope.iterationId
    : null;

  if (iterationId !== null) {
    const iteration = parsePlan(input.context.paths.iterationPlanPath).find(entry => entry.id === iterationId);
    if (!iteration) {
      return [`Iteration ${iterationId} was not found in iteration_plan.md.`];
    }
    const recipe = resolveFocusedGateCommand(gate, testCommands);
    if (!recipe) {
      return [`execution_contract.md is missing the ${gate} gate command.`];
    }
    const requiredGates = requiredFocusedGateNames(iteration);
    if (!requiredGates.includes(gate)) {
      return [`Iteration ${iterationId} does not require the ${gate} gate.`];
    }
    if (!evidenceMatchesCheckRecipe(recipe, normalizedCommand)) {
      return [`${input.unit} command does not satisfy the current ${gate} recipe matcher.`];
    }
    return [];
  }

  const findings = parseValidationFindingsArtifact(input.context.paths.findingsPath, input.blockingSeverity);
  const repairScope = parseRepairFindingScope(
    findings.rows.map(row => ({
      phase: row.phase,
      blocksPr: row.blocksPr,
      latestStatus: row.status
    }))
  );
  const plan = parsePlan(input.context.paths.iterationPlanPath);
  const repairChecks = resolveRepairFocusedCheckCommands(plan, testCommands, repairScope);
  const matchingRepair = repairChecks.find(check => check.gate === gate);
  if (!matchingRepair) {
    return [`Final repair scope does not select the ${gate} gate.`];
  }
  if (!evidenceMatchesCheckRecipe(matchingRepair.command, normalizedCommand)) {
    return [`${input.unit} command does not satisfy the current ${gate} recipe matcher for final repair.`];
  }

  return [];
}

export function hasOpenBlockingFindings(findingsPath: string, blockingSeverity: BlockingSeverity): boolean {
  if (!fs.existsSync(findingsPath)) {
    return false;
  }
  const findings = parseValidationFindingsArtifact(findingsPath, blockingSeverity);
  return findings.openBlockingRows.length > 0;
}

export function planRequiresManualAcceptance(context: ReceiptContext): boolean {
  const planContent = fs.existsSync(context.paths.iterationPlanPath)
    ? fs.readFileSync(context.paths.iterationPlanPath, "utf-8")
    : "";
  const prdContent = fs.existsSync(context.paths.prdPath)
    ? fs.readFileSync(context.paths.prdPath, "utf-8")
    : "";
  const marker = /\[Deferred to Final Validation \/ Manual Acceptance\]/i;
  return marker.test(planContent) || marker.test(prdContent);
}

export function iterationFocusedCommands(context: ReceiptContext, iterationId: number): string[] {
  const plan = parsePlan(context.paths.iterationPlanPath);
  const iteration = plan.find(entry => entry.id === iterationId);
  if (!iteration) {
    return [];
  }
  const testCommands = parseTestCommands(context.paths.executionContractPath).commands;
  return resolveIterationFocusedCheckCommands(iteration, testCommands).map(check => check.command);
}
