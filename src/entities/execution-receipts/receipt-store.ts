import { parseReceiptScope } from "./scope";
import {
  RECEIPT_RESULTS,
  RECEIPT_STATUSES,
  RECEIPT_UNITS,
  ExecutionReceiptsFile,
  ReceiptRecord,
  ReceiptResult,
  ReceiptStatus,
  ReceiptUnit
} from "./types";

export const EXECUTION_RECEIPTS_VERSION = 1;

export interface ParseExecutionReceiptsIssue {
  path: string;
  message: string;
}

export type ParseExecutionReceiptsResult =
  | { ok: true; file: ExecutionReceiptsFile }
  | { ok: false; issues: ParseExecutionReceiptsIssue[] };

export function emptyExecutionReceiptsFile(): ExecutionReceiptsFile {
  return { version: EXECUTION_RECEIPTS_VERSION, receipts: [] };
}

function isReceiptUnit(value: unknown): value is ReceiptUnit {
  return typeof value === "string" && (RECEIPT_UNITS as readonly string[]).includes(value);
}

function isReceiptStatus(value: unknown): value is ReceiptStatus {
  return typeof value === "string" && (RECEIPT_STATUSES as readonly string[]).includes(value);
}

function isReceiptResult(value: unknown): value is ReceiptResult {
  return typeof value === "string" && (RECEIPT_RESULTS as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableCommandDigest(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function validateReceiptScope(scope: string, path: string, issues: ParseExecutionReceiptsIssue[]): boolean {
  if (!isNonEmptyString(scope) || parseReceiptScope(scope) === null) {
    issues.push({ path, message: `Invalid receipt scope "${scope}". Expected final or iteration:<N>.` });
    return false;
  }
  return true;
}

function validateCommandDigestForUnit(
  unit: ReceiptUnit,
  commandDigest: unknown,
  path: string,
  issues: ParseExecutionReceiptsIssue[]
): void {
  const checkUnit = unit === "check:unit" || unit === "check:phase" || unit === "check:full";
  if (checkUnit && commandDigest === null) {
    issues.push({ path: `${path}.commandDigest`, message: `${unit} receipt requires non-null commandDigest.` });
  }
  if (!checkUnit && commandDigest !== null) {
    issues.push({ path: `${path}.commandDigest`, message: `${unit} receipt requires null commandDigest.` });
  }
}

function validateClaimedRecord(record: Record<string, unknown>, path: string, issues: ParseExecutionReceiptsIssue[]): void {
  if (!isNonEmptyString(record.claimId)) {
    issues.push({ path: `${path}.claimId`, message: "Claimed receipt requires non-empty claimId." });
  }
  if (!isNonEmptyString(record.claimedAt)) {
    issues.push({ path: `${path}.claimedAt`, message: "Claimed receipt requires claimedAt." });
  }
  if (record.result !== undefined) {
    issues.push({ path: `${path}.result`, message: "Claimed receipt must not include result." });
  }
  if (record.completedAt !== undefined) {
    issues.push({ path: `${path}.completedAt`, message: "Claimed receipt must not include completedAt." });
  }
  if (record.cancelReason !== undefined) {
    issues.push({ path: `${path}.cancelReason`, message: "Claimed receipt must not include cancelReason." });
  }
}

function validateTerminalRecord(
  status: ReceiptResult,
  record: Record<string, unknown>,
  path: string,
  issues: ParseExecutionReceiptsIssue[]
): void {
  if (record.result !== status) {
    issues.push({ path: `${path}.result`, message: `Terminal receipt status ${status} requires matching result.` });
  }
  if (!isNonEmptyString(record.completedAt)) {
    issues.push({ path: `${path}.completedAt`, message: `Terminal receipt status ${status} requires completedAt.` });
  }
  if (!isNonEmptyString(record.claimId)) {
    issues.push({ path: `${path}.claimId`, message: `Terminal receipt status ${status} requires claimId.` });
  }
  if (!isNonEmptyString(record.claimedAt)) {
    issues.push({ path: `${path}.claimedAt`, message: `Terminal receipt status ${status} requires claimedAt.` });
  }
  if (record.cancelReason !== undefined) {
    issues.push({ path: `${path}.cancelReason`, message: `Terminal receipt status ${status} must not include cancelReason.` });
  }
}

function validateCancelledRecord(record: Record<string, unknown>, path: string, issues: ParseExecutionReceiptsIssue[]): void {
  if (!isNonEmptyString(record.claimId)) {
    issues.push({ path: `${path}.claimId`, message: "Cancelled receipt requires claimId." });
  }
  if (!isNonEmptyString(record.claimedAt)) {
    issues.push({ path: `${path}.claimedAt`, message: "Cancelled receipt requires claimedAt." });
  }
  if (!isNonEmptyString(record.completedAt)) {
    issues.push({ path: `${path}.completedAt`, message: "Cancelled receipt requires completedAt." });
  }
  if (!isNonEmptyString(record.cancelReason)) {
    issues.push({ path: `${path}.cancelReason`, message: "Cancelled receipt requires cancelReason." });
  }
  if (record.result !== undefined) {
    issues.push({ path: `${path}.result`, message: "Cancelled receipt must not include result." });
  }
}

function parseReceiptRecord(value: unknown, index: number): { record?: ReceiptRecord; issues: ParseExecutionReceiptsIssue[] } {
  const path = `receipts[${index}]`;
  const issues: ParseExecutionReceiptsIssue[] = [];

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { issues: [{ path, message: "Receipt entry must be an object." }] };
  }

  const record = value as Record<string, unknown>;
  if (!isReceiptUnit(record.unit)) {
    issues.push({ path: `${path}.unit`, message: `Invalid receipt unit "${String(record.unit)}".` });
  }
  if (!isNonEmptyString(record.scope)) {
    issues.push({ path: `${path}.scope`, message: "Receipt scope must be a non-empty string." });
  } else {
    validateReceiptScope(record.scope, `${path}.scope`, issues);
  }
  if (!isNonEmptyString(record.diffDigest)) {
    issues.push({ path: `${path}.diffDigest`, message: "Receipt diffDigest must be a non-empty string." });
  }
  if (!isNullableCommandDigest(record.commandDigest)) {
    issues.push({ path: `${path}.commandDigest`, message: "Receipt commandDigest must be null or a non-empty string." });
  }
  if (!isReceiptStatus(record.status)) {
    issues.push({ path: `${path}.status`, message: `Invalid receipt status "${String(record.status)}".` });
  }

  if (isReceiptUnit(record.unit)) {
    validateCommandDigestForUnit(record.unit, record.commandDigest, path, issues);
  }

  const status = record.status;
  if (status === "claimed") {
    validateClaimedRecord(record, path, issues);
  } else if (status === "passed" || status === "failed" || status === "blocked") {
    validateTerminalRecord(status, record, path, issues);
  } else if (status === "cancelled") {
    validateCancelledRecord(record, path, issues);
  }

  if (issues.length > 0) {
    return { issues };
  }

  const parsed: ReceiptRecord = {
    unit: record.unit as ReceiptUnit,
    scope: record.scope as string,
    diffDigest: record.diffDigest as string,
    commandDigest: record.commandDigest as string | null,
    claimId: record.claimId as string,
    status: record.status as ReceiptStatus,
    claimedAt: record.claimedAt as string
  };

  if (record.result !== undefined) {
    parsed.result = record.result as ReceiptResult;
  }
  if (typeof record.exitCode === "number") {
    parsed.exitCode = record.exitCode;
  }
  if (typeof record.summary === "string") {
    parsed.summary = record.summary;
  }
  if (typeof record.completedAt === "string") {
    parsed.completedAt = record.completedAt;
  }
  if (typeof record.cancelReason === "string") {
    parsed.cancelReason = record.cancelReason;
  }

  return { record: parsed, issues: [] };
}

export function parseExecutionReceiptsFile(raw: unknown): ParseExecutionReceiptsResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: [{ path: "root", message: "execution_receipts.json must be a JSON object." }] };
  }

  const record = raw as Record<string, unknown>;
  if (record.version !== EXECUTION_RECEIPTS_VERSION) {
    return {
      ok: false,
      issues: [{ path: "version", message: `Unsupported execution_receipts.json version ${String(record.version)}.` }]
    };
  }
  if (!Array.isArray(record.receipts)) {
    return { ok: false, issues: [{ path: "receipts", message: "execution_receipts.json receipts must be an array." }] };
  }

  const receipts: ReceiptRecord[] = [];
  const issues: ParseExecutionReceiptsIssue[] = [];
  record.receipts.forEach((entry, index) => {
    const parsed = parseReceiptRecord(entry, index);
    issues.push(...parsed.issues);
    if (parsed.record) {
      receipts.push(parsed.record);
    }
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, file: { version: EXECUTION_RECEIPTS_VERSION, receipts } };
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
