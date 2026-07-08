import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "./paths";
import { AmbiguousChangeError, UnknownChangeError } from "./change-errors";
import { findArchiveStateForChange } from "./archive-state";

export function listActiveChangeDirs(projectRoot: string): string[] {
  const changesDir = path.join(projectRoot, SYSTEM_DIR, "changes");
  if (!fs.existsSync(changesDir)) return [];

  return fs.readdirSync(changesDir).filter(item => {
    const fullPath = path.join(changesDir, item);
    return (fs.statSync(fullPath, { throwIfNoEntry: false })?.isDirectory() ?? false) &&
      !item.startsWith(".") && item !== "archive";
  });
}

/**
 * Resolve the directory of an unfinished (non-archived) change.
 *
 * With changeName: that change's directory, or null when the name belongs to
 * a change already in changes/archive/ (pending or completed) — archive-aware
 * callers resolve those via archive-state. Unknown names throw.
 *
 * Without changeName: null when no changes exist, the single change when
 * exactly one exists, AmbiguousChangeError otherwise.
 */
export function resolveChangeDir(projectRoot: string, changeName?: string): string | null {
  // Sort for deterministic ordering: directory read order is not guaranteed
  // stable across filesystems, but resolution and error messages must be.
  const names = listActiveChangeDirs(projectRoot).sort();

  if (changeName !== undefined) {
    if (names.includes(changeName)) {
      return path.join(projectRoot, SYSTEM_DIR, "changes", changeName);
    }
    if (findArchiveStateForChange(projectRoot, changeName)) {
      return null;
    }
    throw new UnknownChangeError(changeName, names);
  }

  if (names.length > 1) {
    throw new AmbiguousChangeError(names);
  }
  return names.length > 0
    ? path.join(projectRoot, SYSTEM_DIR, "changes", names[0])
    : null;
}
