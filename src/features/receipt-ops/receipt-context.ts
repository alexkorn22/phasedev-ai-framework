import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { digestCommand } from "../../entities/execution-receipts/command-digest";
import { formatReceiptScope, parseReceiptScope, ParsedReceiptScope } from "../../entities/execution-receipts/scope";
import {
  emptyExecutionReceiptsFile,
  parseExecutionReceiptsFile
} from "../../entities/execution-receipts/receipt-store";
import { ExecutionReceiptsFile, ReceiptUnit } from "../../entities/execution-receipts/types";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { executionReceiptsPath } from "./receipt-paths";
import { computeDiffDigest, resolveScopeDiffBase } from "./compute-diff-digest";

export function loadExecutionReceiptsFile(receiptsPath: string): ExecutionReceiptsFile {
  if (!fs.existsSync(receiptsPath)) {
    return emptyExecutionReceiptsFile();
  }
  try {
    const parsed = parseExecutionReceiptsFile(JSON.parse(fs.readFileSync(receiptsPath, "utf-8")));
    return parsed ?? emptyExecutionReceiptsFile();
  } catch {
    return emptyExecutionReceiptsFile();
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
): { ok: true; context: ReceiptContext } | { ok: false; message: string } {
  const scope = parseReceiptScope(scopeRaw);
  if (!scope) {
    return { ok: false, message: `Invalid receipt scope "${scopeRaw}". Use final or iteration:<N>.` };
  }

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return { ok: false, message: "No active change." };
  }

  const paths = buildChangePaths(changeDir);
  const receiptsPath = executionReceiptsPath(changeDir);
  const file = loadExecutionReceiptsFile(receiptsPath);
  const diffBase = resolveScopeDiffBase(paths.statePath, scope);
  const diffDigest = computeDiffDigest(projectPath, diffBase);

  return {
    ok: true,
    context: {
      projectPath,
      changeDir,
      paths,
      receiptsPath,
      file,
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
