import { Config } from "../../entities/config/config";
import { Prompt } from "../../entities/stage/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { resolveCurrentState } from "./current-flow-state";
import { prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";

export function getInitPrompt(projectPath: string, _config?: Config): Prompt {
  try {
    const state = resolveCurrentState(projectPath);

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
      "phasedev init performed no filesystem changes.",
      "Fix the flow state before running `phasedev next`.",
      "================================================================================"
    ].join("\n"), true, "Invalid flow state");
  }
}
