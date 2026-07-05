/**
 * Machine-readable output envelope for `phasedev --json`.
 *
 * Every command emits at most one envelope to stdout. The envelope is a
 * stable contract for orchestrating agents: `ok`/`kind` are always present,
 * the rest are populated when the command has something to report.
 */
export interface CliJsonEnvelope {
  ok: boolean;
  kind: string;
  phase?: string | null;
  message?: string;
  issues?: string[];
  data?: Record<string, unknown>;
}

export interface CliReport {
  /** Drives both the JSON envelope's `ok` and the process exit code. */
  ok: boolean;
  kind: string;
  /** Exact text to print in human mode (unchanged from pre-`--json` output). */
  humanMessage: string;
  /** Envelope `message`; defaults to `humanMessage` when omitted. */
  jsonMessage?: string;
  phase?: string | null;
  issues?: string[];
  data?: Record<string, unknown>;
}

/**
 * Print either the human-readable message or the JSON envelope for a
 * command result, then set process.exitCode from `ok` (0 when ok, 1 when not).
 */
export function reportCliResult(jsonMode: boolean, report: CliReport): void {
  if (jsonMode) {
    const envelope: CliJsonEnvelope = {
      ok: report.ok,
      kind: report.kind,
      message: report.jsonMessage ?? report.humanMessage
    };
    if (report.phase !== undefined) envelope.phase = report.phase;
    if (report.issues !== undefined) envelope.issues = report.issues;
    if (report.data !== undefined) envelope.data = report.data;
    console.log(JSON.stringify(envelope));
  } else {
    console.log(report.humanMessage);
  }

  process.exitCode = report.ok ? 0 : 1;
}

/**
 * Extract the `- <issue>` lines a command result formats into its message,
 * for commands whose result type does not already carry a structured
 * `issues: string[]` array.
 */
export function extractIssueLines(message: string): string[] {
  return message
    .split("\n")
    .filter(line => line.startsWith("- "))
    .map(line => line.slice(2));
}
