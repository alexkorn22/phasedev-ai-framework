import * as fs from "fs";
import * as path from "path";
import { Config } from "../../entities/config/config";
import { loadFlowState } from "../../entities/change/flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import {
  findCompletedArchiveState,
  findInvalidArchiveState,
  findPendingArchiveState,
  readArchiveState
} from "../../entities/change/archive-state";
import { resolveRoute } from "./flow-route";
import { startArchiveStage } from "./archive-stage";
import { checkArchiveCompletion } from "./check-archive";
import { commitGateBlocks } from "./advance-shared";
import { archiveReadinessBlocker, finalCommitBlocker } from "./prompt-blockers";

export interface ArchiveCommandResult {
  ok: boolean;
  done: boolean;
  started: boolean;
  message: string;
  reason?: string;
}

function refuse(message: string, reason?: string): ArchiveCommandResult {
  return { ok: false, done: false, started: false, message, reason };
}

function done(message: string): ArchiveCommandResult {
  return { ok: true, done: true, started: false, message };
}

function started(message: string): ArchiveCommandResult {
  return { ok: true, done: false, started: true, message };
}

function archiveCompleteMessage(changeName: string): string {
  return `Archive complete for ${changeName}. Flow finished.`;
}

/**
 * Handles a change already inside the archive lifecycle
 * (state.activePhase === "archive"), for both Standard and Quick modes:
 * invalid state, pre-move crash recovery, pending (moved) archive, or
 * already-completed archive.
 */
function continueArchiveLifecycle(
  projectPath: string,
  config: Config,
  changeName: string
): ArchiveCommandResult {
  const invalid = findInvalidArchiveState(projectPath, changeName);
  if (invalid) {
    return refuse(`Archive state is invalid: ${invalid.reason} (${invalid.statePath}).`);
  }

  const activeDir = resolveChangeDir(projectPath, changeName);
  if (activeDir) {
    const preMoveState = readArchiveState(activeDir);
    if (preMoveState && preMoveState.status === "in_progress" && !preMoveState.movedAt) {
      const archiveResult = startArchiveStage(projectPath, activeDir, new Date(), config);
      if (archiveResult.blocked) {
        return refuse(
          `Cannot recover archive transition: ${archiveResult.reason ?? "archive mutation blocked"}.\n${archiveResult.prompt}`,
          archiveResult.reason
        );
      }
      return started("Advanced to archive phase (recovered from pre-move crash).");
    }
  }

  const pending = findPendingArchiveState(projectPath, changeName);
  if (pending) {
    if (checkArchiveCompletion(pending.archivePath).ok) {
      return done(archiveCompleteMessage(changeName));
    }
    return started(
      `Archive in progress. Run: phasedev phase --change ${changeName} for the archive contract, execute it, then rerun phasedev archive ${changeName}.`
    );
  }

  const completed = findCompletedArchiveState(projectPath, changeName);
  if (completed) {
    return done(archiveCompleteMessage(changeName));
  }

  return refuse(`Cannot locate archive state for ${changeName}.`);
}

function runQuickArchive(
  projectPath: string,
  config: Config,
  changeName: string,
  activePhase: string
): ArchiveCommandResult {
  if (activePhase !== "quick_spec_revision") {
    return refuse(
      `Change ${changeName} has not reached the final quick phase (quick_spec_revision); nothing to archive yet.`
    );
  }

  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!changeDir) {
    return refuse("Cannot locate quick change directory.");
  }

  const archiveResult = startArchiveStage(projectPath, changeDir, new Date(), config);
  if (archiveResult.blocked) {
    return refuse(
      `Cannot advance to archive: ${archiveResult.reason ?? "archive mutation blocked"}.`,
      archiveResult.reason
    );
  }
  return started("Advanced to archive phase. Run: phasedev phase for the archive contract.");
}

function runStandardArchive(
  projectPath: string,
  config: Config,
  changeName: string
): ArchiveCommandResult {
  const route = resolveRoute(projectPath, changeName, config.blockingSeverity);

  if (route.kind === "archive_ready") {
    if (commitGateBlocks(projectPath, config)) {
      const blocker = finalCommitBlocker(path.basename(route.activeChangePath), changeName);
      return refuse(blocker.prompt, blocker.reason);
    }

    fs.rmSync(route.paths.findingsBaselinePath, { force: true });

    const archiveResult = startArchiveStage(projectPath, route.activeChangePath, new Date(), config);
    if (archiveResult.blocked) {
      return refuse(
        `Cannot advance to archive: ${archiveResult.reason ?? "archive mutation blocked"}.\n${archiveResult.prompt}`,
        archiveResult.reason
      );
    }
    return started("Advanced to archive phase. Run: phasedev phase for the archive contract.");
  }

  if (route.kind === "archive_readiness_blocked") {
    const blocker = archiveReadinessBlocker(
      "Not all iterations are completed",
      route.paths.iterationPlanPath,
      "Complete validation for each iteration and mark it [x] in iteration_plan.md.",
      changeName
    );
    return refuse(blocker.prompt, blocker.reason);
  }

  if (route.kind === "invalid_archive_state") {
    const invalid = route.invalidArchiveState;
    return refuse(`Archive state is invalid: ${invalid.reason} (${invalid.statePath}).`);
  }

  if (route.kind === "pending_archive") {
    if (checkArchiveCompletion(route.archiveState.archivePath).ok) {
      return done(archiveCompleteMessage(changeName));
    }
    return started(
      `Archive in progress. Run: phasedev phase --change ${changeName} for the archive contract, execute it, then rerun phasedev archive ${changeName}.`
    );
  }

  return refuse(
    `Change ${changeName} has not reached final validation; nothing to archive yet (current route: ${route.kind}).`
  );
}

export function runArchive(projectPath: string, config: Config, changeName: string): ArchiveCommandResult {
  const state = loadFlowState(projectPath, changeName);
  if (!state) {
    const completedArchive = findCompletedArchiveState(projectPath, changeName);
    if (completedArchive) {
      return done(archiveCompleteMessage(changeName));
    }
    return refuse(`No change named ${changeName} to archive.`);
  }

  if (state.activePhase === "archive") {
    return continueArchiveLifecycle(projectPath, config, changeName);
  }

  if (state.flowMode === "quick") {
    return runQuickArchive(projectPath, config, changeName, state.activePhase);
  }

  return runStandardArchive(projectPath, config, changeName);
}
