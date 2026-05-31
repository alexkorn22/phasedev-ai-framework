import * as fs from "fs";
import * as path from "path";
import { FlowRalphConfig } from "../../entities/flow-config/config";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { prompt } from "./prompt-blockers";

export function getInitPrompt(projectPath: string, _config?: FlowRalphConfig): FlowPrompt {
  const changesDir = path.join(projectPath, "openspec", "changes");
  if (!fs.existsSync(changesDir)) {
    fs.mkdirSync(changesDir, { recursive: true });
  }

  return prompt("init", "init", renderTemplate("init", {}));
}
