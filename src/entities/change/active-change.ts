import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "./paths";

export class MultipleActiveChangesError extends Error {
  constructor(readonly changesDir: string, readonly directories: string[]) {
    super(`Multiple active changes found in ${SYSTEM_DIR}/changes: ${directories.join(", ")}. Only one active change is allowed.`);
    this.name = "MultipleActiveChangesError";
  }
}

export function findActiveChangeDir(projectRoot: string): string | null {
  const changesDir = path.join(projectRoot, SYSTEM_DIR, "changes");
  if (!fs.existsSync(changesDir)) {
    return null;
  }

  const directories = fs.readdirSync(changesDir).filter(item => {
    const fullPath = path.join(changesDir, item);
    return (fs.statSync(fullPath, { throwIfNoEntry: false })?.isDirectory() ?? false) && !item.startsWith(".") && item !== "archive";
  });

  if (directories.length > 1) {
    throw new MultipleActiveChangesError(changesDir, directories);
  }

  return directories.length > 0 ? path.join(changesDir, directories[0]) : null;
}
