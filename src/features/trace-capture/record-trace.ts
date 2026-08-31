import * as fs from "fs";
import * as path from "path";
import { traceDirPath, tracePhasesDirPath, traceDiffsDirPath } from "../../entities/change/paths";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { runGit } from "../../shared/shell/git";

/**
 * Ensures the trace directory structure exists for the change:
 * .phasedev/changes/<name>/trace/
 *   ├── phases/
 *   └── diffs/
 */
export function ensureTraceDirs(changeDir: string): { traceDir: string; phasesDir: string; diffsDir: string } {
  const traceDir = traceDirPath(changeDir);
  const phasesDir = tracePhasesDirPath(changeDir);
  const diffsDir = traceDiffsDirPath(changeDir);

  fs.mkdirSync(phasesDir, { recursive: true });
  fs.mkdirSync(diffsDir, { recursive: true });

  return { traceDir, phasesDir, diffsDir };
}

/**
 * Saves a phase contract snapshot into trace/phases/<phase>/phase_contract.md.
 */
export function recordPhaseContract(changeDir: string, phase: string, contractContent: string): void {
  try {
    const { phasesDir } = ensureTraceDirs(changeDir);
    const phaseDir = path.join(phasesDir, phase);
    fs.mkdirSync(phaseDir, { recursive: true });
    writeFileAtomic(path.join(phaseDir, "phase_contract.md"), contractContent);
  } catch (err: unknown) {
    // Trace recording is best-effort and must never block the main flow.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[trace] Failed to record phase contract for ${phase}: ${msg}`);
  }
}

/**
 * Records a git diff between two commits or against working tree into trace/diffs/<name>.patch.
 */
export function recordGitDiff(projectPath: string, changeDir: string, diffName: string, baseSha: string, targetSha?: string): void {
  try {
    const { diffsDir } = ensureTraceDirs(changeDir);
    const gitArgs = targetSha
      ? ["diff", `${baseSha}..${targetSha}`]
      : ["diff", baseSha];
    const result = runGit(projectPath, gitArgs);
    if (result.ok) {
      writeFileAtomic(path.join(diffsDir, `${diffName}.patch`), result.stdout);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[trace] Failed to record git diff ${diffName}: ${msg}`);
  }
}
