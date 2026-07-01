import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createCompositeLogger,
  createCompositeReporter,
  createJsonFileLogger,
  createTelegramLogger,
  createTelegramReporter
} from "../src/features/logger";
import type { IterationLogEntry } from "../src/entities/iteration-log";
import type { FetchLike } from "../src/shared/telegram";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ag-dev-logs-logger-test-"));
}

function makeEntry(overrides: Partial<IterationLogEntry> = {}): IterationLogEntry {
  return {
    timestamp: "2026-05-29T10:00:00.000Z",
    iteration: 1,
    stage: "implementation",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    activeChange: ".phasedev/changes/sample-change",
    durationMs: 5000,
    usage: { inputTokens: 100, cachedInputTokens: 10, outputTokens: 50, reasoningOutputTokens: 20 },
    changedFiles: { added: ["a.ts"], modified: [], deleted: [] },
    flowStateChanged: true,
    allowlistViolations: [],
    outcome: "completed",
    initPrompt: "Exact init prompt.",
    agentPrompt: "Exact prompt sent to the agent.",
    agentResponse: "Done.",
    failure: null,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// JsonFileLogger
// ---------------------------------------------------------------------------

describe("JsonFileLogger", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  test("creates the log file on first log call", () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    logger.log(makeEntry());
    expect(fs.existsSync(logPath)).toBe(true);
  });

  test("creates parent directories if they do not exist", () => {
    const logPath = path.join(tmpDir, "nested", "deep", "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    logger.log(makeEntry());
    expect(fs.existsSync(logPath)).toBe(true);
  });

  test("each line is valid JSON", () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    logger.log(makeEntry({ iteration: 1 }));
    logger.log(makeEntry({ iteration: 2 }));
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("preserves all entry fields in JSON", () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    const entry = makeEntry({ iteration: 42, stage: "technical_design", initPrompt: "my init prompt", agentPrompt: "my prompt", agentResponse: "my response" });
    logger.log(entry);
    const parsed = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(parsed.iteration).toBe(42);
    expect(parsed.stage).toBe("technical_design");
    expect(parsed.initPrompt).toBe("my init prompt");
    expect(parsed.agentPrompt).toBe("my prompt");
    expect(parsed.agentResponse).toBe("my response");
    expect(parsed.usage).toBeDefined();
    expect(parsed.changedFiles).toBeDefined();
    expect(parsed.durationMs).toBe(5000);
  });

  test("preserves structured timeout failure details in JSON", () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    logger.log(makeEntry({
      outcome: "blocked",
      failure: {
        kind: "codex_turn_timeout",
        timeoutKind: "turn",
        message: "Codex turn timed out after 1000ms.",
        elapsedMs: 1010,
        timeoutMs: 1000,
        lastEventAt: null,
        lastEventSummary: null,
        threadId: "thread-timeout"
      }
    }));

    const parsed = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(parsed.failure).toEqual({
      kind: "codex_turn_timeout",
      timeoutKind: "turn",
      message: "Codex turn timed out after 1000ms.",
      elapsedMs: 1010,
      timeoutMs: 1000,
      lastEventAt: null,
      lastEventSummary: null,
      threadId: "thread-timeout"
    });
  });

  test("appends entries without overwriting previous ones", () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    logger.log(makeEntry({ iteration: 1 }));
    logger.log(makeEntry({ iteration: 2 }));
    logger.log(makeEntry({ iteration: 3 }));
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).iteration).toBe(1);
    expect(JSON.parse(lines[1]).iteration).toBe(2);
    expect(JSON.parse(lines[2]).iteration).toBe(3);
  });

  test("flush resolves immediately (sync writes)", async () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    logger.log(makeEntry());
    await expect(logger.flush()).resolves.toBeUndefined();
  });

  test("handles null usage without throwing", () => {
    const logPath = path.join(tmpDir, "ralph-log.jsonl");
    const logger = createJsonFileLogger(logPath);
    expect(() => logger.log(makeEntry({ usage: null }))).not.toThrow();
    const parsed = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(parsed.usage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TelegramLogger
// ---------------------------------------------------------------------------

describe("TelegramLogger", () => {
  test("sends a compact summary (not full agentResponse) to Telegram", async () => {
    const sentMessages: string[] = [];
    const mockFetch: FetchLike = async (_url, options) => {
      const body = JSON.parse((options?.body ?? "") as string);
      sentMessages.push(body.text as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const logger = createTelegramLogger({ botToken: "bot", chatId: "chat", fetchImpl: mockFetch });
    const longResponse = "A".repeat(5000);
    logger.log(makeEntry({ agentResponse: longResponse, iteration: 3, stage: "technical_design" }));
    await logger.flush();

    const combined = sentMessages.join("\n");
    expect(combined).toContain("3");
    expect(combined).toContain("technical_design");
    // summary must not include the full raw agentResponse
    expect(combined).not.toContain(longResponse);
  });

  test("sends compact timeout failure summary to Telegram without raw agentResponse", async () => {
    const sentMessages: string[] = [];
    const mockFetch: FetchLike = async (_url, options) => {
      const body = JSON.parse((options?.body ?? "") as string);
      sentMessages.push(body.text as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const logger = createTelegramLogger({ botToken: "bot", chatId: "chat", fetchImpl: mockFetch });
    const rawResponse = "RAW TIMEOUT RESPONSE ".repeat(200);
    logger.log(makeEntry({
      outcome: "blocked",
      agentResponse: rawResponse,
      failure: {
        kind: "codex_turn_timeout",
        timeoutKind: "inactivity",
        message: "Codex turn timed out after 900000ms without stream activity.",
        elapsedMs: 901000,
        timeoutMs: 900000,
        lastEventAt: "2026-05-29T10:14:00.000Z",
        lastEventSummary: "turn.started",
        threadId: "thread-timeout"
      }
    }));
    await logger.flush();

    const combined = sentMessages.join("\n");
    expect(combined).toContain("Failure: codex_turn_timeout");
    expect(combined).toContain("inactivity");
    expect(combined).not.toContain(rawResponse);
  });

  test("flush awaits pending Telegram requests", async () => {
    let resolveRequest!: () => void;
    const pending = new Promise<void>(res => { resolveRequest = res; });
    const mockFetch: FetchLike = async () => {
      await pending;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const logger = createTelegramLogger({ botToken: "bot", chatId: "chat", fetchImpl: mockFetch });
    logger.log(makeEntry());

    let flushed = false;
    const flushPromise = logger.flush().then(() => { flushed = true; });

    expect(flushed).toBe(false);
    resolveRequest();
    await flushPromise;
    expect(flushed).toBe(true);
  });

  test("does not throw when Telegram request fails", async () => {
    const mockFetch: FetchLike = async () => { throw new Error("Network error"); };
    const logger = createTelegramLogger({ botToken: "bot", chatId: "chat", fetchImpl: mockFetch });
    logger.log(makeEntry());
    await expect(logger.flush()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// CompositeLogger
// ---------------------------------------------------------------------------

describe("CompositeLogger", () => {
  test("calls log() on every child logger", () => {
    const calls: number[] = [];
    const a = { log: () => calls.push(1), flush: async () => {} };
    const b = { log: () => calls.push(2), flush: async () => {} };
    const composite = createCompositeLogger([a, b]);
    composite.log(makeEntry());
    expect(calls).toEqual([1, 2]);
  });

  test("calls flush() on every child logger and awaits all", async () => {
    const flushed: string[] = [];
    const a = { log: () => {}, flush: async () => { flushed.push("a"); } };
    const b = { log: () => {}, flush: async () => { flushed.push("b"); } };
    const composite = createCompositeLogger([a, b]);
    await composite.flush();
    expect(flushed).toContain("a");
    expect(flushed).toContain("b");
  });

  test("works with an empty logger list", () => {
    const composite = createCompositeLogger([]);
    expect(() => composite.log(makeEntry())).not.toThrow();
    return expect(composite.flush()).resolves.toBeUndefined();
  });

  test("passes the exact same entry to all children", () => {
    const received: IterationLogEntry[] = [];
    const a = { log: (e: IterationLogEntry) => received.push(e), flush: async () => {} };
    const b = { log: (e: IterationLogEntry) => received.push(e), flush: async () => {} };
    const composite = createCompositeLogger([a, b]);
    const entry = makeEntry({ iteration: 99 });
    composite.log(entry);
    expect(received).toHaveLength(2);
    expect(received[0]).toBe(entry);
    expect(received[1]).toBe(entry);
  });
});

// ---------------------------------------------------------------------------
// Reporter sinks
// ---------------------------------------------------------------------------

describe("Reporter sinks", () => {
  test("composite reporter mirrors every message to every sink", async () => {
    const a: string[] = [];
    const b: string[] = [];
    const reporter = createCompositeReporter([
      { log: message => a.push(message) },
      { log: message => b.push(message) }
    ]);

    reporter.log("first");
    reporter.log("second");
    await reporter.flush();

    expect(a).toEqual(["first", "second"]);
    expect(b).toEqual(["first", "second"]);
  });

  test("Telegram reporter sends each console line as a separate ordered message", async () => {
    const sentMessages: string[] = [];
    const mockFetch: FetchLike = async (_url, options) => {
      const body = JSON.parse((options?.body ?? "") as string);
      sentMessages.push(body.text as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const reporter = createTelegramReporter({ botToken: "bot", chatId: "chat", fetchImpl: mockFetch });
    reporter.log("[PHASEDEV RUNNER] iteration 1/1");
    reporter.log("[PHASEDEV RUNNER] running Codex stage with init bootstrap: implementation");
    await reporter.flush();

    expect(sentMessages).toEqual([
      "[PHASEDEV RUNNER] iteration 1/1",
      "[PHASEDEV RUNNER] running Codex stage with init bootstrap: implementation"
    ]);
  });
});
