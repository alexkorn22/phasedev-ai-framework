import * as fs from "fs";
import { ChangePaths } from "../../entities/change/paths";
import { parseBrowserValidation } from "../../entities/execution-contract/parse-browser-validation";
import {
  FinalGateName,
  FinalGateResult,
  FinalGateRow,
  parseFinalGateEvidence
} from "../../entities/final-gate-evidence/parse-final-gate-evidence";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { normalizeTestCommand } from "../../entities/test-commands/resolve-check-commands";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { escapeMarkdownTableCell } from "../../shared/markdown/table";
import { isPlaceholderRequiredFix } from "./manage-findings";

export interface GateEvidenceResult {
  ok: boolean;
  message: string;
}

const ALLOWED_GATES = new Set<FinalGateName>(["full", "browser"]);
const ALLOWED_RESULTS = new Set<FinalGateResult>(["passed", "failed", "blocked"]);
const HEADER = "| Gate | Result | Command | Evidence |";
const SEPARATOR = "|---|---|---|---|";

function formatCommand(command: string): string {
  return `\`${command}\``;
}

function gateSortOrder(gate: FinalGateName): number {
  return gate === "full" ? 0 : 1;
}

function composeDocument(rows: FinalGateRow[]): string {
  const sortedRows = [...rows].sort((left, right) => gateSortOrder(left.gate) - gateSortOrder(right.gate));
  const body = sortedRows.map(
    row =>
      `| ${escapeMarkdownTableCell(row.gate)} | ${escapeMarkdownTableCell(row.result)} | ${formatCommand(row.command)} | ${escapeMarkdownTableCell(row.evidence)} |`
  );
  return ["# Final Gate Evidence", "", HEADER, SEPARATOR, ...body, ""].join("\n");
}

export function recordGate(
  filePath: string,
  gate: FinalGateName,
  result: FinalGateResult,
  command: string,
  evidence: string
): GateEvidenceResult {
  const artifact = parseFinalGateEvidence(filePath);
  const rows = artifact.rows.filter(row => row.gate !== gate);
  rows.push({ gate, result, command, evidence });
  writeFileAtomic(filePath, composeDocument(rows));
  return { ok: true, message: `Recorded ${gate} gate as ${result}.` };
}

export function resetFinalGateEvidence(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function recordFinalGate(
  paths: ChangePaths,
  gate: string,
  result: string,
  evidence: string,
  command?: string
): GateEvidenceResult {
  if (!ALLOWED_GATES.has(gate as FinalGateName)) {
    return { ok: false, message: `Unknown gate "${gate}". Allowed: full, browser.` };
  }
  if (!ALLOWED_RESULTS.has(result as FinalGateResult)) {
    return { ok: false, message: `Unknown result "${result}". Allowed: passed, failed, blocked.` };
  }
  if (isPlaceholderRequiredFix(evidence)) {
    return { ok: false, message: "Evidence must be concrete; placeholder values such as TBD are not allowed." };
  }

  const gateName = gate as FinalGateName;
  const gateResult = result as FinalGateResult;

  if (gateName === "full") {
    const { commands, missing } = parseTestCommands(paths.executionContractPath);
    if (missing.includes("full") || !commands.full) {
      return { ok: false, message: "Execution contract is missing the full test command." };
    }

    const contractCommand = commands.full;
    const resolvedCommand = command ?? contractCommand;
    if (normalizeTestCommand(resolvedCommand) !== normalizeTestCommand(contractCommand)) {
      return {
        ok: false,
        message: "Provided --command does not match the execution contract full gate command."
      };
    }

    return recordGate(paths.finalGateEvidencePath, gateName, gateResult, contractCommand, evidence);
  }

  const browser = parseBrowserValidation(paths.executionContractPath);
  if (!browser.present || !browser.url || browser.url.trim().length === 0) {
    return { ok: false, message: "Browser Validation section is absent; do not record a browser gate." };
  }

  const url = browser.url;
  if (command !== undefined && normalizeTestCommand(command) !== normalizeTestCommand(url)) {
    return { ok: false, message: "Provided --command does not match the Browser Validation url." };
  }

  return recordGate(paths.finalGateEvidencePath, gateName, gateResult, url, evidence);
}
