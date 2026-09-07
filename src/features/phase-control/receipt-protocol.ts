import { renderMarkdownInlineCode } from "../../shared/markdown/inline-code";
import { ReceiptUnit } from "../../entities/execution-receipts/types";
import { ValidationPhaseRole } from "../../entities/phase/validation-phase-role";
import { ResolvedFocusedCheck } from "../../entities/test-commands/resolve-check-commands";
import { shellQuote } from "../../shared/shell/shell-quote";

const CLAIM_ID_PLACEHOLDER = "<claim-id>";

function claimCommand(unit: ReceiptUnit, scope: string, command?: string): string {
  const scopeFlag = `--scope ${scope}`;
  if (command) {
    return `phasedev claim-receipt ${unit} ${scopeFlag} --command ${shellQuote(command)}`;
  }
  return `phasedev claim-receipt ${unit} ${scopeFlag}`;
}

function completeCommand(
  unit: ReceiptUnit,
  scope: string,
  options?: { command?: string; requiresExitCode?: boolean; result?: "passed" | "failed" | "blocked" }
): string {
  const result = options?.result ?? "passed";
  const parts = [
    `phasedev complete-receipt ${unit}`,
    `--scope ${scope}`,
    `--claim-id ${CLAIM_ID_PLACEHOLDER}`,
    `--result ${result}`
  ];
  if (options?.command) {
    parts.push(`--command ${shellQuote(options.command)}`);
  }
  if (options?.requiresExitCode && result === "passed") {
    parts.push("--exit-code 0");
  }
  return parts.join(" ");
}

function cancelCommand(unit: ReceiptUnit, scope: string): string {
  return `phasedev cancel-receipt ${unit} --scope ${scope} --claim-id ${CLAIM_ID_PLACEHOLDER} --reason <text>`;
}

function protocolHeader(): string {
  return [
    "## Execution receipt protocol",
    "",
    "The orchestrator already claimed this work and passed the active claim-id in your dispatch prompt. Never hand-edit `runtime/execution_receipts.json`.",
    `- Active claim id: ${CLAIM_ID_PLACEHOLDER}`,
    "- A current passed receipt for the same digest/command returns `skip` — reuse evidence and do not rerun the exact command.",
    `- Recover a stale claim only with ${cancelCommand("code-review", "<scope>")}.`,
    ""
  ].join("\n");
}

export function renderValidationRoleReceiptProtocol(
  role: ValidationPhaseRole,
  scope: string,
  options?: { fullGateCommand?: string }
): string {
  const lines = [protocolHeader()];

  if (role === "code-review" || role === "security-review") {
    lines.push(
      "Role receipt steps:",
      `1. Complete this role after findings work: ${completeCommand(role, scope)}.`,
      "2. Do not record verdicts, run project check commands, or complete other role receipts."
    );
    return lines.join("\n");
  }

  if (scope === "final" && options?.fullGateCommand) {
    lines.push(
      "Role receipt steps:",
      `1. While your implementation-check claim is active, claim check:full with the exact authorized full gate command from Required phase-contract checks: phasedev claim-receipt check:full --scope ${scope} --command <that exact command>.`,
      "2. Run that authorized full gate command exactly once from the project root.",
      `3. Complete check:full as passed with exit code 0 using the same exact command: phasedev complete-receipt check:full --scope ${scope} --claim-id ${CLAIM_ID_PLACEHOLDER} --result passed --command <that exact command> --exit-code 0.`,
      `4. Complete implementation-check: ${completeCommand("implementation-check", scope)}.`,
      "5. Do not complete implementation-check before check:full is passed at the current digest."
    );
    return lines.join("\n");
  }

  lines.push(
    "Role receipt steps:",
    `1. Complete implementation-check after verdict work: ${completeCommand("implementation-check", scope)}.`,
    "2. Do not run unit, phase, or full project check commands in iteration validation."
  );
  return lines.join("\n");
}

export function renderFocusedCheckReceiptProtocol(
  unit: Extract<ReceiptUnit, "check:unit" | "check:phase">,
  scope: string,
  command: string
): string {
  const renderedCommand = renderMarkdownInlineCode(command);
  return [
    protocolHeader(),
    `Focused check (${unit}) for ${renderedCommand}:`,
    `1. Claim before running: ${claimCommand(unit, scope, command)}.`,
    `2. Run ${renderedCommand} from the project root.`,
    `3. Complete passed with exit code 0: ${completeCommand(unit, scope, { command, requiresExitCode: true })}.`,
    `4. Complete failed/blocked when honest evidence requires it: ${completeCommand(unit, scope, { command, result: "failed" })} or ${completeCommand(unit, scope, { command, result: "blocked" })}.`,
    `5. Cancel stale claims with: ${cancelCommand(unit, scope)}.`
  ].join("\n");
}

export function renderImplementationReceiptProtocol(
  scope: string,
  commands: Array<{ unit: Extract<ReceiptUnit, "check:unit" | "check:phase">; command: string }>
): string {
  if (commands.length === 0) {
    return "";
  }

  const lines = [
    protocolHeader(),
    `Receipt scope: ${scope}`,
    "For each required check recipe below, substitute actual targets, claim with the exact instantiated command, run it, then complete the receipt."
  ];

  for (const entry of commands) {
    const rendered = renderMarkdownInlineCode(entry.command);
    lines.push(
      `- ${entry.unit} ${rendered}: claim ${claimCommand(entry.unit, scope, entry.command)}; complete passed ${completeCommand(entry.unit, scope, { command: entry.command, requiresExitCode: true })}.`
    );
  }

  return lines.join("\n");
}

export function renderRepairReceiptProtocol(scope: string, checks: ResolvedFocusedCheck[]): string {
  if (checks.length === 0) {
    return "";
  }

  const lines = [
    protocolHeader(),
    `Receipt scope: ${scope}`,
    "Claim and complete focused check receipts around repair reruns only. Never run `full`.",
    "Use the exact instantiated command recorded in Check Evidence when reusing a still-valid passed row."
  ];

  for (const check of checks) {
    const unit = `check:${check.gate}` as Extract<ReceiptUnit, "check:unit" | "check:phase">;
    const rendered = renderMarkdownInlineCode(check.command);
    lines.push(
      `- ${check.gate} ${rendered}: claim ${claimCommand(unit, scope, check.command)}; complete passed ${completeCommand(unit, scope, { command: check.command, requiresExitCode: true })}.`
    );
  }

  return lines.join("\n");
}

export function renderManualAcceptanceReceiptProtocol(scope: string): string {
  return [
    protocolHeader(),
    `1. Complete browser/manual work, then finish the receipt: ${completeCommand("manual-acceptance", scope)}.`,
    `2. Cancel stale claims with: ${cancelCommand("manual-acceptance", scope)}.`,
    "3. Do not run unit, phase, or full project check commands in this auxiliary role."
  ].join("\n");
}
