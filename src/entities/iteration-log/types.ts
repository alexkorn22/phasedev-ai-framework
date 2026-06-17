export type IterationOutcome =
  | "completed"
  | "blocked"
  | "no_progress"
  | "archived"
  | "violation"
  | "max_iterations";

export interface IterationUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

export interface IterationChangedFiles {
  added: string[];
  modified: string[];
  deleted: string[];
}

export type IterationFailure =
  | {
      kind: "codex_turn_timeout";
      timeoutKind: "turn" | "inactivity" | "abort_grace";
      message: string;
      elapsedMs: number;
      timeoutMs: number;
      lastEventAt: string | null;
      lastEventSummary: string | null;
      threadId: string | null;
    };

export interface IterationLogEntry {
  timestamp: string;
  iteration: number;
  stage: string;
  model: string;
  reasoningEffort: string;
  activeChange: string | null;
  durationMs: number;
  usage: IterationUsage | null;
  changedFiles: IterationChangedFiles;
  flowStateChanged: boolean;
  allowlistViolations: string[];
  outcome: IterationOutcome;
  initPrompt: string | null;
  agentPrompt: string | null;
  agentResponse: string;
  failure?: IterationFailure | null;
}
