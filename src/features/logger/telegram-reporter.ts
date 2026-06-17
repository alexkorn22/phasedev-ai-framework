import { sendTelegramMessage } from "../../shared/telegram";
import type { FetchLike } from "../../shared/telegram";
import type { FlushableReporter } from "./composite-reporter";

export interface TelegramReporterOptions {
  botToken: string;
  chatId: string;
  fetchImpl?: FetchLike;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createTelegramReporter(
  options: TelegramReporterOptions,
  reporter: Pick<typeof console, "log"> = console
): FlushableReporter {
  let queue: Promise<void> = Promise.resolve();

  function enqueue(message: string): void {
    queue = queue
      .then(() => sendTelegramMessage(
        { botToken: options.botToken, chatId: options.chatId, fetchImpl: options.fetchImpl },
        message
      ))
      .catch(error => {
        reporter.log(`[PHASEDEV RUNNER] Failed to send Telegram notification: ${formatError(error)}`);
      });
  }

  return {
    log(message: string): void {
      enqueue(message);
    },
    async flush(): Promise<void> {
      await queue;
    }
  };
}
