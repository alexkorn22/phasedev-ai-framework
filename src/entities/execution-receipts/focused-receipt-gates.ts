import { digestCommand } from "./command-digest";
import { findCurrentReceipt } from "./receipt-store";
import { ExecutionReceiptsFile, ReceiptUnit } from "./types";
import { parseFindingRowIteration } from "../validation-findings/parse-validation-findings";
import { Iteration } from "../iteration-plan/types";
import { TestCommands } from "../test-commands/parse-test-commands";
import {
  normalizeTestCommand,
  parseRepairFindingScope,
  RepairFindingScope,
  resolveRepairFocusedCheckCommands,
  ResolvedFocusedCheck,
  TEST_TARGETS_PLACEHOLDER
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

export function passedFocusedEvidenceCommands(
  iteration: Iteration,
  unit: FocusedReceiptRequirement["unit"]
): string[] {
  return (iteration.checkEvidence ?? [])
    .filter(row => row.result.trim().toLowerCase() === "passed" && gateUnit(row.check) === unit)
    .map(row => normalizeTestCommand(row.commandOrMethod))
    .filter(command => command.length > 0 && !command.includes(TEST_TARGETS_PLACEHOLDER));
}

export function focusedReceiptRequirementsFromIteration(
  iteration: Iteration,
  _testCommands: TestCommands
): FocusedReceiptRequirement[] {
  const seen = new Set<string>();
  const requirements: FocusedReceiptRequirement[] = [];

  for (const unit of ["check:unit", "check:phase"] as const) {
    for (const command of passedFocusedEvidenceCommands(iteration, unit)) {
      const commandDigest = digestCommand(command);
      if (seen.has(commandDigest)) {
        continue;
      }
      seen.add(commandDigest);
      requirements.push({ unit, command, commandDigest });
    }
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
  const targetIterations = scope.iterationIds.length > 0
    ? plan.filter(iteration => scope.iterationIds.includes(iteration.id))
    : scope.hasFinalScopeFindings
      ? plan
      : [];

  const seen = new Set<string>();
  const requirements: FocusedReceiptRequirement[] = [];

  for (const check of checks) {
    const unit = gateUnit(check.gate);
    if (!unit) {
      continue;
    }

    const evidenceCommands = targetIterations.flatMap(iteration =>
      passedFocusedEvidenceCommands(iteration, unit)
    );
    const commandsToRequire = evidenceCommands.length > 0
      ? evidenceCommands
      : [normalizeTestCommand(check.command)].filter(command =>
        command.length > 0 && !command.includes(TEST_TARGETS_PLACEHOLDER)
      );

    for (const command of commandsToRequire) {
      const commandDigest = digestCommand(command);
      const key = `${unit}:${commandDigest}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      requirements.push({ unit, command, commandDigest });
    }
  }

  return requirements;
}

export function repairFocusedResolvedChecks(
  plan: Iteration[],
  testCommands: TestCommands,
  findings: RepairFindingRow[],
  options?: { includeResolvedFindings?: boolean }
): ResolvedFocusedCheck[] {
  return repairFocusedReceiptRequirements(plan, testCommands, findings, options).map(requirement => ({
    gate: requirement.unit === "check:unit" ? "unit" : "phase",
    command: requirement.command
  }));
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
