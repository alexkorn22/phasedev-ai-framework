import * as fs from "fs";
import * as path from "path";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { updateIterationStatus } from "../../entities/iteration-plan/update-iteration-status";

export interface SetIterationStatusResult {
  ok: boolean;
  message: string;
}

export function setIterationStatus(
  projectPath: string,
  iterationId: number,
  status: "completed" | "in_progress" | "not_started",
  explicitFile?: string,
  changeName?: string
): SetIterationStatusResult {
  let filePath: string;

  if (explicitFile) {
    if (!fs.existsSync(explicitFile)) {
      return { ok: false, message: `File not found: ${explicitFile}` };
    }
    filePath = explicitFile;
  } else {
    const changeDir = resolveChangeDir(projectPath, changeName);
    if (!changeDir) {
      return { ok: false, message: "No active change found." };
    }
    const paths = buildChangePaths(changeDir);
    filePath = paths.iterationPlanPath;

    if (!fs.existsSync(filePath)) {
      return { ok: false, message: "iteration_plan.md does not exist in the active change." };
    }
  }

  const updated = updateIterationStatus(filePath, iterationId, status);
  if (!updated) {
    return { ok: false, message: `Iteration ${iterationId} not found in plan or heading already has the requested status` };
  }

  const statusLabels: Record<string, string> = {
    completed: "[x]",
    in_progress: "[~]",
    not_started: "[ ]"
  };

  return {
    ok: true,
    message: `Iteration ${iterationId} status set to ${statusLabels[status]}`
  };
}
