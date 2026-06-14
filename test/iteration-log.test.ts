import { describe, test, expect } from "bun:test";
import { formatIterationSummary } from "../src/entities/iteration-log";
import type { IterationLogEntry } from "../src/entities/iteration-log";

function makeEntry(overrides: Partial<IterationLogEntry> = {}): IterationLogEntry {
  return {
    timestamp: "2026-05-29T10:00:00.000Z",
    iteration: 1,
    stage: "implementation",
    model: "gpt-5.5",
    reasoningEffort: "medium",
    activeChange: ".phasedev/changes/sample-change",
    durationMs: 45000,
    usage: {
      inputTokens: 1500,
      cachedInputTokens: 200,
      outputTokens: 800,
      reasoningOutputTokens: 300
    },
    changedFiles: {
      added: ["src/new-file.ts"],
      modified: ["src/existing.ts"],
      deleted: []
    },
    flowStateChanged: true,
    allowlistViolations: [],
    outcome: "completed",
    agentResponse: "Stage done.",
    ...overrides
  };
}

describe("formatIterationSummary", () => {
  test("contains iteration number and stage", () => {
    const summary = formatIterationSummary(makeEntry());
    expect(summary).toContain("1");
    expect(summary).toContain("implementation");
  });

  test("contains model and reasoning effort", () => {
    const summary = formatIterationSummary(makeEntry());
    expect(summary).toContain("gpt-5.5");
    expect(summary).toContain("medium");
  });

  test("contains duration in seconds", () => {
    const summary = formatIterationSummary(makeEntry({ durationMs: 45000 }));
    expect(summary).toContain("45s");
  });

  test("contains token counts", () => {
    const summary = formatIterationSummary(makeEntry());
    expect(summary).toContain("1500");
    expect(summary).toContain("800");
  });

  test("contains file change counts", () => {
    const summary = formatIterationSummary(makeEntry());
    expect(summary).toContain("+1");
    expect(summary).toContain("~1");
    expect(summary).toContain("-0");
  });

  test("contains outcome", () => {
    const summary = formatIterationSummary(makeEntry({ outcome: "completed" }));
    expect(summary).toContain("completed");
  });

  test("handles null usage gracefully", () => {
    const summary = formatIterationSummary(makeEntry({ usage: null }));
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });

  test("handles empty changedFiles gracefully", () => {
    const summary = formatIterationSummary(makeEntry({
      changedFiles: { added: [], modified: [], deleted: [] }
    }));
    expect(summary).toContain("+0");
    expect(summary).toContain("~0");
    expect(summary).toContain("-0");
  });

  test("handles blocked outcome", () => {
    const summary = formatIterationSummary(makeEntry({ outcome: "blocked" }));
    expect(summary).toContain("blocked");
  });

  test("handles null activeChange", () => {
    const summary = formatIterationSummary(makeEntry({ activeChange: null }));
    expect(typeof summary).toBe("string");
  });
});
