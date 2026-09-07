import * as path from "path";

export const EXECUTION_RECEIPTS_FILE = "execution_receipts.json";

export function executionReceiptsPath(changeDir: string): string {
  return path.join(changeDir, "runtime", EXECUTION_RECEIPTS_FILE);
}
