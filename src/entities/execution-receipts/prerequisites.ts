import { ParsedReceiptScope } from "./scope";
import { ExecutionReceiptsFile, ReceiptUnit } from "./types";
import { findCurrentReceipt } from "./receipt-store";

export function requiresManualAcceptance(planContent: string, prdContent: string): boolean {
  const marker = /\[Deferred to Final Validation \/ Manual Acceptance\]/i;
  return marker.test(planContent) || marker.test(prdContent);
}

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
  fullCommandDigest: string;
  requiresManualAcceptance: boolean;
}): string[] {
  const scopeKey = "final";
  const blockers: string[] = [];
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
  requiresManualAcceptance: boolean;
  hasOpenBlockingFindings: boolean;
}): string[] {
  const scopeKey = input.scope.kind === "final" ? "final" : `iteration:${input.scope.iterationId}`;
  const blockers: string[] = [];

  if (input.hasOpenBlockingFindings) {
    blockers.push("Open blocking findings must be resolved before claiming validation receipts.");
  }

  if (input.unit === "implementation-check") {
    const reviewUnits: ReceiptUnit[] = ["code-review", "security-review"];
    if (input.scope.kind === "final" && input.requiresManualAcceptance) {
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
