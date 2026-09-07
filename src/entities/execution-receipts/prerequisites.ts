import { ParsedReceiptScope } from "./scope";
import { findCurrentReceipt } from "./receipt-store";
import { requiresManualAcceptance } from "./manual-acceptance";
import { ExecutionReceiptsFile, ReceiptUnit } from "./types";

const VALIDATION_ROLE_UNITS = new Set<ReceiptUnit>([
  "code-review",
  "security-review",
  "manual-acceptance",
  "implementation-check"
]);

function receiptPassed(
  file: ExecutionReceiptsFile,
  unit: ReceiptUnit,
  scope: string,
  diffDigest: string,
  commandDigest: string | null = null
): boolean {
  const current = findCurrentReceipt(file, unit, scope, diffDigest, commandDigest);
  return current?.status === "passed";
}

export function iterationValidationReceiptBlockers(input: {
  file: ExecutionReceiptsFile;
  scope: ParsedReceiptScope & { kind: "iteration" };
  diffDigest: string;
}): string[] {
  const scopeKey = `iteration:${input.scope.iterationId}`;
  const required: ReceiptUnit[] = ["code-review", "security-review", "implementation-check"];
  const blockers: string[] = [];

  for (const unit of required) {
    if (!receiptPassed(input.file, unit, scopeKey, input.diffDigest)) {
      blockers.push(`Missing current passed receipt for ${unit} (${scopeKey}). Run phasedev claim-receipt ${unit} --scope ${scopeKey} and complete it before validation completion.`);
    }
  }

  return blockers;
}

export function finalValidationReceiptBlockers(input: {
  file: ExecutionReceiptsFile;
  diffDigest: string;
  fullCommandDigest: string | null;
  requiresManualAcceptance: boolean;
}): string[] {
  const scopeKey = "final";
  const blockers: string[] = [];

  if (input.fullCommandDigest === null) {
    blockers.push("execution_contract.md is missing the full gate command required for final validation receipts.");
    return blockers;
  }

  const roleUnits: ReceiptUnit[] = ["code-review", "security-review", "implementation-check"];
  if (input.requiresManualAcceptance) {
    roleUnits.splice(2, 0, "manual-acceptance");
  }

  for (const unit of roleUnits) {
    if (!receiptPassed(input.file, unit, scopeKey, input.diffDigest)) {
      blockers.push(`Missing current passed receipt for ${unit} (${scopeKey}).`);
    }
  }

  if (!receiptPassed(input.file, "check:full", scopeKey, input.diffDigest, input.fullCommandDigest)) {
    blockers.push("Missing current passed receipt for check:full (final) at the current full command digest.");
  }

  return blockers;
}

export function claimPrerequisiteBlockers(input: {
  file: ExecutionReceiptsFile;
  unit: ReceiptUnit;
  scope: ParsedReceiptScope;
  diffDigest: string;
  commandDigest: string | null;
  planContent: string;
  prdContent: string;
  hasOpenBlockingFindings: boolean;
}): string[] {
  const scopeKey = input.scope.kind === "final" ? "final" : `iteration:${input.scope.iterationId}`;
  const blockers: string[] = [];
  const manualRequired = requiresManualAcceptance({
    planContent: input.planContent,
    prdContent: input.prdContent
  });

  if (input.hasOpenBlockingFindings && VALIDATION_ROLE_UNITS.has(input.unit)) {
    blockers.push("Open blocking findings must be resolved before claiming validation role receipts.");
  }

  if (input.unit === "implementation-check") {
    const reviewUnits: ReceiptUnit[] = ["code-review", "security-review"];
    if (input.scope.kind === "final" && manualRequired) {
      reviewUnits.push("manual-acceptance");
    }
    for (const unit of reviewUnits) {
      if (!receiptPassed(input.file, unit, scopeKey, input.diffDigest)) {
        blockers.push(`Claiming implementation-check requires current passed ${unit} receipt for ${scopeKey}.`);
      }
    }
    const existingImplementationCheck = findCurrentReceipt(
      input.file,
      "implementation-check",
      scopeKey,
      input.diffDigest,
      null
    );
    if (existingImplementationCheck?.status === "claimed") {
      blockers.push("implementation-check is already claimed for this scope and digest.");
    }
    return blockers;
  }

  if (input.unit === "check:full") {
    if (input.scope.kind !== "final") {
      blockers.push("check:full is only valid for scope final.");
      return blockers;
    }
    const implementationCheck = findCurrentReceipt(
      input.file,
      "implementation-check",
      scopeKey,
      input.diffDigest,
      null
    );
    if (!implementationCheck || implementationCheck.status !== "claimed") {
      blockers.push("check:full requires an active implementation-check claim for the same digest.");
    }
    return blockers;
  }

  if (input.unit === "check:unit" || input.unit === "check:phase") {
    if (!input.commandDigest) {
      blockers.push(`${input.unit} requires --command with the exact instantiated command.`);
    }
  }

  return blockers;
}

export function implementationCheckCompletionBlockers(input: {
  unit: ReceiptUnit;
  file: ExecutionReceiptsFile;
  scope: string;
  diffDigest: string;
  fullCommandDigest: string | null;
  result: "passed" | "failed" | "blocked";
}): string[] {
  if (input.unit !== "implementation-check" || input.scope !== "final" || input.result !== "passed") {
    return [];
  }
  if (input.fullCommandDigest === null) {
    return ["execution_contract.md is missing the full gate command required to complete final implementation-check."];
  }
  if (!receiptPassed(input.file, "check:full", "final", input.diffDigest, input.fullCommandDigest)) {
    return ["Completing final implementation-check as passed requires a current passed check:full receipt for the same digest."];
  }
  return [];
}

const CHECK_RECEIPT_UNITS = new Set<ReceiptUnit>(["check:unit", "check:phase", "check:full"]);

export function checkReceiptCompletionBlockers(input: {
  unit: ReceiptUnit;
  result: "passed" | "failed" | "blocked";
  exitCode?: number;
}): string[] {
  if (!CHECK_RECEIPT_UNITS.has(input.unit) || input.result !== "passed") {
    return [];
  }
  if (input.exitCode !== 0) {
    return [
      `Completing ${input.unit} as passed requires --exit-code 0 with the observed command result.`
    ];
  }
  return [];
}
