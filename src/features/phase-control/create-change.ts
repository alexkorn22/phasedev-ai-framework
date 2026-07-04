import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { findActiveChangeDir } from "../../entities/change/active-change";

/**
 * Convert a name string to a filesystem-safe slug.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export interface CreateChangeResult {
  ok: boolean;
  message: string;
  changeDir?: string;
}

/**
 * Create a new change directory with initial state.json.
 *
 * Performs the following:
 * 1. Slugifies the name.
 * 2. Checks no active change exists.
 * 3. Checks target directory does not exist.
 * 4. Creates directory + architecture subdirectory.
 * 5. Writes state.json with activePhase: change_intake, activeIteration: null.
 */
export function createChange(projectPath: string, name: string): CreateChangeResult {
  if (!name || name.trim().length === 0) {
    return { ok: false, message: "Change name is required." };
  }

  const slug = slugify(name);
  if (!slug) {
    return { ok: false, message: `Invalid change name: "${name}". Use alphanumeric characters.` };
  }

  try {
    const activeDir = findActiveChangeDir(projectPath);
    if (activeDir) {
      const activeName = path.basename(activeDir);
      return { ok: false, message: `Active change already exists: ${activeName}. Complete or reset it before creating a new one.` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, message: `Error checking active changes: ${msg}` };
  }

  const changeDir = path.join(projectPath, SYSTEM_DIR, "changes", slug);

  if (fs.existsSync(changeDir)) {
    return { ok: false, message: `Change "${slug}" already exists at ${changeDir}.` };
  }

  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  // Write initial state.json directly (saveFlowState cannot be used yet
  // because locateFlowStatePath returns null before state.json exists).
  const statePath = path.join(changeDir, "state.json");
  const initialState = {
    activePhase: "change_intake" as const,
    activeIteration: null
  };
  fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2) + "\n", "utf-8");

  return {
    ok: true,
    message: `Created change ${slug} at ${changeDir}. Initial phase: change_intake.`,
    changeDir
  };
}
