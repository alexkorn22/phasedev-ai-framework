import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const tempPrefix = path.join(os.tmpdir(), "ag-dev-flow-");

export function createTempWorkspace(label: string): string {
  return fs.mkdtempSync(`${tempPrefix}${label}-`);
}

export function cleanupTempWorkspace(workspacePath: string | undefined): void {
  if (!workspacePath) {
    return;
  }
  if (!workspacePath.startsWith(tempPrefix)) {
    throw new Error(`Refusing to remove non-test workspace: ${workspacePath}`);
  }
  fs.rmSync(workspacePath, { recursive: true, force: true });
}
