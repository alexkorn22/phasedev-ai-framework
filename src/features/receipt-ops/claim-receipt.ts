import { claimPrerequisiteBlockers } from "../../entities/execution-receipts/prerequisites";
import { applyClaimReceipt } from "../../entities/execution-receipts/transitions";
import { ReceiptUnit } from "../../entities/execution-receipts/types";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";
import { todayIsoDate } from "../../shared/time/today-iso-date";
import {
  commandDigestForUnit,
  loadExecutionReceiptsFile,
  resolveReceiptContext,
  saveExecutionReceiptsFile
} from "./receipt-context";
import { hasOpenBlockingFindings, planRequiresManualAcceptance, validateCheckClaimCommand } from "./validate-check-claim";

export interface ClaimReceiptResult {
  ok: boolean;
  action?: "claimed" | "skip";
  claimId?: string;
  message: string;
}

export function claimReceipt(
  projectPath: string,
  unit: ReceiptUnit,
  scopeRaw: string,
  options?: { command?: string; changeName?: string; blockingSeverity?: BlockingSeverity }
): ClaimReceiptResult {
  const resolved = resolveReceiptContext(projectPath, scopeRaw, options?.changeName);
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const context = resolved.context;
  const commandDigest = commandDigestForUnit(unit, options?.command);
  const blockingSeverity = options?.blockingSeverity ?? DEFAULT_BLOCKING_SEVERITY;

  const checkIssues = validateCheckClaimCommand({
    context,
    unit,
    command: options?.command,
    blockingSeverity
  });
  if (checkIssues.length > 0) {
    return { ok: false, message: checkIssues.join(" ") };
  }

  if (commandDigest === null && (unit === "check:unit" || unit === "check:phase" || unit === "check:full")) {
    return { ok: false, message: `${unit} requires --command with the exact instantiated command.` };
  }

  const prerequisiteIssues = claimPrerequisiteBlockers({
    file: context.file,
    unit,
    scope: context.scope,
    diffDigest: context.diffDigest,
    commandDigest,
    requiresManualAcceptance: planRequiresManualAcceptance(context),
    hasOpenBlockingFindings: hasOpenBlockingFindings(context.paths.findingsPath, blockingSeverity)
  });
  if (prerequisiteIssues.length > 0) {
    return { ok: false, message: prerequisiteIssues.join(" ") };
  }

  const { file, outcome } = applyClaimReceipt({
    file: context.file,
    unit,
    scope: context.scopeKey,
    diffDigest: context.diffDigest,
    commandDigest,
    claimedAt: new Date().toISOString()
  });

  if (!outcome.ok) {
    return { ok: false, message: outcome.message };
  }

  if (outcome.action === "skip") {
    return {
      ok: true,
      action: "skip",
      claimId: outcome.claimId,
      message: outcome.message
    };
  }

  saveExecutionReceiptsFile(context.receiptsPath, file);
  return {
    ok: true,
    action: "claimed",
    claimId: outcome.claimId,
    message: outcome.message
  };
}
