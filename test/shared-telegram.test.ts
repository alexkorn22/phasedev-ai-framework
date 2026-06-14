import { describe, test, expect } from "bun:test";
import { splitTelegramMessage, TELEGRAM_MESSAGE_CHUNK_SIZE } from "../src/shared/telegram";

describe("splitTelegramMessage", () => {
  test("returns empty array for empty string", () => {
    expect(splitTelegramMessage("")).toEqual([]);
  });

  test("returns single chunk when message fits in one chunk", () => {
    const text = "hello";
    const chunks = splitTelegramMessage(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello");
  });

  test("splits message at chunk boundary", () => {
    const text = "x".repeat(TELEGRAM_MESSAGE_CHUNK_SIZE * 2 + 100);
    const chunks = splitTelegramMessage(text);
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe(text);
  });

  test("all chunks respect max chunk size", () => {
    const chunks = splitTelegramMessage("x".repeat(8200));
    expect(chunks.every(chunk => chunk.length <= TELEGRAM_MESSAGE_CHUNK_SIZE)).toBe(true);
  });

  test("reconstructs original text from chunks", () => {
    const original = "x".repeat(8200);
    const chunks = splitTelegramMessage(original);
    expect(chunks.join("")).toBe(original);
  });

  test("handles exact chunk size boundary", () => {
    const text = "a".repeat(TELEGRAM_MESSAGE_CHUNK_SIZE);
    const chunks = splitTelegramMessage(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  test("handles multibyte characters correctly", () => {
    const emoji = "\u{1F600}"; // 4-byte codepoint
    const repeated = emoji.repeat(100);
    const chunks = splitTelegramMessage(repeated);
    expect(chunks.join("")).toBe(repeated);
    expect(chunks.every(chunk => chunk.length <= TELEGRAM_MESSAGE_CHUNK_SIZE)).toBe(true);
  });
});
