import { describe, test, expect } from "bun:test";
import { runCodexTurn } from "../src/features/ralph-runner/codex-turn";
import type { CodexStreamEvent } from "../src/features/ralph-runner/codex-stream-reporter";

async function* streamEvents(events: CodexStreamEvent[]): AsyncGenerator<CodexStreamEvent> {
  for (const event of events) {
    yield event;
  }
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
});
