import { Config } from "../../entities/config/config";
import { Prompt } from "../../entities/phase/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { AmbiguousChangeError } from "../../entities/change/change-errors";
import { resolveCurrentState } from "./current-flow-state";
import { prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";

export function getInitPrompt(projectPath: string, _config?: Config): Prompt {
  try {
    const state = resolveCurrentState(projectPath);

    return prompt("init", "init", renderTemplate("init", {
      current_phase: state.phase,
      route_kind: state.routeKind,
      active_change_path: state.activeChangePath ? toFileUrl(state.activeChangePath) : "none"
    }));
  } catch (error) {
    if (error instanceof AmbiguousChangeError) {
      return prompt("init", "init", [
        "================================================================================",
        "[FLOW CONTROLLER] BLOCKED: Ambiguous flow state",
        error.message,
        "",
        "phasedev init performed no filesystem changes.",
        "Tip: Use `phasedev list` to see all changes and their status.",
        "================================================================================"
      ].join("\n"), true, "Ambiguous flow state");
    }

    const message = error instanceof Error ? error.message : String(error);
    return prompt("init", "init", [
      "================================================================================",
      "[FLOW CONTROLLER] BLOCKED: Invalid flow state",
      message,
      "",
      "phasedev init performed no filesystem changes.",
      "Fix the flow state before running `phasedev phase` or `phasedev advance`.",
      "================================================================================"
    ].join("\n"), true, "Invalid flow state");
  }
}
