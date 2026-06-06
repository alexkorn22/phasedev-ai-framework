import * as fs from "fs";
import * as path from "path";
import { FlowRalphConfig } from "../../entities/flow-config/config";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { resolveCurrentFlowState } from "./current-flow-state";
import { prompt } from "./prompt-blockers";
import { toFileUrl } from "./prompt-formatters";

export function getInitPrompt(projectPath: string, _config?: FlowRalphConfig): FlowPrompt {
  const changesDir = path.join(projectPath, "openspec", "changes");
  if (!fs.existsSync(changesDir)) {
    fs.mkdirSync(changesDir, { recursive: true });
  }

  const state = resolveCurrentFlowState(projectPath);

  return prompt("init", "init", renderTemplate("init", {
    current_stage: state.stage,
    active_change_path: state.activeChangePath ? toFileUrl(state.activeChangePath) : "none"
  }));
}
