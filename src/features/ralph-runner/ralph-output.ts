import { TelegramNotificationConfig } from "./config";
import { FetchLike, sendTelegramMessage } from "./telegram-notifier";

export interface RalphOutput extends Pick<typeof console, "log"> {
  notify(message: string): void;
  flush(): Promise<void>;
}

export interface RalphOutputOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function disabledOutput(reporter: Pick<typeof console, "log">): RalphOutput {
  return {
    log: message => reporter.log(message),
    notify: () => undefined,
    async flush() {
      return undefined;
    }
  };
}

export function createRalphOutput(
  telegramConfig: TelegramNotificationConfig,
  reporter: Pick<typeof console, "log">,
  options: RalphOutputOptions = {}
): RalphOutput {
  if (!telegramConfig.enabled) {
    return disabledOutput(reporter);
  }

  const env = options.env ?? process.env;
  const botToken = env[telegramConfig.botTokenEnv];
  const chatId = env[telegramConfig.chatIdEnv];

  if (!botToken || !chatId) {
    reporter.log(`[FLOW RALPH] Telegram notifications disabled: missing ${telegramConfig.botTokenEnv} or ${telegramConfig.chatIdEnv}`);
    return disabledOutput(reporter);
  }

  const resolvedBotToken = botToken;
  const resolvedChatId = chatId;
  let queue: Promise<void> = Promise.resolve();

  function enqueue(message: string): void {
    queue = queue
      .then(() => sendTelegramMessage({
        botToken: resolvedBotToken,
        chatId: resolvedChatId,
        fetchImpl: options.fetchImpl
      }, message))
      .catch(error => {
        reporter.log(`[FLOW RALPH] Failed to send Telegram notification: ${formatUnknownError(error)}`);
      });
  }

  return {
    log(message: string): void {
      reporter.log(message);
      enqueue(message);
    },
    notify(message: string): void {
      enqueue(message);
    },
    async flush(): Promise<void> {
      await queue;
    }
  };
}
