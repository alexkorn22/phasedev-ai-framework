import * as fs from "fs";
import * as path from "path";
import { Config, loadConfig } from "../../entities/config/config";
import { createArchiveState, findPendingArchiveState, ArchiveState } from "../../entities/change/archive-state";
import { archiveRootPath, archiveTargetPath, buildChangePaths, ChangePaths } from "../../entities/change/paths";
import { Prompt } from "../../entities/stage/types";
import { moveDirectory } from "../../shared/fs/move-directory";
import { renderTemplate } from "../../shared/templates/render-template";
import { archiveReadinessBlocker, prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";
import { renderSkillPolicy } from "./skill-policy";

interface ArchiveUrls {
  prd_path: string;
  rules_path: string;
  research_path: string;
  design_path: string;
  plan_path: string;
  findings_path: string;
}

function archiveUrls(paths: ChangePaths): ArchiveUrls {
  return {
    prd_path: toFileUrl(paths.prdPath),
    rules_path: toFileUrl(paths.rulesPath),
    research_path: toFileUrl(paths.researchPath),
    design_path: toFileUrl(paths.designPath),
    plan_path: toFileUrl(paths.planPath),
    findings_path: toFileUrl(paths.findingsPath)
  };
}

export function archivePrompt(projectPath: string, state: ArchiveState, config: Config): Prompt {
  const archivedPaths = buildChangePaths(state.archivePath);
  const urls = archiveUrls(archivedPaths);

  return prompt("next", "archive", renderTemplate("step6_archive", {
    change_name: state.changeName,
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    research_path: urls.research_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path,
    findings_path: urls.findings_path,
    main_specs_path: toFileUrl(path.join(projectPath, "openspec", "specs")),
    change_specs_path: toFileUrl(path.join(state.archivePath, "specs")),
    archive_state_path: toFileUrl(path.join(state.archivePath, ".flow-archive.json")),
    archive_path: state.archivePath,
    skill_policy: renderSkillPolicy("archive", config)
  }));
}

export function getPendingArchivePrompt(projectPath: string, config: Config = loadConfig()): Prompt | null {
  const pendingState = findPendingArchiveState(projectPath);
  return pendingState ? archivePrompt(projectPath, pendingState, config) : null;
}

export function startArchiveStage(projectPath: string, changeDir: string, now: Date, config: Config = loadConfig()): Prompt {
  const pendingPrompt = getPendingArchivePrompt(projectPath, config);
  if (pendingPrompt) {
    return pendingPrompt;
  }

  const changeName = path.basename(changeDir);
  const today = now.toISOString().split("T")[0];
  const archiveTarget = archiveTargetPath(projectPath, changeName, today);

  if (fs.existsSync(archiveTarget)) {
    return archiveReadinessBlocker(
      "Archive target already exists.",
      archiveTarget,
      "The active change was not moved because the date-prefixed archive directory already exists."
    );
  }

  fs.mkdirSync(archiveRootPath(projectPath), { recursive: true });
  moveDirectory(changeDir, archiveTarget);
  const state = createArchiveState(changeName, archiveTarget, now);
  return archivePrompt(projectPath, state, config);
}
