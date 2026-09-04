import * as fs from "fs";
import * as path from "path";
import { createArchiveState, findPendingArchiveState, markArchiveMoved, readArchiveState, ArchiveState } from "../../entities/change/archive-state";
import { FLOW_STATE_FILE, loadFlowState, writeFlowState } from "../../entities/change/flow-state";
import { archiveRootPath, archiveTargetPath, buildChangePaths, SYSTEM_DIR } from "../../entities/change/paths";
import { Prompt } from "../../entities/phase/types";
import { isDuplicateMoveArtifact, moveDirectory } from "../../shared/fs/move-directory";
import { renderTemplate } from "../../shared/templates/render-template";
import { archiveReadinessBlocker, prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { renderSkillComplianceLine, renderSkillPolicy } from "./skill-policy";
import { urlsFor, renderPhaseOpeningSummary } from "./prompt-render-helpers";

export function archiveTemplateVariables(projectPath: string, changeName: string, archivePath: string): Record<string, string> {
  const archivedPaths = buildChangePaths(archivePath);
  const urls = urlsFor(archivedPaths);

  return {
    phase_opening_summary: renderPhaseOpeningSummary("archive"),
    change_name: changeName,
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    research_path: urls.research_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    worklog_path: toFileUrl(archivedPaths.worklogPath),
    main_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
    change_specs_path: toFileUrl(path.join(archivePath, "specs")),
    archive_state_path: toFileUrl(path.join(archivePath, ".phase-archive.json")),
    archive_path: archivePath,
    skill_policy: renderSkillPolicy(),
    skill_compliance_line: renderSkillComplianceLine()
  };
}

export function archivePrompt(projectPath: string, state: ArchiveState): Prompt {
  const stateJsonPath = path.join(state.archivePath, FLOW_STATE_FILE);
  let isQuick = false;
  if (fs.existsSync(stateJsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(stateJsonPath, "utf-8"));
      isQuick = raw?.flowMode === "quick";
    } catch {
      // ignore
    }
  }
  const templateName = isQuick ? "quick_archive" : "phase7_archive";
  return prompt("phase", "archive", renderTemplate(templateName, archiveTemplateVariables(projectPath, state.changeName, state.archivePath)));
}

export function getPendingArchivePrompt(projectPath: string, changeName?: string): Prompt | null {
  const pendingState = findPendingArchiveState(projectPath, changeName);
  return pendingState ? archivePrompt(projectPath, pendingState) : null;
}

export function startArchiveStage(projectPath: string, changeDir: string, now: Date): Prompt {
  const changeName = path.basename(changeDir);
  const pendingState = findPendingArchiveState(projectPath, changeName);
  if (pendingState) {
    if (fs.existsSync(changeDir) && path.resolve(changeDir) !== path.resolve(pendingState.archivePath)) {
      if (isDuplicateMoveArtifact(changeDir, pendingState.archivePath)) {
        fs.rmSync(changeDir, { recursive: true, force: true });
      } else {
        return archiveReadinessBlocker(
          "Orphaned change directory conflicts with the pending archive.",
          changeDir,
          `An interrupted archive left "${changeName}" in both the active and archive locations with divergent contents. Reconcile or remove ${changeDir} manually, then retry.`,
          undefined
        );
      }
    }
    return archivePrompt(projectPath, pendingState);
  }

  const today = now.toISOString().split("T")[0];
  let archiveTarget = archiveTargetPath(projectPath, changeName, today);

  if (fs.existsSync(archiveTarget)) {
    let suffix = 2;
    while (fs.existsSync(archiveTarget)) {
      archiveTarget = archiveTargetPath(projectPath, `${changeName}-${suffix}`, today);
      suffix++;
    }
  }

  // Phase 1: write archive-state INSIDE the still-active change dir, before moving anything.
  // A crash here leaves changeDir with a pre-move archive marker (no movedAt), which is
  // detected as un-moved on retry below instead of being treated as a fresh start.
  let state = readArchiveState(changeDir);
  if (!state) {
    state = createArchiveState(changeName, archiveTarget, now, changeDir);
  }

  // Set the phase lock to archive *before* moving: state.json travels inside the
  // change dir, so writing it here means the archived directory always arrives
  // already locked to the archive phase, even if the process dies after the move.
  const preservedFlowMode = loadFlowState(projectPath, changeName)?.flowMode;
  writeFlowState(path.join(changeDir, FLOW_STATE_FILE), {
    activePhase: "archive",
    activeIteration: null,
    repairCycleCount: 0,
    ...(preservedFlowMode ? { flowMode: preservedFlowMode } : {})
  });

  // Phase 2: move. If this throws, changeDir plus its un-moved archive-state are left intact for retry.
  fs.mkdirSync(archiveRootPath(projectPath), { recursive: true });
  moveDirectory(changeDir, archiveTarget);

  // Phase 3: mark moved now that the target path is authoritative.
  markArchiveMoved(archiveTarget, now.toISOString());
  const movedState = { ...state, archivePath: archiveTarget, movedAt: now.toISOString() };
  return archivePrompt(projectPath, movedState);
}
