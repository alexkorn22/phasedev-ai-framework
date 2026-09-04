import { Config } from "../../entities/config/config";
import { FlowState, locateChangeDir, saveFlowState } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { AdvanceResult, commitGateBlocks } from "./advance-shared";
import { nextQuickPhase } from "./quick-flow-sequence";
import { readCommitLog } from "../../entities/change/flow-state";
import { gitHeadSha, runGit } from "../../shared/shell/git";
import { isWorklogEmpty, validateWorklogArtifact } from "../../entities/worklog/validate-worklog";
import { pathMatchesSurface, scanChangedFilesOutsidePhasedev } from "./changed-file-inventory";
import * as fs from "fs";

function refuse(message: string): AdvanceResult {
  return { ok: false, advanced: false, finished: false, newState: null, message };
}
function done(message: string): AdvanceResult {
  return { ok: true, advanced: false, finished: true, newState: null, message };
}
function advanced(newState: FlowState, message: string): AdvanceResult {
  return { ok: true, advanced: true, finished: false, newState, message };
}

/**
 * Fails open (returns false) when the project is not a git repo or has no
 * recorded baseline: a check that cannot be answered must not block a
 * non-git quick change.
 */
function implementationCommitBlocks(projectPath: string, config: Config, statePath: string): boolean {
  if (!config.requireIterationCommit) return false;
  if (commitGateBlocks(projectPath, config)) return true;
  const start = readCommitLog(statePath)?.start;
  const head = gitHeadSha(projectPath);
  if (!start || !head) return false;
  return head === start;
}

export function quickAdvance(projectPath: string, config: Config, state: FlowState, changeName?: string): AdvanceResult {
  const changeDir = locateChangeDir(projectPath, state, changeName);
  if (!changeDir) return refuse("Cannot locate quick change directory.");
  const paths = buildChangePaths(changeDir);

  if (state.activePhase === "quick_plan") {
    if (!fs.existsSync(paths.worklogPath) || isWorklogEmpty(fs.readFileSync(paths.worklogPath, "utf-8"))) {
      return refuse("Cannot leave quick_plan: worklog.md is missing or empty. Fill worklog.md, then rerun advance.");
    }
  }

  if (state.activePhase === "quick_implementation") {
    if (implementationCommitBlocks(projectPath, config, paths.statePath)) {
      return refuse("Cannot leave quick_implementation: commit the implementation (a new commit since the change baseline is required, with no uncommitted work outside .phasedev/**).");
    }

    if (config.protectedPaths && config.protectedPaths.length > 0) {
      const worklogText = fs.existsSync(paths.worklogPath) ? fs.readFileSync(paths.worklogPath, "utf-8") : "";
      const allowsProtected = /\[allows-protected-paths\]/i.test(worklogText);
      if (!allowsProtected) {
        const changedFiles = new Set<string>();
        const scan = scanChangedFilesOutsidePhasedev(projectPath);
        if (scan.ok) {
          for (const e of scan.entries) changedFiles.add(e.filePath);
        }
        const start = readCommitLog(paths.statePath)?.start;
        if (start) {
          const diff = runGit(projectPath, ["diff", "--name-only", `${start}..HEAD`]);
          if (diff.ok && diff.stdout.trim().length > 0) {
            for (const line of diff.stdout.split("\n")) {
              const trimmed = line.trim();
              if (trimmed && !trimmed.startsWith(".phasedev/") && !trimmed.startsWith(".phasedev\\")) {
                changedFiles.add(trimmed);
              }
            }
          }
        }
        const violatingFiles = Array.from(changedFiles).filter(f => pathMatchesSurface(f, config.protectedPaths ?? []));
        if (violatingFiles.length > 0) {
          return refuse(`Protected paths violated: ${violatingFiles.join(", ")} matched protectedPaths config. Add '[allows-protected-paths]' to worklog.md if intentional.`);
        }
      }
    }
  }

  if (state.activePhase === "quick_spec_revision") {
    return done("Quick flow complete. Final quick phase reached.");
  }

  const next = nextQuickPhase(state.activePhase);
  if (!next) return refuse(`No next quick phase after ${state.activePhase}.`);
  const nextState: FlowState = { activePhase: next, activeIteration: null, repairCycleCount: 0, flowMode: "quick" };
  saveFlowState(projectPath, nextState, changeName);
  return advanced(nextState, `Advanced to ${next}.`);
}
