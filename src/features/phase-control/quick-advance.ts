import { Config } from "../../entities/config/config";
import { FlowState, saveFlowState } from "../../entities/change/flow-state";
import { buildChangePaths } from "../../entities/change/paths";
import { resolveChangeDir } from "../../entities/change/active-change";
import { AdvanceResult, commitGateBlocks } from "./advance-shared";
import { nextQuickPhase } from "./quick-flow-sequence";
import { readCommitLog } from "../../entities/change/flow-state";
import { gitHeadSha } from "../../shared/shell/git";
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

function worklogGateBlocks(worklogPath: string): boolean {
  if (!fs.existsSync(worklogPath)) return true;
  return fs.readFileSync(worklogPath, "utf-8").trim().length === 0;
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
  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) return refuse("Cannot locate quick change directory.");
  const paths = buildChangePaths(changeDir);

  if (state.activePhase === "quick_plan" && worklogGateBlocks(paths.worklogPath)) {
    return refuse("Cannot leave quick_plan: worklog.md is missing or empty. Fill worklog.md, then rerun advance.");
  }
  if (state.activePhase === "quick_implementation" && implementationCommitBlocks(projectPath, config, paths.statePath)) {
    return refuse("Cannot leave quick_implementation: commit the implementation (a new commit since the change baseline is required, with no uncommitted work outside .phasedev/**).");
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
