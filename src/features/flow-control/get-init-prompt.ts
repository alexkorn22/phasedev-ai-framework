import { FlowRalphConfig } from "../../entities/flow-config/config";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { resolveCurrentFlowState } from "./current-flow-state";
import { prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";

export function getInitPrompt(projectPath: string, _config?: FlowRalphConfig): FlowPrompt {
  try {
    const state = resolveCurrentFlowState(projectPath);

    return prompt("init", "init", renderTemplate("init", {
      current_stage: state.stage,
      route_kind: state.routeKind,
      active_change_path: state.activeChangePath ? toFileUrl(state.activeChangePath) : "none"
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return prompt("init", "init", [
      "================================================================================",
      "[FLOW CONTROLLER] BLOCKED: Invalid flow state",
      message,
      "",
      "flow init performed no filesystem changes.",
      "Fix the flow state before running `flow next`.",
      "================================================================================"
    ].join("\n"), true, "Invalid flow state");
  }
}
