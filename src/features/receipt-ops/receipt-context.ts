import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { digestCommand } from "../../entities/execution-receipts/command-digest";
import { formatReceiptScope, parseReceiptScope, ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import {
  emptyExecutionReceiptsFile,
  parseExecutionReceiptsFile,
  ParseExecutionReceiptsIssue
} from "../../entities/execution-receipts/receipt-store";
import { ExecutionReceiptsFile, ReceiptUnit } from "../../entities/execution-receipts/types";
import { parseTestCommands } from "../../entities/test-commands/parse-test-commands";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { executionReceiptsPath } from "./receipt-paths";
import { computeDiffDigest, DiffDigestError, resolveScopeDiffBase } from "./compute-diff-digest";

export type LoadExecutionReceiptsResult =
  | { ok: true; file: ExecutionReceiptsFile }
  | { ok: false; message: string; issues: ParseExecutionReceiptsIssue[] };

function formatReceiptIssues(issues: ParseExecutionReceiptsIssue[]): string {
  return issues.map(issue => `${issue.path}: ${issue.message}`).join("; ");
}

export function loadExecutionReceiptsFile(receiptsPath: string): LoadExecutionReceiptsResult {
  if (!fs.existsSync(receiptsPath)) {
    return { ok: true, file: emptyExecutionReceiptsFile() };
  }

  const rawBytes = fs.readFileSync(receiptsPath);
  try {
    const parsed = parseExecutionReceiptsFile(JSON.parse(rawBytes.toString("utf-8")));
    if (!parsed.ok) {
      return {
        ok: false,
        message: `execution_receipts.json is invalid and was not modified: ${formatReceiptIssues(parsed.issues)}`,
        issues: parsed.issues
      };
    }
    return { ok: true, file: parsed.file };
  } catch {
    return {
      ok: false,
      message: "execution_receipts.json contains malformed JSON and was not modified.",
      issues: [{ path: "root", message: "Malformed JSON." }]
    };
  }
}

export function saveExecutionReceiptsFile(receiptsPath: string, file: ExecutionReceiptsFile): void {
  fs.mkdirSync(path.dirname(receiptsPath), { recursive: true });
  writeFileAtomic(receiptsPath, JSON.stringify(file, null, 2) + "\n");
}

export interface ReceiptContext {
  projectPath: string;
  changeDir: string;
  paths: ReturnType<typeof buildChangePaths>;
  receiptsPath: string;
  file: ExecutionReceiptsFile;
  scope: ParsedReceiptScope;
  scopeKey: string;
  diffDigest: string;
}

export function resolveReceiptContext(
  projectPath: string,
  scopeRaw: string,
  changeName?: string
): { ok: true; context: ReceiptContext } | { ok: false; message: string; issues?: ParseExecutionReceiptsIssue[] } {
  const scope = parseReceiptScope(scopeRaw);
  if (!scope) {
    return { ok: false, message: `Invalid receipt scope "${scopeRaw}". Use final or iteration:<N>.` };
  }

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return { ok: false, message: "No active change." };
  }

  const paths = buildChangePaths(changeDir);
  const receiptsPathValue = executionReceiptsPath(changeDir);
  const loaded = loadExecutionReceiptsFile(receiptsPathValue);
  if (!loaded.ok) {
    return { ok: false, message: loaded.message, issues: loaded.issues };
  }

  const diffBase = resolveScopeDiffBase(paths.statePath, scope);
  let diffDigest: string;
  try {
    diffDigest = computeDiffDigest(projectPath, diffBase);
  } catch (error) {
    if (error instanceof DiffDigestError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  return {
    ok: true,
    context: {
      projectPath,
      changeDir,
      paths,
      receiptsPath: receiptsPathValue,
      file: loaded.file,
      scope,
      scopeKey: formatReceiptScope(scope),
      diffDigest
    }
  };
}

export function commandDigestForUnit(unit: ReceiptUnit, command?: string): string | null {
  if (unit === "check:unit" || unit === "check:phase" || unit === "check:full") {
    if (!command || command.trim().length === 0) {
      return null;
    }
    return digestCommand(command);
  }
  return null;
}

export function resolveFullCommandDigest(executionContractPath: string): string | null {
  const fullCommand = parseTestCommands(executionContractPath).commands.full;
  return fullCommand ? digestCommand(fullCommand) : null;
}
