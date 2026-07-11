import * as fs from "fs";
import * as path from "path";

export function moveDirectory(source: string, target: string): void {
  if (fs.existsSync(target)) {
    throw new Error(`Target path already exists: ${target}`);
  }
  try {
    fs.renameSync(source, target);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EXDEV") {
      throw error;
    }
  }

  // Cross-device: rename() is unavailable. Copy first, then remove source last —
  // if the process dies before rmSync, source+target both exist (safe: no data loss,
  // only a resumable duplicate that callers can detect via isDuplicateMoveArtifact's
  // content comparison and clean up).
  // force:false + errorOnExist keeps rename semantics: never silently merge into
  // or overwrite a pre-existing target.
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
  fs.rmSync(source, { recursive: true, force: true });
}

function directoriesEqual(a: string, b: string): boolean {
  const entriesA = fs.readdirSync(a).sort();
  const entriesB = fs.readdirSync(b).sort();
  if (entriesA.length !== entriesB.length || entriesA.some((name, i) => name !== entriesB[i])) {
    return false;
  }
  for (const name of entriesA) {
    const pathA = path.join(a, name);
    const pathB = path.join(b, name);
    const statA = fs.statSync(pathA);
    const statB = fs.statSync(pathB);
    if (statA.isDirectory() !== statB.isDirectory()) return false;
    if (statA.isDirectory()) {
      if (!directoriesEqual(pathA, pathB)) return false;
    } else if (!fs.readFileSync(pathA).equals(fs.readFileSync(pathB))) {
      return false;
    }
  }
  return true;
}

/**
 * True when a crash left the EXDEV copy-then-remove half-done: both source and
 * target exist and their trees are byte-identical, so the source is a safe-to-delete
 * duplicate of the archive copy. Divergent contents return false so callers can
 * surface a conflict instead of destroying unmerged work.
 */
export function isDuplicateMoveArtifact(source: string, target: string): boolean {
  if (!fs.existsSync(source) || !fs.existsSync(target)) return false;
  return directoriesEqual(source, target);
}
