import * as fs from "fs";
import * as path from "path";

export function findActiveChangeDir(projectRoot: string): string | null {
  const changesDir = path.join(projectRoot, "openspec", "changes");
  if (!fs.existsSync(changesDir)) {
    return null;
  }

  try {
    const directories = fs.readdirSync(changesDir).filter(item => {
      const fullPath = path.join(changesDir, item);
      return fs.statSync(fullPath).isDirectory() && !item.startsWith(".") && item !== "archive";
    });

    if (directories.length > 1) {
      throw new Error(`Multiple active changes found in openspec/changes: ${directories.join(", ")}. Only one active change is allowed.`);
    }

    return directories.length > 0 ? path.join(changesDir, directories[0]) : null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Multiple active changes found")) {
      throw error;
    }
    return null;
  }
}
