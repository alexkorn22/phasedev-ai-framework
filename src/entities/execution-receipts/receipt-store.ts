import { RECEIPT_UNITS, ExecutionReceiptsFile, ReceiptRecord, ReceiptUnit } from "./types";

export const EXECUTION_RECEIPTS_VERSION = 1;

export function emptyExecutionReceiptsFile(): ExecutionReceiptsFile {
  return { version: EXECUTION_RECEIPTS_VERSION, receipts: [] };
}

function isReceiptUnit(value: unknown): value is ReceiptUnit {
  return typeof value === "string" && (RECEIPT_UNITS as readonly string[]).includes(value);
}

function isReceiptRecord(value: unknown): value is ReceiptRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.unit === "string"
    && isReceiptUnit(record.unit)
    && typeof record.scope === "string"
    && typeof record.diffDigest === "string"
    && (record.commandDigest === null || typeof record.commandDigest === "string")
    && typeof record.claimId === "string"
    && typeof record.status === "string"
    && typeof record.claimedAt === "string";
}

export function parseExecutionReceiptsFile(raw: unknown): ExecutionReceiptsFile | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== EXECUTION_RECEIPTS_VERSION || !Array.isArray(record.receipts)) {
    return null;
  }
  const receipts = record.receipts.filter(isReceiptRecord);
  if (receipts.length !== record.receipts.length) {
    return null;
  }
  return { version: EXECUTION_RECEIPTS_VERSION, receipts };
}

export function findCurrentReceipt(
  file: ExecutionReceiptsFile,
  unit: ReceiptUnit,
  scope: string,
  diffDigest: string,
  commandDigest: string | null
): ReceiptRecord | undefined {
  for (let index = file.receipts.length - 1; index >= 0; index -= 1) {
    const receipt = file.receipts[index];
    if (
      receipt.unit === unit
      && receipt.scope === scope
      && receipt.diffDigest === diffDigest
      && receipt.commandDigest === commandDigest
    ) {
      return receipt;
    }
  }
  return undefined;
}

export function hasActiveClaim(
  file: ExecutionReceiptsFile,
  unit: ReceiptUnit,
  scope: string,
  diffDigest: string,
  commandDigest: string | null
): boolean {
  const current = findCurrentReceipt(file, unit, scope, diffDigest, commandDigest);
  return current?.status === "claimed";
}
