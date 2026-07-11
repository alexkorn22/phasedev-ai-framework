import { ValidationFindingSeverity } from "./parse-validation-findings";

export type BlockingSeverity = "must_fix" | "recommended" | "nit";

export const BLOCKING_SEVERITY_VALUES: readonly BlockingSeverity[] = [
  "must_fix",
  "recommended",
  "nit"
] as const;

export const DEFAULT_BLOCKING_SEVERITY: BlockingSeverity = "must_fix";

const ROW_SEVERITY_RANK: Record<ValidationFindingSeverity, number> = {
  NIT: 0,
  RECOMMENDED: 1,
  "MUST-FIX": 2
};

const THRESHOLD_RANK: Record<BlockingSeverity, number> = {
  nit: 0,
  recommended: 1,
  must_fix: 2
};

export function severityBlocks(rowSeverity: ValidationFindingSeverity, threshold: BlockingSeverity): boolean {
  return ROW_SEVERITY_RANK[rowSeverity] >= THRESHOLD_RANK[threshold];
}

const LABELS: Record<BlockingSeverity, string> = {
  must_fix: "MUST-FIX",
  recommended: "MUST-FIX or RECOMMENDED",
  nit: "MUST-FIX, RECOMMENDED, or NIT"
};

export function blockingSeverityLabel(threshold: BlockingSeverity): string {
  return LABELS[threshold];
}
