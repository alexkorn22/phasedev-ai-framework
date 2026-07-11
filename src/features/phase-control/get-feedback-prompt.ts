import { loadFlowState } from "../../entities/change/flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { parseValidationVerdict } from "../../entities/validation-findings/parse-validation-findings";
import { renderTemplate } from "../../shared/templates/render-template";
import { toFileUrl } from "./prompt-formatters";

export interface FeedbackPrompt {
  prompt: string;
  blocked: boolean;
  reason?: string;
}

export function getFeedbackPrompt(projectPath: string, changeName?: string): FeedbackPrompt {
  const state = loadFlowState(projectPath, changeName);
  const changeDir = resolveChangeDir(projectPath, changeName);
  if (!state || !changeDir) {
    return {
      prompt: "[PHASEDEV] No active change. Run: phasedev create-change <name>.",
      blocked: true,
      reason: "No active change"
    };
  }

  if (state.flowMode === "quick") {
    return {
      prompt: `[PHASEDEV] This is a quick-mode change (phase: ${state.activePhase}). Feedback handling is managed in the orchestrator session; run \`phasedev phase\` for the current quick contract.`,
      blocked: false
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
