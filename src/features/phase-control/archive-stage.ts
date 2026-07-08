import * as fs from "fs";
import * as path from "path";
import { Config, loadConfig } from "../../entities/config/config";
import { createArchiveState, findPendingArchiveState, markArchiveMoved, readArchiveState, ArchiveState } from "../../entities/change/archive-state";
import { FLOW_STATE_FILE, writeFlowState } from "../../entities/change/flow-state";
import { archiveRootPath, archiveTargetPath, buildChangePaths, SYSTEM_DIR } from "../../entities/change/paths";
import { Prompt } from "../../entities/phase/types";
import { moveDirectory } from "../../shared/fs/move-directory";
import { renderTemplate } from "../../shared/templates/render-template";
import { prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { renderSkillComplianceLine, renderSkillPolicy } from "./skill-policy";
import { urlsFor } from "./prompt-render-helpers";

export function archiveTemplateVariables(projectPath: string, changeName: string, archivePath: string, config: Config): Record<string, string> {
  const archivedPaths = buildChangePaths(archivePath);
  const urls = urlsFor(archivedPaths);

  return {
    change_name: changeName,
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    research_path: urls.research_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    main_specs_path: toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs")),
    change_specs_path: toFileUrl(path.join(archivePath, "specs")),
    archive_state_path: toFileUrl(path.join(archivePath, ".phase-archive.json")),
    archive_path: archivePath,
    skill_policy: renderSkillPolicy("archive", config),
    skill_compliance_line: renderSkillComplianceLine("archive", config)
  };
}

export function archivePrompt(projectPath: string, state: ArchiveState, config: Config): Prompt {
  return prompt("next", "archive", renderTemplate("phase7_archive", archiveTemplateVariables(projectPath, state.changeName, state.archivePath, config)));
}

export function getPendingArchivePrompt(projectPath: string, config: Config = loadConfig(), changeName?: string): Prompt | null {
  const pendingState = findPendingArchiveState(projectPath, changeName);
  return pendingState ? archivePrompt(projectPath, pendingState, config) : null;
}

export function startArchiveStage(projectPath: string, changeDir: string, now: Date, config: Config = loadConfig()): Prompt {
  const changeName = path.basename(changeDir);
  const pendingPrompt = getPendingArchivePrompt(projectPath, config, changeName);
  if (pendingPrompt) {
    return pendingPrompt;
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
  writeFlowState(path.join(changeDir, FLOW_STATE_FILE), { activePhase: "archive", activeIteration: null, repairCycleCount: 0 });

  // Phase 2: move. If this throws, changeDir plus its un-moved archive-state are left intact for retry.
  fs.mkdirSync(archiveRootPath(projectPath), { recursive: true });
  moveDirectory(changeDir, archiveTarget);

  // Phase 3: mark moved now that the target path is authoritative.
  markArchiveMoved(archiveTarget, now.toISOString());
  const movedState = { ...state, archivePath: archiveTarget, movedAt: now.toISOString() };
  return archivePrompt(projectPath, movedState, config);
}
