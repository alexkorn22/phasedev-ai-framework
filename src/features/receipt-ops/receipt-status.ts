import { findCurrentReceipt } from "../../entities/execution-receipts/receipt-store";
import {
  finalValidationReceiptBlockers,
  iterationValidationReceiptBlockers
} from "../../entities/execution-receipts/prerequisites";
import { digestCommand } from "../../entities/execution-receipts/command-digest";
import { ReceiptUnit } from "../../entities/execution-receipts/types";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";
import { resolveReceiptContext } from "./receipt-context";
import { planRequiresManualAcceptance } from "./validate-check-claim";

export interface ReceiptStatusEntry {
  unit: ReceiptUnit;
  scope: string;
  status: string;
  claimId?: string;
  diffDigest: string;
  commandDigest: string | null;
}

export interface ReceiptStatusResult {
  ok: boolean;
  message: string;
  scope: string;
  diffDigest: string;
  entries: ReceiptStatusEntry[];
}

const ITERATION_UNITS: ReceiptUnit[] = ["code-review", "security-review", "implementation-check"];
const FINAL_UNITS: ReceiptUnit[] = [
  "code-review",
  "security-review",
  "manual-acceptance",
  "implementation-check",
  "check:full"
];

export function receiptStatus(
  projectPath: string,
  scopeRaw: string,
  options?: { changeName?: string; blockingSeverity?: BlockingSeverity }
): ReceiptStatusResult {
  const resolved = resolveReceiptContext(projectPath, scopeRaw, options?.changeName);
  if (!resolved.ok) {
    return {
      ok: false,
      message: resolved.message,
      scope: scopeRaw,
      diffDigest: "",
      entries: []
    };
  }

  const context = resolved.context;
  const requiresManual = planRequiresManualAcceptance(context);
  const units = context.scope.kind === "final"
    ? (requiresManual
      ? FINAL_UNITS
      : FINAL_UNITS.filter(unit => unit !== "manual-acceptance"))
    : ITERATION_UNITS;
  const testCommands = parseTestCommands(context.paths.executionContractPath).commands;
  const fullCommandDigest = testCommands.full ? digestCommand(testCommands.full) : null;

  const entries: ReceiptStatusEntry[] = units.flatMap(unit => {
    const commandDigest = unit === "check:full" ? fullCommandDigest : null;
    const current = findCurrentReceipt(
      context.file,
      unit,
      context.scopeKey,
      context.diffDigest,
      commandDigest
    );
    if (!current) {
      return [{
        unit,
        scope: context.scopeKey,
        status: "missing",
        diffDigest: context.diffDigest,
        commandDigest
      }];
    }
    return [{
      unit,
      scope: context.scopeKey,
      status: current.status,
      claimId: current.claimId,
      diffDigest: context.diffDigest,
      commandDigest
    }];
  });

  return {
    ok: true,
    message: `Receipt status for ${context.scopeKey} at digest ${context.diffDigest}.`,
    scope: context.scopeKey,
    diffDigest: context.diffDigest,
    entries
  };
}

export function validationReceiptBlockers(
  projectPath: string,
  scopeRaw: string,
  options?: { changeName?: string; blockingSeverity?: BlockingSeverity }
): string[] {
  const resolved = resolveReceiptContext(projectPath, scopeRaw, options?.changeName);
  if (!resolved.ok) {
    return [resolved.message];
  }

  const context = resolved.context;
  if (context.scope.kind === "iteration") {
    return iterationValidationReceiptBlockers({
      file: context.file,
      scope: context.scope,
      diffDigest: context.diffDigest
    });
  }

  const testCommands = parseTestCommands(context.paths.executionContractPath).commands;
  const fullCommandDigest = testCommands.full ? digestCommand(testCommands.full) : "";
  return finalValidationReceiptBlockers({
    file: context.file,
    diffDigest: context.diffDigest,
    fullCommandDigest,
    requiresManualAcceptance: planRequiresManualAcceptance(context)
  });
}
