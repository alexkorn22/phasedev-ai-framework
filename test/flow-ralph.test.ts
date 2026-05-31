import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { FlowPrompt, FlowStage } from "../src/entities/flow-stage/types";
import { DEFAULT_FLOW_RALPH_CONFIG, FlowRalphConfig, runFlowRalph } from "../src/features/ralph-runner";

const testTmpDir = path.resolve(__dirname, "..", "test-ralph-temp");

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

function setupProject(): string {
  fs.mkdirSync(path.join(testTmpDir, ".git"), { recursive: true });
  fs.mkdirSync(path.join(testTmpDir, "openspec", "changes", "sample-change"), { recursive: true });
  return testTmpDir;
}

function makeConfig(overrides: Partial<FlowRalphConfig["loop"]> = {}, codexOverrides: Partial<FlowRalphConfig["codex"]> = {}): FlowRalphConfig {
  return {
    ...DEFAULT_FLOW_RALPH_CONFIG,
    codex: {
      ...DEFAULT_FLOW_RALPH_CONFIG.codex,
      ...codexOverrides
    },
    loop: {
      ...DEFAULT_FLOW_RALPH_CONFIG.loop,
      ...overrides
    }
  };
}

function flowPrompt(command: "init" | "next", stage: FlowStage, text: string, blocked = false): FlowPrompt {
  return { command, stage, prompt: text, blocked, reason: blocked ? "blocked" : undefined };
}

async function* streamEvents(events: unknown[]): AsyncGenerator<unknown> {
  for (const event of events) {
    yield event;
  }
}

function writeValidationFindings(filePath: string, verdict: "repair_required" | "repaired", rows: string, type: "phase" | "final" = "phase"): void {
  fs.writeFileSync(filePath, `---
verdict: ${verdict}
type: ${type}
date: 2026-05-30
---

| ID | Signal | Status | Class | Blocks PR? | Phase | Description |
|---|---|---|---|---|---|---|
${rows}
`, "utf-8");
}

describe("flow-ralph runner", () => {
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("creates a fresh Codex thread for every stage session and sends init then next", async () => {
    const projectPath = setupProject();
    const planPath = path.join(projectPath, "openspec", "changes", "sample-change", "implementation_plan.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [ ] Implement endpoint
`, "utf-8");
    const threads: Array<{ id: string; prompts: string[] }> = [];
    const messages: string[] = [];
    let stageTurnCount = 0;
    let archived = false;

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 5 }), {
      createCodex: () => ({
        startThread: () => {
          const thread = { id: `thread-${threads.length + 1}`, prompts: [] as string[] };
          threads.push(thread);
          return {
            id: thread.id,
            async run(prompt: string) {
              thread.prompts.push(prompt);
              if (prompt.includes("FLOW NEXT PROMPT")) {
                stageTurnCount++;
                if (stageTurnCount === 2) {
                  archived = true;
                  const archiveDir = path.join(projectPath, "openspec", "changes", "archive", "2026-05-29-sample-change");
                  fs.mkdirSync(archiveDir, { recursive: true });
                  fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), JSON.stringify({
                    status: "completed",
                    changeName: "sample-change",
                    archivePath: archiveDir,
                    startedAt: "2026-05-29T10:00:00.000Z",
                    completedAt: "2026-05-29T10:00:00.000Z"
                  }), "utf-8");
                } else {
                  fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, "utf-8");
                }
              }
              return { finalResponse: `done ${thread.id}` };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", `next prompt ${stageTurnCount + 1}`),
      findActiveChangeDir: () => archived ? null : path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("archived");
    expect(result.iterations).toBe(2);
    expect(threads).toHaveLength(2);
    expect(threads[0].prompts[0]).toBe("init prompt");
    expect(threads[0].prompts[1]).toContain("next prompt 1");
    expect(threads[1].prompts[0]).toBe("init prompt");
    expect(threads[1].prompts[1]).toContain("next prompt 2");
    expect(threads[0].id).not.toBe(threads[1].id);
    expect(result.logPath).toContain(path.join(projectPath, "openspec", "flow-ralph"));
    expect(messages).toContain("[FLOW RALPH] stage: implementation");
    expect(messages).toContain("[FLOW RALPH] model: gpt-5.4");
    expect(messages).toContain("[FLOW RALPH] reasoning: high");
    expect(messages).toContain("[FLOW RALPH] running flow init...");
    expect(messages).toContain("[FLOW RALPH] flow init completed");
    expect(messages).toContain("[FLOW RALPH] running stage: implementation");
  });

  test("stops on blocked flow prompt without starting Codex", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];
    let createdCodex = false;

    const result = await runFlowRalph(projectPath, makeConfig(), {
      createCodex: () => {
        createdCodex = true;
        return { startThread: () => { throw new Error("should not start"); } };
      },
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "[FLOW CONTROLLER] BLOCKED", true),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(0);
    expect(createdCodex).toBe(false);
    expect(messages).toContain("[FLOW RALPH] blocked at stage: design");
  });

  test("passes loaded config into init and next prompt builders", async () => {
    const projectPath = setupProject();
    const config = makeConfig({ maxIterations: 1 }, {
      stages: {
        implementation: {
          model: "gpt-5.4",
          reasoningEffort: "high",
          skills: {
            routers: [],
            main: ["dev-core"],
            additional: []
          }
        }
      }
    });
    const seenInitConfigs: FlowRalphConfig[] = [];
    const seenNextConfigs: FlowRalphConfig[] = [];

    await runFlowRalph(projectPath, config, {
      createCodex: () => ({
        startThread: () => ({
          async run() {
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: (_projectPath, promptConfig) => {
        if (promptConfig) seenInitConfigs.push(promptConfig);
        return flowPrompt("init", "init", "init prompt");
      },
      getNextPrompt: (_projectPath, promptConfig) => {
        if (promptConfig) seenNextConfigs.push(promptConfig);
        return flowPrompt("next", "implementation", "same next prompt");
      },
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(seenInitConfigs).toEqual([config]);
    expect(seenNextConfigs).toEqual([config, config]);
  });

  test("stops on no progress after one stage session", async () => {
    const projectPath = setupProject();
    const threads: Array<{ prompts: string[] }> = [];

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 5 }), {
      createCodex: () => ({
        startThread: () => {
          const thread = { prompts: [] as string[] };
          threads.push(thread);
          return {
            id: `thread-${threads.length}`,
            async run(prompt: string) {
              thread.prompts.push(prompt);
              return { finalResponse: "no changes" };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(result.iterations).toBe(1);
    expect(threads).toHaveLength(1);
  });

  test("stops at maxIterations", async () => {
    const projectPath = setupProject();
    let promptCounter = 0;
    const threads: unknown[] = [];

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 2, stopOnNoProgress: false }), {
      createCodex: () => ({
        startThread: () => {
          threads.push({});
          return {
            id: `thread-${threads.length}`,
            async run() {
              return { finalResponse: "done" };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", `next prompt ${++promptCounter}`),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(2);
    expect(threads).toHaveLength(2);
  });

  test("writes per-stage JSONL logs under project openspec flow-ralph directory", async () => {
    const projectPath = setupProject();

    const result = await runFlowRalph(projectPath, makeConfig(), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-1",
          async run() {
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(fs.existsSync(result.logPath)).toBe(true);
    const logLine = fs.readFileSync(result.logPath, "utf-8").trim();
    expect(logLine).toContain('"threadId":"thread-1"');
    expect(logLine).toContain('"stage":"implementation"');
    expect(logLine).toContain('"beforeSnapshot"');
    expect(result.logPath).toContain(path.join(projectPath, "openspec", "flow-ralph"));
  });

  test("streams Codex events to reporter and logs finalResponse from agent message", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];

    const result = await runFlowRalph(projectPath, makeConfig(), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-stream",
          async runStreamed(prompt: string) {
            const isStageTurn = prompt.includes("FLOW NEXT PROMPT");
            return {
              events: streamEvents([
                { type: "thread.started", thread_id: "thread-stream" },
                { type: "turn.started" },
                { type: "item.completed", item: { id: "reasoning-1", type: "reasoning", text: "checking flow state" } },
                { type: "item.completed", item: { id: "cmd-1", type: "command_execution", command: "bun test", aggregated_output: "tests passed", exit_code: 0, status: "completed" } },
                { type: "item.completed", item: { id: "file-1", type: "file_change", changes: [{ path: "openspec/changes/sample-change/validation_findings.md", kind: "update" }], status: "completed" } },
                { type: "item.completed", item: { id: "tool-1", type: "mcp_tool_call", server: "server", tool: "tool", arguments: { ok: true }, result: { content: [], structured_content: { done: true } }, status: "completed" } },
                { type: "item.completed", item: { id: "search-1", type: "web_search", query: "query" } },
                { type: "item.completed", item: { id: "todo-1", type: "todo_list", items: [{ text: "Validate", completed: true }] } },
                { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: isStageTurn ? "stage streamed response" : "init streamed response" } },
                { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3, reasoning_output_tokens: 4 } }
              ])
            };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(messages).toContain("[CODEX flow init] thread.started: thread-stream");
    expect(messages).toContain("[CODEX flow init] reasoning: checking flow state");
    expect(messages).toContain("[CODEX flow init] command: bun test");
    expect(messages).toContain("[CODEX flow init] command output:\ntests passed");
    expect(messages).toContain("[CODEX flow init] file_change: completed update openspec/changes/sample-change/validation_findings.md");
    expect(messages).toContain("[CODEX flow init] mcp_tool_call: server/tool completed");
    expect(messages).toContain("[CODEX flow init] web_search: query");
    expect(messages).toContain("[CODEX flow init] todo_list:\n- [x] Validate");
    expect(messages).toContain("[CODEX implementation] agent_message:\nstage streamed response");
    expect(messages).toContain("[CODEX implementation] turn.completed usage: input=10, cached=2, output=3, reasoning=4");

    const logLine = fs.readFileSync(result.logPath, "utf-8").trim();
    expect(logLine).toContain('"finalResponse":"stage streamed response"');
  });

  test("can disable Codex stream output and fall back to buffered run", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];
    const prompts: string[] = [];

    const result = await runFlowRalph(projectPath, makeConfig({}, { streamAgentOutput: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-buffered",
          async run(prompt: string) {
            prompts.push(prompt);
            return { finalResponse: prompt.includes("FLOW NEXT PROMPT") ? "buffered stage response" : "buffered init response" };
          },
          async runStreamed() {
            throw new Error("stream should be disabled");
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(prompts).toHaveLength(2);
    expect(messages.some(message => message.startsWith("[CODEX "))).toBe(false);

    const logLine = fs.readFileSync(result.logPath, "utf-8").trim();
    expect(logLine).toContain('"finalResponse":"buffered stage response"');
  });

  test("throws when streamed Codex turn fails", async () => {
    const projectPath = setupProject();

    await expect(runFlowRalph(projectPath, makeConfig(), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-failed",
          async runStreamed() {
            return {
              events: streamEvents([
                { type: "turn.started" },
                { type: "turn.failed", error: { message: "model failed" } }
              ])
            };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    })).rejects.toThrow("model failed");
  });

  test("uses per-stage model and reasoning overrides", async () => {
    const projectPath = setupProject();
    const options: unknown[] = [];

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 1, stopOnNoProgress: false }, {
      stages: {
        implementation: { model: "gpt-5.3-codex", reasoningEffort: "medium" }
      }
    }), {
      createCodex: () => ({
        startThread: threadOptions => {
          options.push(threadOptions);
          return {
            id: "thread-1",
            async run() {
              return { finalResponse: "done" };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(options).toContainEqual(expect.objectContaining({
      model: "gpt-5.3-codex",
      modelReasoningEffort: "medium"
    }));
  });

  test("continues when plan state changes even if stage and prompt are the same", async () => {
    const projectPath = setupProject();
    const planPath = path.join(projectPath, "openspec", "changes", "sample-change", "implementation_plan.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [ ] Implement endpoint
`, "utf-8");
    let archived = false;
    const threads: unknown[] = [];

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 5 }), {
      createCodex: () => ({
        startThread: () => {
          threads.push({});
          return {
            id: `thread-${threads.length}`,
            async run(prompt: string) {
              if (prompt.includes("FLOW NEXT PROMPT")) {
                if (threads.length === 1) {
                  fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, "utf-8");
                } else {
                  archived = true;
                  const archiveDir = path.join(projectPath, "openspec", "changes", "archive", "2026-05-29-sample-change");
                  fs.mkdirSync(archiveDir, { recursive: true });
                  fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), JSON.stringify({
                    status: "completed",
                    changeName: "sample-change",
                    archivePath: archiveDir,
                    startedAt: "2026-05-29T10:00:00.000Z",
                    completedAt: "2026-05-29T10:00:00.000Z"
                  }), "utf-8");
                }
              }
              return { finalResponse: "done" };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => archived ? null : path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("archived");
    expect(threads).toHaveLength(2);
  });

  test("blocks when validation reopens a blocking finding resolved by the prior repair", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, "openspec", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | 🔴 | open | implementation | Yes | Phase 1 | API response omits required error handling. |");

    const messages: string[] = [];
    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 5, stopOnNoProgress: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-repeat",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("repair prompt")) {
              writeValidationFindings(findingsPath, "repaired", "| F1 | 🟢 | resolved | implementation | Yes | Phase 1 | API response omits required error handling. |");
            }
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("validation prompt")) {
              writeValidationFindings(findingsPath, "repair_required", "| F9 | 🔴 | reopened | implementation | Yes | Phase 1 | API response omits required error handling!!! |");
            }
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => {
        const content = fs.readFileSync(findingsPath, "utf-8");
        return content.includes("verdict: repair_required")
          ? flowPrompt("next", "repair", "repair prompt")
          : flowPrompt("next", "phase_validation", "validation prompt");
      },
      findActiveChangeDir: () => changeDir,
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-30T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(2);
    expect(result.reason).toBe("Repeated validation finding after repair: phase|phase 1|implementation|api response omits required error handling");
    expect(messages).toContain("[FLOW RALPH] blocked at stage: phase_validation");
    const logLines = fs.readFileSync(result.logPath, "utf-8").trim().split("\n");
    expect(logLines[1]).toContain('"status":"blocked"');
    expect(logLines[1]).toContain("Repeated validation finding after repair");
  });

  test("blocks when final validation reopens a blocking finding resolved by the prior repair", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, "openspec", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [x]
- [x] Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | 🔴 | open | implementation | Yes | Final | API response omits required error handling. |", "final");

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 5, stopOnNoProgress: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-final-repeat",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("repair prompt")) {
              writeValidationFindings(findingsPath, "repaired", "| F1 | 🟢 | resolved | implementation | Yes | Final | API response omits required error handling. |", "final");
            }
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("final validation prompt")) {
              writeValidationFindings(findingsPath, "repair_required", "| F1 | 🔴 | reopened | implementation | Yes | Final | API response omits required error handling. |", "final");
            }
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => {
        const content = fs.readFileSync(findingsPath, "utf-8");
        return content.includes("verdict: repair_required")
          ? flowPrompt("next", "repair", "repair prompt")
          : flowPrompt("next", "final_validation", "final validation prompt");
      },
      findActiveChangeDir: () => changeDir,
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-30T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(2);
    expect(result.reason).toBe("Repeated validation finding after repair: final|final|implementation|api response omits required error handling");
  });

  test("continues when validation reports a different blocking finding after repair", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, "openspec", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | 🔴 | open | implementation | Yes | Phase 1 | API response omits required error handling. |");

    let stageTurns = 0;
    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 2, stopOnNoProgress: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: `thread-${stageTurns + 1}`,
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              stageTurns++;
              if (stageTurns === 1) {
                writeValidationFindings(findingsPath, "repaired", "| F1 | 🟢 | resolved | implementation | Yes | Phase 1 | API response omits required error handling. |");
              } else {
                writeValidationFindings(findingsPath, "repair_required", "| F2 | 🔴 | open | implementation | Yes | Phase 1 | API response lacks pagination guard. |");
              }
            }
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => {
        const content = fs.readFileSync(findingsPath, "utf-8");
        return content.includes("verdict: repair_required")
          ? flowPrompt("next", "repair", "repair prompt")
          : flowPrompt("next", "phase_validation", "validation prompt");
      },
      findActiveChangeDir: () => changeDir,
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-30T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(2);
  });

  test("does not block when repeated finding is non-blocking", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, "openspec", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | 🔴 | open | implementation | Yes | Phase 1 | API response omits required error handling. |");

    let stageTurns = 0;
    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 2, stopOnNoProgress: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: `thread-${stageTurns + 1}`,
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              stageTurns++;
              if (stageTurns === 1) {
                writeValidationFindings(findingsPath, "repaired", "| F1 | 🟢 | resolved | implementation | Yes | Phase 1 | API response omits required error handling. |");
              } else {
                writeValidationFindings(findingsPath, "repair_required", "| F9 | 🟡 | reopened | implementation | No | Phase 1 | API response omits required error handling. |");
              }
            }
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => {
        const content = fs.readFileSync(findingsPath, "utf-8");
        return content.includes("verdict: repair_required")
          ? flowPrompt("next", "repair", "repair prompt")
          : flowPrompt("next", "phase_validation", "validation prompt");
      },
      findActiveChangeDir: () => changeDir,
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-30T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(2);
  });

  test("writes formatted agent response logs and supports prepending when enableLogs is true", async () => {
    const projectPath = setupProject();
    let promptCounter = 0;

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 2, stopOnNoProgress: false, enableLogs: true }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-log-test",
          async run() {
            promptCounter++;
            return { finalResponse: `Agent response for iteration ${promptCounter}` };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    const mdLogPath = path.join(projectPath, "openspec", "flow-ralph", "log.md");
    expect(fs.existsSync(mdLogPath)).toBe(true);

    const logContent = fs.readFileSync(mdLogPath, "utf-8");

    const testDate = new Date("2026-05-29T10:00:00.000Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    const expectedTime = `${pad(testDate.getHours())}:${pad(testDate.getMinutes())}:${pad(testDate.getSeconds())} ${pad(testDate.getDate())}.${pad(testDate.getMonth() + 1)}.${testDate.getFullYear()}`;

    expect(logContent).toContain(`## [${expectedTime}] Iteration: 2 | Stage: implementation`);
    expect(logContent).toContain("Agent response for iteration 2");
    
    const indexIter1 = logContent.indexOf("Iteration: 1");
    const indexIter2 = logContent.indexOf("Iteration: 2");
    expect(indexIter2).toBeLessThan(indexIter1);
  });

  test("does not write log.md when enableLogs is false", async () => {
    const projectPath = setupProject();

    await runFlowRalph(projectPath, makeConfig({ maxIterations: 1, stopOnNoProgress: false, enableLogs: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-no-log",
          async run() {
            return { finalResponse: "No log saved" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    const mdLogPath = path.join(projectPath, "openspec", "flow-ralph", "log.md");
    expect(fs.existsSync(mdLogPath)).toBe(false);
  });

  test("handles file system log write errors gracefully without crashing the loop", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];

    const logDir = path.join(projectPath, "openspec", "flow-ralph");
    const conflictPath = path.join(logDir, "log.md");
    fs.mkdirSync(conflictPath, { recursive: true });

    const result = await runFlowRalph(projectPath, makeConfig({ maxIterations: 1, stopOnNoProgress: false, enableLogs: true }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-fs-error",
          async run() {
            return { finalResponse: "Response that triggers FS error" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "next prompt"),
      findActiveChangeDir: () => path.join(projectPath, "openspec", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(messages.some(msg => msg.includes("Failed to write to log.md"))).toBe(true);
  });
});
