import { loadFlowState } from "../../entities/change/flow-state";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { parseValidationVerdict } from "../../entities/validation-findings/parse-validation-findings";
import { renderTemplate } from "../../shared/templates/render-template";
import { toFileUrl } from "./prompt-formatters";

export interface FeedbackPrompt {
  prompt: string;
  blocked: boolean;
  reason?: string;
}

export function getFeedbackPrompt(projectPath: string): FeedbackPrompt {
  const state = loadFlowState(projectPath);
  const changeDir = findActiveChangeDir(projectPath);
  if (!state || !changeDir) {
    return {
      prompt: "[PHASEDEV] No active change. Run: phasedev create-change <name>.",
      blocked: true,
      reason: "No active change"
    };
  }

  const paths = buildChangePaths(changeDir);
  return {
    prompt: renderTemplate("feedback", {
      active_phase: state.activePhase,
      active_iteration: state.activeIteration === null ? "none" : String(state.activeIteration),
      findings_path: toFileUrl(paths.findingsPath),
      current_verdict: parseValidationVerdict(paths.findingsPath)
    }),
    blocked: false
  };
}
