import * as fs from "fs";
import * as path from "path";
import { findActiveChangeDir } from "../../entities/change/active-change";
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

export function resetChange(projectPath: string, force?: boolean): ResetChangeResult {
  const changeDir = findActiveChangeDir(projectPath);

  if (!changeDir) {
    return { ok: false, message: "No active change found. Nothing to reset." };
  }

  if (!force) {
    const changeName = path.basename(changeDir);
    return {
      ok: false,
      blocked: true,
      message: `WARNING: This will permanently remove the active change "${changeName}" at:\n  ${changeDir}\n\nUse --yes to confirm.`
    };
  }

  // Move to .trash directory instead of permanent delete
  const trashDir = path.join(projectPath, SYSTEM_DIR, "changes", ".trash");
  fs.mkdirSync(trashDir, { recursive: true });

  const changeName = path.basename(changeDir);
  const trashPath = path.join(trashDir, `${Date.now()}-${changeName}`);

  try {
    fs.renameSync(changeDir, trashPath);
    return {
      ok: true,
      message: `Active change "${changeName}" has been moved to .trash.\n  ${trashPath}`
    };
  } catch (e) {
    return {
      ok: false,
      message: `Failed to reset change: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
