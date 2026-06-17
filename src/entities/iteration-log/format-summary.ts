import type { IterationLogEntry } from "./types";

function formatDuration(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function formatUsage(entry: IterationLogEntry): string {
  if (!entry.usage) {
    return "no usage data";
  }
  return `${entry.usage.inputTokens}\u2192${entry.usage.outputTokens} tokens`;
}

function formatFiles(entry: IterationLogEntry): string {
  const { added, modified, deleted } = entry.changedFiles;
  return `+${added.length}/~${modified.length}/-${deleted.length} files`;
}

function formatFailure(entry: IterationLogEntry): string | null {
  if (!entry.failure) {
    return null;
  }

  if (entry.failure.kind === "codex_turn_timeout") {
    const lastEvent = entry.failure.lastEventSummary ? ` last=${entry.failure.lastEventSummary}` : "";
    return `Failure: codex_turn_timeout (${entry.failure.timeoutKind}, ${Math.round(entry.failure.elapsedMs / 1000)}s/${Math.round(entry.failure.timeoutMs / 1000)}s)${lastEvent}`;
  }

  return null;
}

/**
 * Formats a compact one-shot Telegram summary for a completed iteration.
 * Telegram-only: not written to any log file.
 *
 * Example output:
 *   Iteration 3 | implementation | gpt-5.5 (medium)
 *   45s | 1500->800 tokens | +2/~1/-0 files
 *   Outcome: completed
 */
export function formatIterationSummary(entry: IterationLogEntry): string {
  const header = `Iteration ${entry.iteration} | ${entry.stage} | ${entry.model} (${entry.reasoningEffort})`;
  const metrics = `${formatDuration(entry.durationMs)} | ${formatUsage(entry)} | ${formatFiles(entry)}`;
  const outcome = `Outcome: ${entry.outcome}`;
  return [header, metrics, outcome, formatFailure(entry)].filter(Boolean).join("\n");
}
