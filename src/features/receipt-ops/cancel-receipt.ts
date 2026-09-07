import { cancelReceiptRecord } from "../../entities/execution-receipts/transitions";
import { ReceiptUnit } from "../../entities/execution-receipts/types";
import {
  commandDigestForUnit,
  resolveReceiptContext,
  saveExecutionReceiptsFile
} from "./receipt-context";

export interface CancelReceiptResult {
  ok: boolean;
  message: string;
}

export function cancelReceipt(
  projectPath: string,
  unit: ReceiptUnit,
  scopeRaw: string,
  options: {
    claimId: string;
    reason: string;
    command?: string;
    changeName?: string;
  }
): CancelReceiptResult {
  const resolved = resolveReceiptContext(projectPath, scopeRaw, options.changeName);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const context = resolved.context;
  const commandDigest = commandDigestForUnit(unit, options.command);
  const { file, outcome } = cancelReceiptRecord({
    file: context.file,
    unit,
    scope: context.scopeKey,
    diffDigest: context.diffDigest,
    commandDigest,
    claimId: options.claimId,
    reason: options.reason,
    cancelledAt: new Date().toISOString()
  });

  if (!outcome.ok) {
    return { ok: false, message: outcome.message };
  }

  saveExecutionReceiptsFile(context.receiptsPath, file);
  return { ok: true, message: outcome.message };
}
