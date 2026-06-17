import { describe, test, expect } from "bun:test";
import { CodexTurnTimeoutError, runCodexTurn } from "../src/features/runner/codex-turn";
import type { CodexStreamEvent } from "../src/features/runner/codex-stream-reporter";

async function* streamEvents(events: CodexStreamEvent[]): AsyncGenerator<CodexStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

describe("runCodexTurn", () => {
  test("returns usage from turn.completed event when streaming", async () => {
    const thread = {
      id: "thread-usage",
      async runStreamed(_prompt: string) {
        return {
          events: streamEvents([
            { type: "turn.started" as const },
            {
              type: "item.completed" as const,
              item: { id: "msg-1", type: "agent_message", text: "done" }
            },
            {
              type: "turn.completed" as const,
              usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 50, reasoning_output_tokens: 20 }
            }
          ])
        };
      }
    };

    const result = await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, true);

    expect(result.usage).not.toBeNull();
    expect(result.usage?.inputTokens).toBe(100);
    expect(result.usage?.cachedInputTokens).toBe(10);
    expect(result.usage?.outputTokens).toBe(50);
    expect(result.usage?.reasoningOutputTokens).toBe(20);
  });

  test("returns null usage when turn.completed has no usage field", async () => {
    const thread = {
      id: "thread-no-usage",
      async runStreamed(_prompt: string) {
        return {
          events: streamEvents([
            { type: "turn.started" as const },
            {
              type: "item.completed" as const,
              item: { id: "msg-1", type: "agent_message", text: "done" }
            },
            { type: "turn.completed" as const }
          ])
        };
      }
    };

    const result = await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, true);

    expect(result.usage).toBeNull();
  });

  test("returns null usage when using non-streaming run()", async () => {
    const thread = {
      id: "thread-non-stream",
      async run(_prompt: string) {
        return { finalResponse: "response" };
      }
    };

    const result = await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, false);

    expect(result.usage).toBeNull();
    expect(result.finalResponse).toBe("response");
  });

  test("returns finalResponse from agent_message", async () => {
    const thread = {
      id: "thread-response",
      async runStreamed(_prompt: string) {
        return {
          events: streamEvents([
            { type: "turn.started" as const },
            {
              type: "item.completed" as const,
              item: { id: "msg-1", type: "agent_message", text: "my final response" }
            },
            {
              type: "turn.completed" as const,
              usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0 }
            }
          ])
        };
      }
    };

    const result = await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, true);

    expect(result.finalResponse).toBe("my final response");
  });

  test("passes AbortSignal to streamed turns", async () => {
    let receivedSignal: AbortSignal | undefined;
    const thread = {
      id: "thread-signal",
      async runStreamed(_prompt: string, options?: { signal?: AbortSignal }) {
        receivedSignal = options?.signal;
        return {
          events: streamEvents([
            { type: "turn.started" as const },
            { type: "turn.completed" as const }
          ])
        };
      }
    };

    await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, true, {
      watchdog: { enabled: true, turnTimeoutMs: 100, inactivityTimeoutMs: 100, statusIntervalMs: 100, abortGraceMs: 10 }
    });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  test("times out when a streamed turn becomes inactive", async () => {
    let aborted = false;
    const thread = {
      id: "thread-inactive",
      async runStreamed(_prompt: string, options?: { signal?: AbortSignal }) {
        options?.signal?.addEventListener("abort", () => { aborted = true; });
        return {
          events: (async function* (): AsyncGenerator<CodexStreamEvent> {
            yield { type: "turn.started" };
            await new Promise(() => undefined);
          })()
        };
      }
    };

    try {
      await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, true, {
        watchdog: { enabled: true, turnTimeoutMs: 200, inactivityTimeoutMs: 10, statusIntervalMs: 200, abortGraceMs: 5 }
      });
      throw new Error("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(CodexTurnTimeoutError);
      const timeout = error as CodexTurnTimeoutError;
      expect(timeout.failure.timeoutKind).toBe("inactivity");
      expect(timeout.failure.lastEventSummary).toBe("turn.started");
      expect(timeout.failure.threadId).toBe("thread-inactive");
      expect(aborted).toBe(true);
    }
  });

  test("times out when a streamed turn exceeds the absolute turn limit", async () => {
    const thread = {
      id: "thread-turn-timeout",
      async runStreamed(_prompt: string) {
        return {
          events: (async function* (): AsyncGenerator<CodexStreamEvent> {
            while (true) {
              yield { type: "turn.started" };
              await sleep(2);
            }
          })()
        };
      }
    };

    try {
      await runCodexTurn(thread, "test prompt", "test", { log: () => {} }, true, {
        watchdog: { enabled: true, turnTimeoutMs: 10, inactivityTimeoutMs: 100, statusIntervalMs: 100, abortGraceMs: 5 }
      });
      throw new Error("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(CodexTurnTimeoutError);
      expect((error as CodexTurnTimeoutError).failure.timeoutKind).toBe("turn");
    }
  });

  test("uses streamed transport without printing Codex events when stream output is disabled", async () => {
    const messages: string[] = [];
    let streamed = false;
    let buffered = false;
    const thread = {
      id: "thread-silent-stream",
      async runStreamed(_prompt: string) {
        streamed = true;
        return {
          events: streamEvents([
            { type: "turn.started" as const },
            { type: "item.completed" as const, item: { id: "msg-1", type: "agent_message", text: "streamed response" } },
            { type: "turn.completed" as const }
          ])
        };
      },
      async run(_prompt: string) {
        buffered = true;
        return { finalResponse: "buffered response" };
      }
    };

    const result = await runCodexTurn(thread, "test prompt", "test", { log: message => messages.push(message) }, false);

    expect(streamed).toBe(true);
    expect(buffered).toBe(false);
    expect(result.finalResponse).toBe("streamed response");
    expect(messages.some(message => message.startsWith("[CODEX "))).toBe(false);
  });
});
