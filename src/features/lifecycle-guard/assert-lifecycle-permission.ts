import type { CommandContext } from "../../shared/cli/command-context";
import { reportCliResult } from "../../shared/cli/json-output";

export function assertLifecyclePermission(
  ctx: CommandContext,
  commandName: "advance" | "archive" | "reset-change"
): boolean {
  const isOrchestrator =
    process.env.PHASEDEV_ORCHESTRATOR === "1" ||
    ctx.args.includes("--manual-lifecycle");

  if (!isOrchestrator) {
    reportCliResult(ctx.jsonMode, {
      ok: false,
      kind: "permission_denied",
      humanMessage: `[PHASEDEV] PERMISSION DENIED: Lifecycle mutation command '${commandName}' can only be executed by the orchestrator process or with explicit --manual-lifecycle flag in manual mode.`
    });
    return false;
  }
  return true;
}
