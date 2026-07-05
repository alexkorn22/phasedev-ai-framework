import * as fs from "fs";

export function moveDirectory(source: string, target: string): void {
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
  // if the process dies before rmSync, source+target both exist (safe: no data loss, only
  // a resumable duplicate that startArchiveStage's existsSync(target) check surfaces explicitly).
  // force:false + errorOnExist keeps rename semantics: never silently merge into
  // or overwrite a pre-existing target.
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
  fs.rmSync(source, { recursive: true, force: true });
}

export function isDuplicateMoveArtifact(source: string, target: string): boolean {
  return fs.existsSync(source) && fs.existsSync(target);
}
