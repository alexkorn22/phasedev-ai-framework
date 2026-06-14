import type { IterationLogEntry } from "./types";

/**
 * Contract for any logger that persists iteration results.
 * Implementations: JsonFileLogger, TelegramLogger, CompositeLogger.
 * Injected into ralph-runner via FlowRalphDependencies — never imported directly.
 */
export interface IterationLogger {
  log(entry: IterationLogEntry): void;
  flush(): Promise<void>;
}
