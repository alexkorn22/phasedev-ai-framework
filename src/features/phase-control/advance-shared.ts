import { Config } from "../../entities/config/config";
import { FlowState } from "../../entities/change/flow-state";
import { scanChangedFilesOutsidePhasedev } from "./changed-file-inventory";

export interface AdvanceResult {
  ok: boolean;
  advanced: boolean;
  finished: boolean;
  newState: FlowState | null;
  message: string;
}

/**
 * Refuse to advance when uncommitted changes exist outside `.phasedev/**`.
 * Fails open (does not gate) when the gate is disabled, or when the project
 * is not a git repo or the scan otherwise errors — a non-git project must
 * not be blocked by a check it cannot answer.
 */
export function commitGateBlocks(projectPath: string, config: Config): boolean {
  if (!config.requireIterationCommit) return false;
  const scan = scanChangedFilesOutsidePhasedev(projectPath);
  if (!scan.ok) return false;
  return scan.entries.length > 0;
}
