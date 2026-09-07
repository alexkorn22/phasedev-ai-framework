import { digestCommand } from "./command-digest";
import { findCurrentReceipt } from "./receipt-store";
import { ExecutionReceiptsFile, ReceiptUnit } from "./types";
import { parseFindingRowIteration } from "../validation-findings/parse-validation-findings";
import { Iteration } from "../iteration-plan/types";
import { TestCommands } from "../test-commands/parse-test-commands";
import {
  evidenceMatchesRequiredCheck,
  normalizeTestCommand,
  parseRepairFindingScope,
  RepairFindingScope,
  resolveRepairFocusedCheckCommands
} from "../test-commands/resolve-check-commands";
import { formatReceiptScope, ParsedReceiptScope } from "./scope";

export interface FocusedReceiptRequirement {
  unit: Extract<ReceiptUnit, "check:unit" | "check:phase">;
  command: string;
  commandDigest: string;
}

function gateUnit(gate: string): FocusedReceiptRequirement["unit"] | null {
  const normalized = gate.trim().toLowerCase();
  if (normalized === "unit") return "check:unit";
  if (normalized === "phase") return "check:phase";
  return null;
}

export function focusedReceiptRequirementsFromIteration(
  iteration: Iteration,
  testCommands: TestCommands
): FocusedReceiptRequirement[] {
  const seen = new Set<string>();
  const requirements: FocusedReceiptRequirement[] = [];

  for (const row of iteration.checkEvidence ?? []) {
    if (row.result !== "passed") {
      continue;
    }
    const unit = gateUnit(row.check);
    if (!unit) {
      continue;
    }
    const requiredCheck = (iteration.requiredChecks ?? []).find(
      check => check.check.trim().toLowerCase() === row.check.trim().toLowerCase()
    ) ?? { check: row.check, command: row.commandOrMethod };
    if (!evidenceMatchesRequiredCheck(requiredCheck, row.commandOrMethod, testCommands)) {
      continue;
    }
    const command = normalizeTestCommand(row.commandOrMethod);
    const commandDigest = digestCommand(command);
    if (seen.has(commandDigest)) {
      continue;
    }
    seen.add(commandDigest);
    requirements.push({ unit, command, commandDigest });
  }

  return requirements;
}

export function focusedReceiptBlockers(input: {
  file: ExecutionReceiptsFile;
  scope: ParsedReceiptScope;
  diffDigest: string;
  requirements: FocusedReceiptRequirement[];
}): string[] {
  const scopeKey = formatReceiptScope(input.scope);
  return input.requirements.flatMap(requirement => {
    const current = findCurrentReceipt(
      input.file,
      requirement.unit,
      scopeKey,
      input.diffDigest,
      requirement.commandDigest
    );
    if (current?.status === "passed") {
      return [];
    }
    return [
      `Missing current passed receipt for ${requirement.unit} (${scopeKey}) matching Check Evidence command \`${requirement.command}\`. Run phasedev claim-receipt ${requirement.unit} --scope ${scopeKey} --command ${requirement.command}.`
    ];
  });
}

export interface RepairFindingRow {
  phase: string;
  blocksPr: boolean;
  latestStatus: string;
}

export function repairExitFindingScope(findings: RepairFindingRow[]): RepairFindingScope {
  const blocking = findings.filter(finding => finding.blocksPr);
  const iterationIds = new Set<number>();
  let hasFinalScopeFindings = false;

  for (const finding of blocking) {
    if (finding.phase.trim().toLowerCase() === "final") {
      hasFinalScopeFindings = true;
      continue;
    }
    const iterationId = parseFindingRowIteration(finding.phase);
    if (iterationId !== null) {
      iterationIds.add(iterationId);
    }
  }

  return {
    iterationIds: Array.from(iterationIds),
    hasFinalScopeFindings
  };
}

export function repairFocusedReceiptRequirements(
  plan: Iteration[],
  testCommands: TestCommands,
  findings: RepairFindingRow[],
  options?: { includeResolvedFindings?: boolean }
): FocusedReceiptRequirement[] {
  const scope = options?.includeResolvedFindings
    ? repairExitFindingScope(findings)
    : parseRepairFindingScope(findings);
  const checks = resolveRepairFocusedCheckCommands(plan, testCommands, scope);
  return checks.flatMap(check => {
    const unit = gateUnit(check.gate);
    if (!unit) {
      return [];
    }
    const command = normalizeTestCommand(check.command);
    return [{
      unit,
      command,
      commandDigest: digestCommand(command)
    }];
  });
}

export function repairReceiptScope(
  plan: Iteration[],
  findings: RepairFindingRow[],
  options?: { includeResolvedFindings?: boolean }
): ParsedReceiptScope {
  const scope = options?.includeResolvedFindings
    ? repairExitFindingScope(findings)
    : parseRepairFindingScope(findings);
  if (scope.iterationIds.length > 0) {
    return { kind: "iteration", iterationId: scope.iterationIds[0] };
  }
  return { kind: "final" };
}
