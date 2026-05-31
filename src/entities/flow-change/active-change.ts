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

    return directories.length > 0 ? path.join(changesDir, directories[0]) : null;
  } catch {
    return null;
  }
}
