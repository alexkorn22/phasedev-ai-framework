export const RECEIPT_UNITS = [
  "code-review",
  "security-review",
  "manual-acceptance",
  "implementation-check",
  "check:unit",
  "check:phase",
  "check:full"
] as const;

export type ReceiptUnit = (typeof RECEIPT_UNITS)[number];

export const RECEIPT_RESULTS = ["passed", "failed", "blocked"] as const;
export type ReceiptResult = (typeof RECEIPT_RESULTS)[number];

export const RECEIPT_STATUSES = ["claimed", "passed", "failed", "blocked", "cancelled"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export interface ReceiptRecord {
  unit: ReceiptUnit;
  scope: string;
  diffDigest: string;
  commandDigest: string | null;
  claimId: string;
  status: ReceiptStatus;
  result?: ReceiptResult;
  exitCode?: number;
  summary?: string;
  claimedAt: string;
  completedAt?: string;
  cancelReason?: string;
}

export interface ExecutionReceiptsFile {
  version: 1;
  receipts: ReceiptRecord[];
}

export type ClaimAction = "claimed" | "skip";

export interface ClaimReceiptOutcome {
  ok: boolean;
  action?: ClaimAction;
  claimId?: string;
  message: string;
  record?: ReceiptRecord;
}

export interface CompleteReceiptOutcome {
  ok: boolean;
  message: string;
  record?: ReceiptRecord;
}

export interface CancelReceiptOutcome {
  ok: boolean;
  message: string;
  record?: ReceiptRecord;
}
