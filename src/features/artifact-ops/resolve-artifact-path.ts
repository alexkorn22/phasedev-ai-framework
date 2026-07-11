import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "../../entities/change/active-change";

export function resolveArtifactPath(projectPath: string, filePath: string, changeName?: string): string {
  if (fs.existsSync(filePath)) return filePath;
  try {
    const activeDir = resolveChangeDir(projectPath, changeName);
    if (activeDir) {
      const candidate = path.join(activeDir, filePath);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* ignore AmbiguousChangeError etc. */ }
  return filePath;
}
