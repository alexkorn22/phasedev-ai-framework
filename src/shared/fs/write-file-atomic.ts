import * as fs from "fs";

/**
 * Write a file atomically: write to a sibling ".tmp" file first, then rename
 * over the target. renameSync is atomic on the same filesystem, so a crash
 * mid-write leaves the previous file intact instead of a truncated one.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tempPath, content, "utf-8");
    fs.renameSync(tempPath, filePath);
  } finally {
    // Clean up temp file if rename failed (e.g. process killed mid-rename)
    try { fs.rmSync(tempPath, { force: true }); } catch { /* ignore */ }
  }
}
