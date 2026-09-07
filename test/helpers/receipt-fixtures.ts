import { claimReceipt } from "../../src/features/receipt-ops/claim-receipt";
import { completeReceipt } from "../../src/features/receipt-ops/complete-receipt";
import { ReceiptUnit } from "../../src/entities/execution-receipts/types";

const ITERATION_ROLE_UNITS: ReceiptUnit[] = ["code-review", "security-review", "implementation-check"];

function completeClaimedReceipt(
  projectPath: string,
  unit: ReceiptUnit,
  scope: string,
  options?: { command?: string }
): void {
  const claim = claimReceipt(projectPath, unit, scope, options);
  if (!claim.ok || !claim.claimId) {
    throw new Error(`Failed to seed ${unit} receipt for ${scope}: ${claim.message}`);
  }
  if (claim.action === "skip") {
    return;
  }
  const complete = completeReceipt(projectPath, unit, scope, {
    claimId: claim.claimId,
    result: "passed",
    command: options?.command
  });
  if (!complete.ok) {
    throw new Error(`Failed to complete ${unit} receipt for ${scope}: ${complete.message}`);
  }
}

export function seedIterationValidationReceipts(projectPath: string, iterationId: number): void {
  const scope = `iteration:${iterationId}`;
  for (const unit of ITERATION_ROLE_UNITS) {
    completeClaimedReceipt(projectPath, unit, scope);
  }
}

export function seedFinalValidationReceipts(projectPath: string, fullCommand = "bun test full"): void {
  completeClaimedReceipt(projectPath, "code-review", "final");
  completeClaimedReceipt(projectPath, "security-review", "final");

  const implementationClaim = claimReceipt(projectPath, "implementation-check", "final");
  if (!implementationClaim.ok || !implementationClaim.claimId) {
    throw new Error(`Failed to claim implementation-check for final: ${implementationClaim.message}`);
  }
  if (implementationClaim.action !== "skip") {
    const fullClaim = claimReceipt(projectPath, "check:full", "final", { command: fullCommand });
    if (!fullClaim.ok || !fullClaim.claimId) {
      throw new Error(`Failed to claim check:full for final: ${fullClaim.message}`);
    }
    completeReceipt(projectPath, "check:full", "final", {
      claimId: fullClaim.claimId,
      result: "passed",
      command: fullCommand
    });
    completeReceipt(projectPath, "implementation-check", "final", {
      claimId: implementationClaim.claimId,
      result: "passed"
    });
  }
}
