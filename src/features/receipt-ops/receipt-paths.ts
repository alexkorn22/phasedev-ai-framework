import * as path from "path";
import { buildChangePaths } from "../../entities/change/paths";

export const EXECUTION_RECEIPTS_FILE = "execution_receipts.json";

export function executionReceiptsPath(changeDir: string): string {
  return path.join(changeDir, "runtime", EXECUTION_RECEIPTS_FILE);
}

export function executionReceiptsPathFromPaths(paths: { changeDir: string }): string {
  return executionReceiptsPath(paths.changeDir);
}

export function runtimeDirPath(changeDir: string): string {
  return path.join(changeDir, "runtime");
}

export function resolveExecutionReceiptsPath(projectPath: string, changeDir: string): string {
  return buildChangePaths(changeDir).changeDir === changeDir
    ? executionReceiptsPath(changeDir)
    : executionReceiptsPath(changeDir);
}
