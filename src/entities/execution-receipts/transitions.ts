import { randomUUID } from "crypto";
import {
  CancelReceiptOutcome,
  ClaimReceiptOutcome,
  CompleteReceiptOutcome,
  ExecutionReceiptsFile,
  ReceiptRecord,
  ReceiptResult,
  ReceiptUnit
} from "./types";
import { findCurrentReceipt } from "./receipt-store";

function terminalStatusForResult(result: ReceiptResult): "passed" | "failed" | "blocked" {
  return result;
}

export function claimReceiptRecord(input: {
  file: ExecutionReceiptsFile;
  unit: ReceiptUnit;
  scope: string;
  diffDigest: string;
  commandDigest: string | null;
  claimedAt: string;
}): ClaimReceiptOutcome {
  const current = findCurrentReceipt(
    input.file,
    input.unit,
    input.scope,
    input.diffDigest,
    input.commandDigest
  );

  if (current?.status === "passed") {
    return {
      ok: true,
      action: "skip",
      claimId: current.claimId,
      message: `Current passed receipt exists for ${input.unit} (${input.scope}).`,
      record: current
    };
  }

  if (current?.status === "claimed") {
    return {
      ok: false,
      message: `Receipt ${input.unit} (${input.scope}) is already claimed (claim-id ${current.claimId}). Cancel it before claiming again.`
    };
  }

  const claimId = randomUUID();
  const record: ReceiptRecord = {
    unit: input.unit,
    scope: input.scope,
    diffDigest: input.diffDigest,
    commandDigest: input.commandDigest,
    claimId,
    status: "claimed",
    claimedAt: input.claimedAt
  };

  return {
    ok: true,
    action: "claimed",
    claimId,
    message: `Claimed receipt ${input.unit} (${input.scope}) with claim-id ${claimId}.`,
    record
  };
}

export function applyClaimReceipt(input: {
  file: ExecutionReceiptsFile;
  unit: ReceiptUnit;
  scope: string;
  diffDigest: string;
  commandDigest: string | null;
  claimedAt: string;
}): { file: ExecutionReceiptsFile; outcome: ClaimReceiptOutcome } {
  const outcome = claimReceiptRecord(input);
  if (!outcome.ok || outcome.action === "skip" || outcome.record === undefined) {
    return { file: input.file, outcome };
  }
  return {
    file: { ...input.file, receipts: [...input.file.receipts, outcome.record] },
    outcome
  };
}

export function completeReceiptRecord(input: {
  file: ExecutionReceiptsFile;
  unit: ReceiptUnit;
  scope: string;
  diffDigest: string;
  commandDigest: string | null;
  claimId: string;
  result: ReceiptResult;
  exitCode?: number;
  summary?: string;
  completedAt: string;
}): { file: ExecutionReceiptsFile; outcome: CompleteReceiptOutcome } {
  const current = findCurrentReceipt(
    input.file,
    input.unit,
    input.scope,
    input.diffDigest,
    input.commandDigest
  );

  if (!current || current.status !== "claimed") {
    return {
      file: input.file,
      outcome: {
        ok: false,
        message: `No active claim for ${input.unit} (${input.scope}) at the current digest.`
      }
    };
  }

  if (current.claimId !== input.claimId) {
    return {
      file: input.file,
      outcome: {
        ok: false,
        message: `Claim id mismatch for ${input.unit} (${input.scope}). Expected ${current.claimId}, got ${input.claimId}.`
      }
    };
  }

  const updated: ReceiptRecord = {
    ...current,
    status: terminalStatusForResult(input.result),
    result: input.result,
    exitCode: input.exitCode,
    summary: input.summary,
    completedAt: input.completedAt
  };

  const receipts = input.file.receipts.map(receipt => (receipt === current ? updated : receipt));
  return {
    file: { ...input.file, receipts },
    outcome: {
      ok: true,
      message: `Completed receipt ${input.unit} (${input.scope}) as ${input.result}.`,
      record: updated
    }
  };
}

export function cancelReceiptRecord(input: {
  file: ExecutionReceiptsFile;
  unit: ReceiptUnit;
  scope: string;
  diffDigest: string;
  commandDigest: string | null;
  claimId: string;
  reason: string;
  cancelledAt: string;
}): { file: ExecutionReceiptsFile; outcome: CancelReceiptOutcome } {
  const current = findCurrentReceipt(
    input.file,
    input.unit,
    input.scope,
    input.diffDigest,
    input.commandDigest
  );

  if (!current || current.status !== "claimed") {
    return {
      file: input.file,
      outcome: {
        ok: false,
        message: `No active claim for ${input.unit} (${input.scope}) at the current digest.`
      }
    };
  }

  if (current.claimId !== input.claimId) {
    return {
      file: input.file,
      outcome: {
        ok: false,
        message: `Claim id mismatch for ${input.unit} (${input.scope}). Expected ${current.claimId}, got ${input.claimId}.`
      }
    };
  }

  const updated: ReceiptRecord = {
    ...current,
    status: "cancelled",
    cancelReason: input.reason,
    completedAt: input.cancelledAt
  };

  const receipts = input.file.receipts.map(receipt => (receipt === current ? updated : receipt));
  return {
    file: { ...input.file, receipts },
    outcome: {
      ok: true,
      message: `Cancelled receipt ${input.unit} (${input.scope}).`,
      record: updated
    }
  };
}
