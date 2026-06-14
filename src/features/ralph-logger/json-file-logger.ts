import * as fs from "fs";
import * as path from "path";
import type { IterationLogger, IterationLogEntry } from "../../entities/iteration-log";

/**
 * Appends one JSON line per iteration to a .jsonl file.
 * Creates parent directories on first write.
 * Sync writes — flush is a no-op.
 */
export function createJsonFileLogger(
  logPath: string,
  reporter: Pick<typeof console, "log"> = console
): IterationLogger {
  return {
    log(entry: IterationLogEntry): void {
      try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf-8");
      } catch (error) {
        reporter.log(`[FLOW RALPH] Failed to write to ralph-log.jsonl: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    async flush(): Promise<void> {
      // Writes are synchronous — nothing to drain.
    }
  };
}
