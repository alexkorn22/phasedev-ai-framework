import { completeReceiptRecord } from "../../entities/execution-receipts/transitions";
import { ReceiptResult, ReceiptUnit } from "../../entities/execution-receipts/types";
import {
  commandDigestForUnit,
  resolveReceiptContext,
  saveExecutionReceiptsFile
} from "./receipt-context";

export interface CompleteReceiptResult {
  ok: boolean;
  message: string;
}

export function completeReceipt(
  projectPath: string,
  unit: ReceiptUnit,
  scopeRaw: string,
  options: {
    claimId: string;
    result: ReceiptResult;
    command?: string;
    exitCode?: number;
    summary?: string;
    changeName?: string;
  }
): CompleteReceiptResult {
  const resolved = resolveReceiptContext(projectPath, scopeRaw, options.changeName);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const context = resolved.context;
  const commandDigest = commandDigestForUnit(unit, options.command);
  const { file, outcome } = completeReceiptRecord({
    file: context.file,
    unit,
    scope: context.scopeKey,
    diffDigest: context.diffDigest,
    commandDigest,
    claimId: options.claimId,
    result: options.result,
    exitCode: options.exitCode,
    summary: options.summary,
    completedAt: new Date().toISOString()
  });

  if (!outcome.ok) {
    return { ok: false, message: outcome.message };
  }

  saveExecutionReceiptsFile(context.receiptsPath, file);
  return { ok: true, message: outcome.message };
}
