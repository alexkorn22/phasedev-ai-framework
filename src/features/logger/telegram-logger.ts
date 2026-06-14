import type { IterationLogger, IterationLogEntry } from "../../entities/iteration-log";
import { formatIterationSummary } from "../../entities/iteration-log";
import { sendTelegramMessage } from "../../shared/telegram";
import type { FetchLike } from "../../shared/telegram";

export interface TelegramLoggerOptions {
  botToken: string;
  chatId: string;
  fetchImpl?: FetchLike;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends a compact iteration summary to a Telegram chat.
 * Uses a queue to preserve order and avoid concurrent requests.
 * Never sends the full agentResponse — only the formatted summary.
 */
export function createTelegramLogger(
  options: TelegramLoggerOptions,
  reporter: Pick<typeof console, "log"> = console
): IterationLogger {
  let queue: Promise<void> = Promise.resolve();

  function enqueue(entry: IterationLogEntry): void {
    const summary = formatIterationSummary(entry);
    queue = queue
      .then(() => sendTelegramMessage(
        { botToken: options.botToken, chatId: options.chatId, fetchImpl: options.fetchImpl },
        summary
      ))
      .catch(error => {
        reporter.log(`[PHASEDEV RUNNER] Failed to send Telegram notification: ${formatError(error)}`);
      });
  }

  return {
    log(entry: IterationLogEntry): void {
      enqueue(entry);
    },
    async flush(): Promise<void> {
      await queue;
    }
  };
}
