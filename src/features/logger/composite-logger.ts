import type { IterationLogger, IterationLogEntry } from "../../entities/iteration-log";

/**
 * Composes multiple IterationLoggers into one.
 * Delegates log() synchronously to all children in order.
 * Awaits flush() on all children sequentially.
 */
export function createCompositeLogger(loggers: IterationLogger[]): IterationLogger {
  return {
    log(entry: IterationLogEntry): void {
      for (const logger of loggers) {
        logger.log(entry);
      }
    },
    async flush(): Promise<void> {
      for (const logger of loggers) {
        await logger.flush();
      }
    }
  };
}
