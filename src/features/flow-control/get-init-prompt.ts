import * as fs from "fs";
import * as path from "path";
import { FlowPrompt } from "../../entities/flow-stage/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { prompt } from "./prompt-blockers";

export function getInitPrompt(projectPath: string): FlowPrompt {
  const changesDir = path.join(projectPath, "openspec", "changes");
  if (!fs.existsSync(changesDir)) {
    fs.mkdirSync(changesDir, { recursive: true });
  }

  const initPrompt = [
    renderTemplate("init", {}),
    renderTemplate("skill_router", {})
  ].join("\n\n");

  return prompt("init", "init", initPrompt);
}
