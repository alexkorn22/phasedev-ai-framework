export const TELEGRAM_MESSAGE_CHUNK_SIZE = 3900;
const DEFAULT_TELEGRAM_TIMEOUT_MS = 10_000;

export type FetchLike = typeof fetch;

export interface TelegramNotifierOptions {
  botToken: string;
  chatId: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

function splitByCodePoint(text: string, maxLength: number): string[] {
  if (text.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let current = "";
  for (const char of text) {
    if (current.length + char.length > maxLength) {
      chunks.push(current);
      current = "";
    }
    current += char;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export function splitTelegramMessage(text: string): string[] {
  return splitByCodePoint(text, TELEGRAM_MESSAGE_CHUNK_SIZE);
}

async function sendTelegramChunk(options: Required<TelegramNotifierOptions>, text: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetchImpl(
      `https://api.telegram.org/bot${encodeURIComponent(options.botToken)}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: options.chatId,
          text
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Telegram API responded with ${response.status}${body ? `: ${body}` : ""}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramMessage(options: TelegramNotifierOptions, text: string): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TELEGRAM_TIMEOUT_MS;
  const chunks = splitTelegramMessage(text);

  for (const chunk of chunks) {
    await sendTelegramChunk({
      botToken: options.botToken,
      chatId: options.chatId,
      fetchImpl,
      timeoutMs
    }, chunk);
  }
}
