import * as fs from "fs";
import { FlowState, locateChangeDir } from "../../entities/change/flow-state";
import { PhaseCheckResult } from "./check-flow";
import { buildChangePaths } from "../../entities/change/paths";
import { checkArchiveCompletion } from "./check-archive";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";

function ok(phase: string): PhaseCheckResult {
  return { ok: true, phase, message: `[PHASEDEV CHECK] OK: quick phase ${phase} is valid.` };
}
function fail(phase: string, issue: string): PhaseCheckResult {
  return { ok: false, phase, message: `[PHASEDEV CHECK] FAILED: quick phase ${phase} has issues.\n- ${issue}` };
}

export function quickCheck(
  projectPath: string,
  state: FlowState,
  changeName?: string,
  _blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): PhaseCheckResult {
  const changeDir = locateChangeDir(projectPath, state, changeName);
  if (!changeDir) return fail(state.activePhase, "cannot locate the quick change directory.");
  const paths = buildChangePaths(changeDir);

  switch (state.activePhase) {
    case "quick_plan": {
      if (!fs.existsSync(paths.worklogPath) || fs.readFileSync(paths.worklogPath, "utf-8").trim().length === 0) {
        return fail(state.activePhase, "worklog.md is missing or empty.");
      }
      return ok(state.activePhase);
    }
    case "quick_implementation":
    case "quick_validation":
    case "quick_spec_revision":
      return ok(state.activePhase);
    case "archive": {
      const result = checkArchiveCompletion(changeDir);
      return result.ok ? ok("archive") : fail("archive", result.issues.join("; "));
    }
    default:
      return fail(state.activePhase, "not a quick phase.");
  }
}
