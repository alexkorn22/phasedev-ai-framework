import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "../../entities/change/active-change";
import { SYSTEM_DIR } from "../../entities/change/paths";

export interface ResetChangeResult {
  ok: boolean;
  message: string;
  /**
   * True only when an active change exists but was not reset because
   * confirmation (--yes/--force) was withheld: a genuine refusal to act,
   * distinct from "no active change" which has nothing to do.
   */
  blocked?: boolean;
}

export function resetChange(projectPath: string, force?: boolean, changeName?: string): ResetChangeResult {
  const changeDir = resolveChangeDir(projectPath, changeName);

  if (!changeDir) {
    return { ok: false, message: "No active change found. Nothing to reset." };
  }

  const resolvedName = path.basename(changeDir);

  if (!force) {
    return {
      ok: false,
      blocked: true,
      message: `WARNING: This will move the active change "${resolvedName}" to .trash:\n  ${changeDir}\n\nUse --yes to confirm.`
    };
  }

  // Move to .trash directory instead of permanent delete
  const trashDir = path.join(projectPath, SYSTEM_DIR, "changes", ".trash");
  fs.mkdirSync(trashDir, { recursive: true });

  const trashPath = path.join(trashDir, `${Date.now()}-${resolvedName}`);

  try {
    fs.renameSync(changeDir, trashPath);
    return {
      ok: true,
      message: `Active change "${resolvedName}" has been moved to .trash.\n  ${trashPath}`
    };
  } catch (e) {
    return {
      ok: false,
      message: `Failed to reset change: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
