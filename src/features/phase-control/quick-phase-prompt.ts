import * as path from "path";
import { Config } from "../../entities/config/config";
import { FlowState } from "../../entities/change/flow-state";
import { Prompt } from "../../entities/phase/types";
import { buildChangePaths, SYSTEM_DIR } from "../../entities/change/paths";
import { resolveChangeDir } from "../../entities/change/active-change";
import { findPendingArchiveState } from "../../entities/change/archive-state";
import { renderPhaseTemplate, flowCheckCommand } from "./prompt-render-helpers";
import { toFileUrl } from "./prompt-formatters";

function blocked(phase: FlowState["activePhase"], message: string, reason: string): Prompt {
  return { command: "next", phase, prompt: message, blocked: true, reason };
}

export function quickPhasePrompt(projectPath: string, config: Config, state: FlowState, changeName?: string): Prompt {
  const activeDir = resolveChangeDir(projectPath, changeName);
  const pending = findPendingArchiveState(projectPath, changeName);
  const changeDir = activeDir ?? pending?.archivePath ?? null;
  if (!changeDir) {
    return blocked(state.activePhase, `[PHASEDEV] Cannot resolve change directory for quick phase ${state.activePhase}.`, "No change directory");
  }

  const paths = buildChangePaths(changeDir);
  const projectSpecs = toFileUrl(path.join(projectPath, SYSTEM_DIR, "specs"));
  const worklogUrl = toFileUrl(paths.worklogPath);
  const selfCheck = flowCheckCommand(projectPath, changeName);

  const common = { project_path: projectPath, worklog_path: worklogUrl };

  switch (state.activePhase) {
    case "quick_plan":
      return {
        command: "next", phase: state.activePhase, blocked: false,
        prompt: renderPhaseTemplate("quick_plan", "quick_plan", { ...common, self_check_command: selfCheck }, config)
      };
    case "quick_implementation":
      return {
        command: "next", phase: state.activePhase, blocked: false,
        prompt: renderPhaseTemplate("quick_implementation", "quick_implementation", { ...common, self_check_command: selfCheck }, config)
      };
    case "quick_validation":
      return {
        command: "next", phase: state.activePhase, blocked: false,
        prompt: renderPhaseTemplate("quick_validation", "quick_validation", { ...common }, config)
      };
    case "quick_spec_revision":
      return {
        command: "next", phase: state.activePhase, blocked: false,
        prompt: renderPhaseTemplate("quick_spec_revision", "quick_spec_revision", { ...common, main_specs_path: projectSpecs }, config)
      };
    case "archive":
      return {
        command: "next", phase: "archive", blocked: false,
        prompt: renderPhaseTemplate("archive", "quick_archive", {
          change_name: path.basename(changeDir),
          archive_path: changeDir,
          archive_state_path: toFileUrl(path.join(changeDir, ".phase-archive.json")),
          worklog_path: worklogUrl,
          main_specs_path: projectSpecs,
          change_specs_path: toFileUrl(path.join(changeDir, "specs"))
        }, config)
      };
    default:
      return blocked(state.activePhase, `[PHASEDEV] ${state.activePhase} is not a quick phase.`, "Not a quick phase");
  }
}
