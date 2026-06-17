import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { Prompt, Stage } from "../src/entities/stage/types";
import { runRunnerCli } from "../src/runner";
import { DEFAULT_CONFIG, Config, runRunner } from "../src/features/runner";
import { splitTelegramMessage } from "../src/shared/telegram";
import { createJsonFileLogger } from "../src/features/logger";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

function setupTestDir() {
  testTmpDir = createTempWorkspace("logs");
}

function cleanupTestDir() {
  cleanupTempWorkspace(testTmpDir);
}

function setupProject(): string {
  fs.mkdirSync(path.join(testTmpDir, ".git"), { recursive: true });
  fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "sample-change"), { recursive: true });
  return testTmpDir;
}

function makeConfig(overrides: Partial<Config["loop"]> = {}, codexOverrides: Partial<Config["codex"]> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    codex: {
      ...DEFAULT_CONFIG.codex,
      ...codexOverrides
    },
    loop: {
      ...DEFAULT_CONFIG.loop,
      ...overrides
    }
  };
}

function makeTelegramConfig(overrides: Partial<Config["loop"]> = {}, codexOverrides: Partial<Config["codex"]> = {}): Config {
  return makeConfig({
    ...overrides,
    notifications: {
      telegram: {
        enabled: true,
        botTokenEnv: "TEST_TELEGRAM_BOT_TOKEN",
        chatIdEnv: "TEST_TELEGRAM_CHAT_ID"
      }
    }
  }, codexOverrides);
}

function flowPrompt(command: "init" | "next", stage: Stage, text: string, blocked = false): Prompt {
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

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}
`, "utf-8");
}

function telegramFetchRecorder(messages: string[]): typeof fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    messages.push(String(body.text));
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  };
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>(res => { resolve = res; });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for condition.");
}

function writeApprovedArtifact(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
}

function writeArtifact(filePath: string, body: string, approved: boolean): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved ? "true" : "false"}\napproved_by: ""\n---\n${body}`, "utf-8");
}

function validPrdBody(): string {
  return `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep flow routing grounded in approved requirements. |
| Target state | Exercise the flow controller stage prompt. |
| Risk boundaries | Test fixture only; no production risk. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | Route the flow according to approved artifacts. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | The expected stage prompt is rendered. | review |
`;
}

function validResearchBody(): string {
  return `# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | fix | not_applicable | prd-only | Classification comes from PRD. |
| Why | Keep flow routing grounded in approved requirements. | not_applicable | prd-only | User intent, not repository evidence. |
| Target state | Exercise the flow controller stage prompt. | confirmed | F1 | Code fixture confirms routing. |
| Risk boundaries | Test fixture only; no production risk. | confirmed | F2 | Existing fixture tests cover the boundary. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | none | none |
| SC1 | confirmed | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/features/runner/run-runner.ts:296\` | Ralph recognizes the research stage. | R1 |
| F2 | code | \`test/runner.test.ts:112\` | Ralph fixture uses validated research facts. | SC1 |

## Research Gaps & Blockers

No non-blocking gaps.
`;
}

function validDesignBody(): string {
  return `# Design

## Executive Summary

| Area | Decision |
|---|---|
| Approval scope | Approve the fixture flow routing design. |
| Out of scope | Unrelated product behavior. |
| Key decision | D1 keeps routing grounded in approved artifacts. |
| Validation | Review evidence covers R1 and SC1. |

## Traceability Mapping

| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |
|---|---|---|---|---|
| R1 | F1 | D1 | Route selection uses approved artifacts as the design boundary. | Plan phase implements routing behavior. |
| SC1 | F2 | D1 | Prompt rendering remains the observable success path. | Plan checks verify prompt rendering. |

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point and approval summary for this design package. | approval snapshot, traceability map, decision table | high |

## Key Design Decisions

| Decision ID | Decision | Rationale | Applies To | Impacts |
|---|---|---|---|---|
| D1 | Keep routing driven by approved artifacts. | This preserves the positive PRD contract. | R1, SC1 | flow route, plan decomposition |

## Contracts, Interfaces & Boundaries

| Boundary | Contract | Applies To |
|---|---|---|
| Flow routing | The controller advances only when approved artifacts pass validation. | D1 |

## Risks & Open Questions
None.
`;
}

function implementationPlanReadyForArchive(): string {
  return `---\napproved: true\n---\n# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Exercise the Ralph fixture path. |
| Out of scope | Unrelated product behavior. |
| Sequencing risk | none |
| Validation | Use fixture unit, phase, and full commands. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Exercise the test fixture production path. |
| Tests | yes | Use fixture commands from rules.md. |
| Docs/specs | not_applicable | No documentation behavior is part of this fixture. |
| Migrations | not_applicable | No persistence changes are part of this fixture. |
| Feature flags/rollout | not_applicable | No rollout controls are part of this fixture. |
| Observability | not_applicable | No observability changes are part of this fixture. |
| Rollback path | not_applicable | Revert the fixture change if needed. |

## Phase Overview

| Phase | Goal | Main work items | Required checks |
|---|---|---|---|
| Phase 1 | Complete fixture phase. | 1.1 | unit |

## Phase 1: API [x]
- [x] 1.1 Implement endpoint

### Goal

Complete the fixture phase. Satisfies R1 and SC1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | Fixture implementation area | R1, SC1, D1 |

### Tasks

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | passed unit tests |  |
`;
}

function setupArchiveReadyProject(): string {
  const projectPath = setupProject();
  const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
  writeApprovedArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeApprovedArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeApprovedArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody());
  fs.writeFileSync(path.join(changeDir, "implementation_plan.md"), implementationPlanReadyForArchive(), "utf-8");
  writeValidationFindings(path.join(changeDir, "validation_findings.md"), "ready", "", "final");
  return projectPath;
}

const telegramEnv = {
  TEST_TELEGRAM_BOT_TOKEN: "123:test-token",
  TEST_TELEGRAM_CHAT_ID: "456"
};

function setupUnapprovedSetupProject(): { projectPath: string; changeDir: string } {
  const projectPath = setupProject();
  const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
  writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
  writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`, false);
  return { projectPath, changeDir };
}

function setupUnapprovedDesignProject(): { projectPath: string; changeDir: string } {
  const projectPath = setupProject();
  const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
  writeApprovedArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeApprovedArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), false);
  return { projectPath, changeDir };
}

function setupUnapprovedPlanProject(): { projectPath: string; changeDir: string } {
  const projectPath = setupProject();
  const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
  writeApprovedArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeApprovedArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeApprovedArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody());
  const plan = implementationPlanReadyForArchive()
    .replace("approved: true", "approved: false\napproved_by: \"\"")
    .replace("## Phase 1: API [x]", "## Phase 1: API [ ]")
    .replace("- [x] 1.1 Implement endpoint", "- [ ] 1.1 Implement endpoint")
    .replace("| unit | `bun test unit` | passed | passed unit tests |  |", "| unit | `bun test unit` | pending | not run yet | none |");
  fs.writeFileSync(path.join(changeDir, "implementation_plan.md"), plan, "utf-8");
  return { projectPath, changeDir };
}

describe("logs runner", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("creates a fresh Codex thread for every stage session and sends init bootstrap with next", async () => {
    const projectPath = setupProject();
    const planPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "implementation_plan.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`, "utf-8");
    const threads: Array<{ id: string; prompts: string[] }> = [];
    const messages: string[] = [];
    let stageTurnCount = 0;
    let archived = false;

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 5 }), {
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
                  const archiveDir = path.join(projectPath, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
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
- [x] 1.1 Implement endpoint
`, "utf-8");
                }
              }
              return { finalResponse: `done ${thread.id}` };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", stageTurnCount >= 1 ? "archive" : "implementation", `next prompt ${stageTurnCount + 1}`),
      findActiveChangeDir: () => archived ? null : path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("archived");
    expect(result.iterations).toBe(2);
    expect(threads).toHaveLength(2);
    expect(threads[0].prompts).toHaveLength(1);
    expect(threads[1].prompts).toHaveLength(1);
    expect(threads[0].prompts[0]).toContain("=== FLOW INIT PROMPT START ===\ninit prompt\n=== FLOW INIT PROMPT END ===");
    expect(threads[0].prompts[0]).toContain("next prompt 1");
    expect(threads[0].prompts[0].indexOf("FLOW INIT PROMPT")).toBeLessThan(threads[0].prompts[0].indexOf("FLOW NEXT PROMPT"));
    expect(threads[1].prompts[0]).toContain("=== FLOW INIT PROMPT START ===\ninit prompt\n=== FLOW INIT PROMPT END ===");
    expect(threads[1].prompts[0]).toContain("next prompt 2");
    expect(threads[0].id).not.toBe(threads[1].id);
    expect(result.logPath).toContain(path.join(projectPath, ".phasedev", "logs"));
    expect(messages).toContain("[PHASEDEV RUNNER] stage: implementation");
    expect(messages).toContain("[PHASEDEV RUNNER] model: gpt-5.4");
    expect(messages).toContain("[PHASEDEV RUNNER] reasoning: high");
    expect(messages).not.toContain("[PHASEDEV RUNNER] running phasedev init...");
    expect(messages).not.toContain("[PHASEDEV RUNNER] phasedev init completed");
    expect(messages).not.toContain("[PHASEDEV RUNNER] starting Codex session...");
    expect(messages).toContain("[PHASEDEV RUNNER] running Codex stage with init bootstrap: implementation");
  });

  test("stops on blocked flow prompt without starting Codex", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];
    const logPath = path.join(projectPath, ".phasedev", "logs", "ralph-log.jsonl");
    const jsonLogger = createJsonFileLogger(logPath);
    let createdCodex = false;

    const result = await runRunner(projectPath, makeConfig(), {
      createCodex: () => {
        createdCodex = true;
        return { startThread: () => { throw new Error("should not start"); } };
      },
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "[FLOW CONTROLLER] BLOCKED", true),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(0);
    expect(createdCodex).toBe(false);
    expect(messages).toContain("[PHASEDEV RUNNER] blocked at stage: design");
    const parsed = JSON.parse(fs.readFileSync(logPath, "utf-8").trim());
    expect(parsed.iteration).toBe(0);
    expect(parsed.stage).toBe("design");
    expect(parsed.outcome).toBe("blocked");
    expect(parsed.initPrompt).toBeNull();
    expect(parsed.agentPrompt).toBeNull();
  });

  test("auto-approves valid setup artifacts before running the next agent stage", async () => {
    const { projectPath, changeDir } = setupUnapprovedSetupProject();
    const messages: string[] = [];
    const prompts: string[] = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, autoApprove: true }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-research-after-auto-approve",
          async run(prompt: string) {
            prompts.push(prompt);
            return { finalResponse: "research did not write yet" };
          }
        })
      }),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(result.iterations).toBe(1);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Stage 1. Research.");
    expect(fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8")).toContain("approved: true");
    expect(fs.readFileSync(path.join(changeDir, "rules.md"), "utf-8")).toContain("approved_by: \"PhaseDev Runner\"");
    expect(messages.some(message => message.includes("auto-approved setup artifacts"))).toBe(true);
  });

  test("auto-approves a valid design artifact before planning", async () => {
    const { projectPath, changeDir } = setupUnapprovedDesignProject();
    const prompts: string[] = [];
    const messages: string[] = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, autoApprove: true }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-plan-after-auto-approve",
          async run(prompt: string) {
            prompts.push(prompt);
            return { finalResponse: "plan did not write yet" };
          }
        })
      }),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(result.iterations).toBe(1);
    expect(prompts[0]).toContain("Stage 3. Plan.");
    expect(fs.readFileSync(path.join(changeDir, "architecture", "design.md"), "utf-8")).toContain("approved_by: \"PhaseDev Runner\"");
    expect(messages.some(message => message.includes("auto-approved design artifact"))).toBe(true);
  });

  test("auto-approves a valid implementation plan before implementation", async () => {
    const { projectPath, changeDir } = setupUnapprovedPlanProject();
    const prompts: string[] = [];
    const messages: string[] = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, autoApprove: true }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-implementation-after-auto-approve",
          async run(prompt: string) {
            prompts.push(prompt);
            return { finalResponse: "implementation did not write yet" };
          }
        })
      }),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(result.iterations).toBe(1);
    expect(prompts[0]).toContain("Stage 4. Implementation.");
    expect(fs.readFileSync(path.join(changeDir, "implementation_plan.md"), "utf-8")).toContain("approved_by: \"PhaseDev Runner\"");
    expect(messages.some(message => message.includes("auto-approved plan artifact"))).toBe(true);
  });

  test("does not auto-approve invalid artifacts", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const messages: string[] = [];
    let createdCodex = false;
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody().replace("fix", "invalid-type"), false);
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`, false);

    const result = await runRunner(projectPath, makeConfig({ autoApprove: true }), {
      createCodex: () => {
        createdCodex = true;
        return { startThread: () => { throw new Error("should not start"); } };
      },
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(0);
    expect(createdCodex).toBe(false);
    expect(fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8")).toContain("approved: false");
    expect(messages).toContain("[PHASEDEV RUNNER] blocked at stage: setup");
  });

  test("autoApprove does not bypass unrelated blocked prompts", async () => {
    const projectPath = setupProject();
    let createdCodex = false;

    const result = await runRunner(projectPath, makeConfig({ autoApprove: true }), {
      createCodex: () => {
        createdCodex = true;
        return { startThread: () => { throw new Error("should not start"); } };
      },
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "[FLOW CONTROLLER] BLOCKED", true),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(0);
    expect(createdCodex).toBe(false);
  });

  test("stops before archive_ready when archive execution is disabled", async () => {
    const projectPath = setupArchiveReadyProject();
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const messages: string[] = [];
    let createdCodex = false;
    let requestedNextPrompt = false;

    const result = await runRunner(projectPath, makeConfig({ runArchiveStage: false }), {
      createCodex: () => {
        createdCodex = true;
        return { startThread: () => { throw new Error("should not start"); } };
      },
      getNextPrompt: () => {
        requestedNextPrompt = true;
        throw new Error("should not request archive prompt");
      },
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(0);
    expect(result.reason).toContain("loop.runArchiveStage=false");
    expect(createdCodex).toBe(false);
    expect(requestedNextPrompt).toBe(false);
    expect(messages).toContain("[PHASEDEV RUNNER] blocked at stage: archive");
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, ".phasedev", "changes", "archive"))).toBe(false);
  });

  test("does not resume pending archive when archive execution is disabled", async () => {
    const projectPath = setupProject();
    const archiveDir = path.join(projectPath, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    const messages: string[] = [];
    let createdCodex = false;
    let requestedNextPrompt = false;
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), JSON.stringify({
      status: "in_progress",
      changeName: "sample-change",
      archivePath: archiveDir,
      startedAt: "2026-05-29T10:00:00.000Z"
    }), "utf-8");

    const result = await runRunner(projectPath, makeConfig({ runArchiveStage: false }), {
      createCodex: () => {
        createdCodex = true;
        return { startThread: () => { throw new Error("should not start"); } };
      },
      getNextPrompt: () => {
        requestedNextPrompt = true;
        throw new Error("should not resume archive prompt");
      },
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(0);
    expect(result.reason).toContain("loop.runArchiveStage=false");
    expect(createdCodex).toBe(false);
    expect(requestedNextPrompt).toBe(false);
    expect(messages).toContain("[PHASEDEV RUNNER] blocked at stage: archive");
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
    const seenInitConfigs: Config[] = [];
    const seenNextConfigs: Config[] = [];

    await runRunner(projectPath, config, {
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
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(seenInitConfigs).toEqual([config]);
    expect(seenNextConfigs).toEqual([config]);
  });

  test("stops with no_progress when stage makes no flow state change", async () => {
    const projectPath = setupProject();
    const threads: Array<{ prompts: string[] }> = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2 }), {
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
      getNextPrompt: () => flowPrompt("next", threads.length >= 1 ? "archive" : "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(result.iterations).toBe(1);
    expect(threads).toHaveLength(1);
  });

  test("stops as blocked when implementation records blocked check evidence without advancing", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApprovedArtifact(path.join(changeDir, "prd.md"), validPrdBody());
    writeApprovedArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeApprovedArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody());
    fs.writeFileSync(planPath, `---
approved: true
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Exercise the Ralph fixture path. |
| Out of scope | Unrelated product behavior. |
| Sequencing risk | none |
| Validation | Use fixture unit, phase, and full commands. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Exercise the test fixture production path. |
| Tests | yes | Use fixture commands from rules.md. |
| Docs/specs | not_applicable | No documentation behavior is part of this fixture. |
| Migrations | not_applicable | No persistence changes are part of this fixture. |
| Feature flags/rollout | not_applicable | No rollout controls are part of this fixture. |
| Observability | not_applicable | No observability changes are part of this fixture. |
| Rollback path | not_applicable | Revert the fixture change if needed. |

## Phase Overview

| Phase | Goal | Main work items | Required checks |
|---|---|---|---|
| Phase 1 | Complete fixture phase. | 1.1 | unit |

## Phase 1: API [~]

### Goal

Complete the fixture phase. Satisfies R1 and SC1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | Fixture implementation area | R1, SC1, D1 |

### Tasks

- [ ] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | pending | not run yet | none |
`, "utf-8");

    const messages: string[] = [];
    let calls = 0;
    const result = await runRunner(projectPath, makeConfig({ maxIterations: 5 }), {
      createCodex: () => ({
        startThread: () => ({
          async run() {
            calls++;
            fs.writeFileSync(planPath, fs.readFileSync(planPath, "utf-8").replace(
              "| unit | `bun test unit` | pending | not run yet | none |",
              "| unit | `bun test unit` | blocked | plan surface is invalid | update the approved plan |"
            ), "utf-8");
            return { finalResponse: "blocked by approved plan gap" };
          }
        })
      }),
      reporter: { log: message => messages.push(message) },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.iterations).toBe(1);
    expect(result.reason).toContain("Current implementation phase is blocked by Check Evidence.");
    expect(calls).toBe(1);
    expect(messages).toContain("[PHASEDEV RUNNER] blocked at stage: implementation");
  });

  test("ignores broken symlinks outside flow state when checking progress", async () => {
    const projectPath = setupProject();
    const socketDir = path.join(projectPath, "ops", "environments", "development", "backend", "cache", "mysql", "data");
    fs.mkdirSync(socketDir, { recursive: true });
    fs.symlinkSync("/var/run/mysqld/definitely-missing.sock", path.join(socketDir, "mysql.sock"));

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-broken-symlink",
          async run() {
            return { finalResponse: "no changes" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "design prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
  });

  test("treats streamed implementation file changes outside flow state as progress", async () => {
    const projectPath = setupProject();

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-code-progress",
          async runStreamed(prompt: string) {
            const events = prompt.includes("FLOW NEXT PROMPT")
              ? [
                  { type: "turn.started" },
                  { type: "item.completed", item: { id: "file-code", type: "file_change", changes: [{ path: "src/app.ts", kind: "update" }], status: "completed" } },
                  { type: "item.completed", item: { id: "msg-code", type: "agent_message", text: "updated code" } },
                  { type: "turn.completed" }
                ]
              : [
                  { type: "turn.started" },
                  { type: "item.completed", item: { id: "msg-init", type: "agent_message", text: "init" } },
                  { type: "turn.completed" }
                ];
            return { events: streamEvents(events) };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "implementation prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
  });

  test("blocks streamed code changes during non-code stages", async () => {
    const projectPath = setupProject();

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-design-code-change",
          async runStreamed(prompt: string) {
            const events = prompt.includes("FLOW NEXT PROMPT")
              ? [
                  { type: "turn.started" },
                  { type: "item.completed", item: { id: "file-code", type: "file_change", changes: [{ path: "src/app.ts", kind: "update" }], status: "completed" } },
                  { type: "item.completed", item: { id: "msg-code", type: "agent_message", text: "updated code" } },
                  { type: "turn.completed" }
                ]
              : [
                  { type: "turn.started" },
                  { type: "item.completed", item: { id: "msg-init", type: "agent_message", text: "init" } },
                  { type: "turn.completed" }
                ];
            return { events: streamEvents(events) };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "design prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("src/app.ts");
  });

  test("allows design stage to create linked architecture markdown files", async () => {
    const projectPath = setupProject();
    const linkedDesignPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "architecture", "data-flow.md");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-design-linked-doc",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              fs.mkdirSync(path.dirname(linkedDesignPath), { recursive: true });
              fs.writeFileSync(linkedDesignPath, "# Data Flow\n", "utf-8");
            }
            return { finalResponse: "created linked design doc" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "design prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.reason).not.toContain("Artifact allowlist violation");
    expect(fs.existsSync(linkedDesignPath)).toBe(true);
  });

  test("allows archive stage to update current archive and flow specs", async () => {
    const projectPath = setupProject();
    const archiveDir = path.join(projectPath, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    const deltaSpecPath = path.join(archiveDir, "specs", "flow-routing", "spec.md");
    const mainSpecPath = path.join(projectPath, ".phasedev", "specs", "flow-routing", "spec.md");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-archive-spec-sync",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              fs.mkdirSync(path.dirname(deltaSpecPath), { recursive: true });
              fs.writeFileSync(deltaSpecPath, "## ADDED Requirements\n", "utf-8");
              fs.mkdirSync(path.dirname(mainSpecPath), { recursive: true });
              fs.writeFileSync(mainSpecPath, "## Requirements\n", "utf-8");
              fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), JSON.stringify({
                status: "completed",
                changeName: "sample-change",
                archivePath: archiveDir,
                startedAt: "2026-05-29T10:00:00.000Z",
                completedAt: "2026-05-29T10:10:00.000Z"
              }), "utf-8");
            }
            return { finalResponse: "archive completed" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "archive", "archive prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("archived");
    expect(result.reason).not.toContain("Artifact allowlist violation");
    expect(fs.existsSync(deltaSpecPath)).toBe(true);
    expect(fs.existsSync(mainSpecPath)).toBe(true);
  });

  test("blocks non-archive stages from mutating archived changes", async () => {
    const projectPath = setupProject();
    const archiveFilePath = path.join(projectPath, ".phasedev", "changes", "archive", "2026-05-29-old-change", "notes.md");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-design-archive-mutation",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              fs.mkdirSync(path.dirname(archiveFilePath), { recursive: true });
              fs.writeFileSync(archiveFilePath, "mutated archive history\n", "utf-8");
            }
            return { finalResponse: "updated archive history" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "design prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain(".phasedev/changes/archive/2026-05-29-old-change/notes.md");
    expect(result.reason).toContain("outside allowlist");
  });

  test("blocks nested architecture files during design stage", async () => {
    const projectPath = setupProject();
    const nestedDesignPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "architecture", "nested", "data-flow.md");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-design-nested-doc",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              fs.mkdirSync(path.dirname(nestedDesignPath), { recursive: true });
              fs.writeFileSync(nestedDesignPath, "# Nested Data Flow\n", "utf-8");
            }
            return { finalResponse: "created nested design doc" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "design", "design prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("architecture/nested");
    expect(result.reason).toContain("outside allowlist");
  });

  test("blocks streamed file changes outside the project path", async () => {
    const projectPath = setupProject();
    const outsidePath = path.resolve(projectPath, "..", "outside.ts");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-outside-project-change",
          async runStreamed(prompt: string) {
            const events = prompt.includes("FLOW NEXT PROMPT")
              ? [
                  { type: "turn.started" },
                  { type: "item.completed", item: { id: "file-outside", type: "file_change", changes: [{ path: outsidePath, kind: "update" }], status: "completed" } },
                  { type: "item.completed", item: { id: "msg-outside", type: "agent_message", text: "updated outside project" } },
                  { type: "turn.completed" }
                ]
              : [
                  { type: "turn.started" },
                  { type: "item.completed", item: { id: "msg-init", type: "agent_message", text: "init" } },
                  { type: "turn.completed" }
                ];
            return { events: streamEvents(events) };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "implementation prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain("outside project path");
  });

  test("runs real repair route when archive execution is disabled", async () => {
    const projectPath = setupArchiveReadyProject();
    const findingsPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "validation_findings.md");
    writeValidationFindings(
      findingsPath,
      "repair_required",
      "| F1 | open | MUST-FIX | implementation | Phase 1 | Broken layout. | Fix layout. |"
    );
    let ranRepair = false;

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, runArchiveStage: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-repair",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              ranRepair = true;
              fs.writeFileSync(findingsPath, "repaired\n", "utf-8");
            }
            return { finalResponse: "repair completed" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(ranRepair).toBe(true);
    expect(result.reason).not.toContain("Artifact allowlist violation");
  });

  test("allows repair stage to update linked architecture markdown files", async () => {
    const projectPath = setupProject();
    const linkedDesignPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "architecture", "runtime-layout.md");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, runArchiveStage: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-repair-linked-design",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              fs.mkdirSync(path.dirname(linkedDesignPath), { recursive: true });
              fs.writeFileSync(linkedDesignPath, "# Runtime Layout\n\nUpdated repair detail.\n", "utf-8");
            }
            return { finalResponse: "updated linked design doc" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "repair", "repair prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.reason).not.toContain("Artifact allowlist violation");
    expect(fs.existsSync(linkedDesignPath)).toBe(true);
  });

  test("blocks repair stage from updating project flow config", async () => {
    const projectPath = setupProject();
    const configPath = path.join(projectPath, ".phasedev", "config.yaml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "loop:\n  maxIterations: 10\n", "utf-8");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, runArchiveStage: false }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-repair-config",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              fs.writeFileSync(configPath, "loop:\n  maxIterations: 10\n  runArchiveStage: false\n", "utf-8");
            }
            return { finalResponse: "incorrectly updated project flow config" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "repair", "repair prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toContain(".phasedev/config.yaml");
    expect(result.reason).toContain("outside allowlist");
  });

  test("stops at maxIterations", async () => {
    const projectPath = setupProject();
    const progressPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "implementation_plan.md");
    let promptCounter = 0;
    const threads: unknown[] = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2 }), {
      createCodex: () => ({
        startThread: () => {
          threads.push({});
          return {
            id: `thread-${threads.length}`,
            async run(prompt: string) {
              if (prompt.includes("FLOW NEXT PROMPT")) {
                fs.writeFileSync(progressPath, `iteration ${threads.length}\n`, "utf-8");
              }
              return { finalResponse: "done" };
            }
          };
        }
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", `next prompt ${++promptCounter}`),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(2);
    expect(threads).toHaveLength(2);
  });

  test("writes only formatted ralph-log.jsonl under project log directory", async () => {
    const projectPath = setupProject();
    const logDir = path.join(projectPath, ".phasedev", "logs");
    const logPath = path.join(logDir, "ralph-log.jsonl");
    const jsonLogger = createJsonFileLogger(logPath);
    let sentPrompt = "";

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-1",
          async run(prompt: string) {
            sentPrompt = prompt;
            return { finalResponse: "done" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "same next prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(fs.existsSync(result.logPath)).toBe(true);
    expect(result.logPath).toBe(logPath);
    const logContent = fs.readFileSync(result.logPath, "utf-8").trim();
    const parsed = JSON.parse(logContent);
    expect(parsed.iteration).toBe(1);
    expect(parsed.stage).toBe("implementation");
    expect(parsed.initPrompt).toBe("init prompt");
    expect(parsed.agentPrompt).toBe(sentPrompt);
    expect(parsed.agentPrompt).toContain("=== FLOW INIT PROMPT START ===\ninit prompt\n=== FLOW INIT PROMPT END ===");
    expect(parsed.agentPrompt).toContain("=== FLOW NEXT PROMPT START ===\nsame next prompt\n=== FLOW NEXT PROMPT END ===");
    expect(parsed.agentResponse).toBe("done");
  });

  test("streams Codex events to reporter and logs finalResponse from agent message", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];
    const logDir = path.join(projectPath, ".phasedev", "logs");
    const logPath = path.join(logDir, "ralph-log.jsonl");
    const jsonLogger = createJsonFileLogger(logPath);
    let sentPrompt = "";

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-stream",
          async runStreamed(prompt: string) {
            sentPrompt = prompt;
            const isStageTurn = prompt.includes("FLOW NEXT PROMPT");
            return {
              events: streamEvents([
                { type: "thread.started", thread_id: "thread-stream" },
                { type: "turn.started" },
                { type: "item.completed", item: { id: "reasoning-1", type: "reasoning", text: "checking flow state" } },
                { type: "item.completed", item: { id: "cmd-1", type: "command_execution", command: "bun test", aggregated_output: "tests passed", exit_code: 0, status: "completed" } },
                { type: "item.completed", item: { id: "file-1", type: "file_change", changes: [{ path: ".phasedev/changes/sample-change/implementation_plan.md", kind: "update" }], status: "completed" } },
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
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(messages).toContain("[CODEX implementation] thread.started: thread-stream");
    expect(messages).toContain("[CODEX implementation] reasoning: checking flow state");
    expect(messages).toContain("[CODEX implementation] command: bun test");
    expect(messages).toContain("[CODEX implementation] command output:\ntests passed");
    expect(messages).toContain("[CODEX implementation] file_change: completed update .phasedev/changes/sample-change/implementation_plan.md");
    expect(messages).toContain("[CODEX implementation] mcp_tool_call: server/tool completed");
    expect(messages).toContain("[CODEX implementation] web_search: query");
    expect(messages).toContain("[CODEX implementation] todo_list:\n- [x] Validate");
    expect(messages).toContain("[CODEX implementation] agent_message:\nstage streamed response");
    expect(messages).toContain("[CODEX implementation] turn.completed usage: input=10, cached=2, output=3, reasoning=4");

    const logContent = fs.readFileSync(result.logPath, "utf-8").trim();
    const parsed = JSON.parse(logContent);
    expect(parsed.initPrompt).toBe("init prompt");
    expect(parsed.agentPrompt).toBe(sentPrompt);
    expect(parsed.agentResponse).toBe("stage streamed response");
  });

  test("can disable Codex stream output and fall back to buffered run", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];
    const prompts: string[] = [];
    const logDir = path.join(projectPath, ".phasedev", "logs");
    const logPath = path.join(logDir, "ralph-log.jsonl");
    const jsonLogger = createJsonFileLogger(logPath);

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }, { streamAgentOutput: false }), {
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
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: message => messages.push(message) },
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("=== FLOW INIT PROMPT START ===\ninit prompt\n=== FLOW INIT PROMPT END ===");
    expect(prompts[0]).toContain("same next prompt");
    expect(messages.some(message => message.startsWith("[CODEX "))).toBe(false);

    const logContent = fs.readFileSync(result.logPath, "utf-8").trim();
    const parsed = JSON.parse(logContent);
    expect(parsed.initPrompt).toBe("init prompt");
    expect(parsed.agentPrompt).toBe(prompts[0]);
    expect(parsed.agentResponse).toBe("buffered stage response");
  });

  test("throws when streamed Codex turn fails", async () => {
    const projectPath = setupProject();

    await expect(runRunner(projectPath, makeConfig(), {
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
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    })).rejects.toThrow("model failed");
  });

  test("uses per-stage model and reasoning overrides", async () => {
    const projectPath = setupProject();
    const options: unknown[] = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1 }, {
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
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(options).toContainEqual(expect.objectContaining({
      model: "gpt-5.3-codex",
      modelReasoningEffort: "medium"
    }));
  });

  test("continues when plan state changes even if stage and prompt are the same", async () => {
    const projectPath = setupProject();
    const planPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "implementation_plan.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`, "utf-8");
    let archived = false;
    let nextPromptCount = 0;
    const threads: unknown[] = [];

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 5 }), {
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
- [x] 1.1 Implement endpoint
`, "utf-8");
                } else {
                  archived = true;
                  const archiveDir = path.join(projectPath, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
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
      getNextPrompt: () => flowPrompt("next", nextPromptCount++ >= 1 ? "archive" : "implementation", "same next prompt"),
      findActiveChangeDir: () => archived ? null : path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("archived");
    expect(threads).toHaveLength(2);
  });

  test("continues when validation reopens a blocking finding resolved by the prior repair", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |");

    const logPath = path.join(projectPath, ".phasedev", "logs", "ralph-log.jsonl");
    const jsonLogger = createJsonFileLogger(logPath);

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-repeat",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("repair prompt")) {
              writeValidationFindings(findingsPath, "repaired", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |");
            }
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("validation prompt")) {
              writeValidationFindings(findingsPath, "repair_required", "| F9 | reopened | MUST-FIX | implementation | Phase 1 | API response omits required error handling!!! | Restore the error mapping fix. |");
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
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-30T10:00:00.000Z")
    });

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(2);
    expect(result.reason).toBe("Reached loop.maxIterations.");
    expect(fs.readFileSync(result.logPath, "utf-8")).toContain("done");
  });

  test("continues when final validation reopens a blocking finding resolved by the prior repair", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | open | MUST-FIX | implementation | Final | API response omits required error handling. | Add error mapping. |", "final");

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2 }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-final-repeat",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("repair prompt")) {
              writeValidationFindings(findingsPath, "repaired", "| F1 | resolved | MUST-FIX | implementation | Final | API response omits required error handling. | Keep the error mapping fix. |", "final");
            }
            if (prompt.includes("FLOW NEXT PROMPT") && prompt.includes("final validation prompt")) {
              writeValidationFindings(findingsPath, "repair_required", "| F1 | reopened | MUST-FIX | implementation | Final | API response omits required error handling. | Restore the error mapping fix. |", "final");
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

    expect(result.status).toBe("max_iterations");
    expect(result.iterations).toBe(2);
    expect(result.reason).toBe("Reached loop.maxIterations.");
  });

  test("continues when validation reports a different blocking finding after repair", async () => {
    const projectPath = setupProject();
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |");

    let stageTurns = 0;
    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2 }), {
      createCodex: () => ({
        startThread: () => ({
          id: `thread-${stageTurns + 1}`,
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              stageTurns++;
              if (stageTurns === 1) {
                writeValidationFindings(findingsPath, "repaired", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |");
              } else {
                writeValidationFindings(findingsPath, "repair_required", "| F2 | open | MUST-FIX | implementation | Phase 1 | API response lacks pagination guard. | Add pagination guard. |");
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
    const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
    const planPath = path.join(changeDir, "implementation_plan.md");
    const findingsPath = path.join(changeDir, "validation_findings.md");
    fs.writeFileSync(planPath, `
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, "utf-8");
    writeValidationFindings(findingsPath, "repair_required", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |");

    let stageTurns = 0;
    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2 }), {
      createCodex: () => ({
        startThread: () => ({
          id: `thread-${stageTurns + 1}`,
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              stageTurns++;
              if (stageTurns === 1) {
                writeValidationFindings(findingsPath, "repaired", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |");
              } else {
                writeValidationFindings(findingsPath, "repair_required", "| F9 | reopened | RECOMMENDED | implementation | Phase 1 | API response omits required error handling. | Track as follow-up. |");
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

  test("writes formatted agent response logs when enableLogs is true", async () => {
    const projectPath = setupProject();
    const progressPath = path.join(projectPath, ".phasedev", "changes", "sample-change", "implementation_plan.md");
    let stageCounter = 0;
    const logDir = path.join(projectPath, ".phasedev", "logs");
    const logPath = path.join(logDir, "ralph-log.jsonl");
    const jsonLogger = createJsonFileLogger(logPath);

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 2, enableLogs: true }), {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-log-test",
          async run(prompt: string) {
            if (prompt.includes("FLOW NEXT PROMPT")) {
              stageCounter++;
              fs.writeFileSync(progressPath, `iteration ${stageCounter}\n`, "utf-8");
              return { finalResponse: `Agent response for iteration ${stageCounter}` };
            }

            return { finalResponse: "Init response" };
          }
        })
      }),
      getInitPrompt: () => flowPrompt("init", "init", "init prompt"),
      getNextPrompt: () => flowPrompt("next", "implementation", "next prompt"),
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(fs.existsSync(result.logPath)).toBe(true);

    const logLines = fs.readFileSync(result.logPath, "utf-8").trim().split("\n");
    expect(logLines).toHaveLength(2);

    const parsed1 = JSON.parse(logLines[0]);
    const parsed2 = JSON.parse(logLines[1]);

    expect(parsed1.iteration).toBe(1);
    expect(parsed1.stage).toBe("implementation");
    expect(parsed1.initPrompt).toBe("init prompt");
    expect(parsed1.agentPrompt).toContain("=== FLOW NEXT PROMPT START ===\nnext prompt\n=== FLOW NEXT PROMPT END ===");
    expect(parsed2.iteration).toBe(2);
    expect(parsed2.initPrompt).toBe("init prompt");
    expect(parsed2.agentPrompt).toContain("=== FLOW NEXT PROMPT START ===\nnext prompt\n=== FLOW NEXT PROMPT END ===");
    expect(parsed2.agentResponse).toBe("Agent response for iteration 2");
  });

  test("CLI does not create JSON log when enableLogs is false", async () => {
    const projectPath = setupProject();
    const configPath = path.join(testTmpDir, "no-json-log-config.yaml");
    const logDir = path.join(projectPath, ".phasedev", "logs");
    const logPath = path.join(logDir, "ralph-log.jsonl");

    fs.writeFileSync(configPath, `
loop:
  maxIterations: 1
  enableLogs: false
  notifications:
    telegram:
      enabled: false
codex:
  streamAgentOutput: false
`, "utf-8");

    await runRunnerCli(["--project-path", projectPath, "--config", configPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-no-log",
          async run() {
            return { finalResponse: "No log saved" };
          }
        })
      }),
      reporter: { log: () => undefined }
    });

    expect(fs.existsSync(logPath)).toBe(false);
  });

  test("handles file system log write errors gracefully without crashing the loop", async () => {
    const projectPath = setupProject();
    const messages: string[] = [];

    const logDir = path.join(projectPath, ".phasedev", "logs");
    const conflictPath = path.join(logDir, "ralph-log.jsonl");
    fs.mkdirSync(conflictPath, { recursive: true });
    const jsonLogger = createJsonFileLogger(conflictPath, { log: msg => messages.push(msg) });

    const result = await runRunner(projectPath, makeConfig({ maxIterations: 1, enableLogs: true }), {
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
      findActiveChangeDir: () => path.join(projectPath, ".phasedev", "changes", "sample-change"),
      reporter: { log: () => undefined },
      iterationLogger: jsonLogger,
      now: () => new Date("2026-05-29T10:00:00.000Z")
    });

    expect(result.status).toBe("no_progress");
    expect(messages.some(msg => msg.includes("Failed to write to ralph-log.jsonl"))).toBe(true);
  });

  test("does not crash or send Telegram requests when Telegram env vars are missing", async () => {
    const projectPath = setupProject();
    const reporterMessages: string[] = [];
    let fetchCount = 0;

    const result = await runRunnerCli(["--project-path", projectPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-missing-env",
          async run() {
            return { finalResponse: "done" };
          }
        })
      }),
      reporter: { log: message => reporterMessages.push(message) },
      env: {
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_CHAT_ID: undefined
      },
      fetchImpl: async () => {
        fetchCount++;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
    });

    expect(result.status).toBe("no_progress");
    expect(fetchCount).toBe(0);
    expect(reporterMessages.some(message => message.includes("Telegram notifications disabled: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"))).toBe(true);
  });

  test("continues when Telegram API sends fail and does not recursively notify the failure", async () => {
    const projectPath = setupProject();
    const configPath = path.join(testTmpDir, "telegram-failure-config.yaml");
    const reporterMessages: string[] = [];
    let fetchCount = 0;

    fs.writeFileSync(configPath, `
loop:
  maxIterations: 1
  notifications:
    telegram:
      enabled: true
      botTokenEnv: TEST_TELEGRAM_BOT_TOKEN
      chatIdEnv: TEST_TELEGRAM_CHAT_ID
codex:
  streamAgentOutput: false
`, "utf-8");

    const result = await runRunnerCli(["--project-path", projectPath, "--config", configPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-telegram-failure",
          async run() {
            return { finalResponse: "done" };
          }
        })
      }),
      env: telegramEnv,
      reporter: { log: message => reporterMessages.push(message) },
      fetchImpl: async () => {
        fetchCount++;
        return new Response("bad gateway", { status: 502 });
      }
    });

    const failureMessages = reporterMessages.filter(message => message.includes("Failed to send Telegram notification"));
    const mirroredMessages = reporterMessages.filter(message => !message.includes("Failed to send Telegram notification"));
    expect(result.status).toBe("no_progress");
    expect(fetchCount).toBeGreaterThan(0);
    expect(fetchCount).toBe(mirroredMessages.length);
    expect(failureMessages.length).toBeGreaterThan(0);
  });

  test("splits long Telegram messages below the Telegram sendMessage limit", () => {
    const chunks = splitTelegramMessage("x".repeat(8200));

    expect(chunks.length).toBe(3);
    expect(chunks.every(chunk => chunk.length <= 3900)).toBe(true);
    expect(chunks.join("")).toBe("x".repeat(8200));
  });

  test("flow:ralph CLI mirrors console output to Telegram", async () => {
    const projectPath = setupProject();
    const configPath = path.join(testTmpDir, "ralph-config.yaml");
    const reporterMessages: string[] = [];
    const telegramMessages: string[] = [];

    fs.writeFileSync(configPath, `
loop:
  maxIterations: 1
  notifications:
    telegram:
      enabled: true
      botTokenEnv: TEST_TELEGRAM_BOT_TOKEN
      chatIdEnv: TEST_TELEGRAM_CHAT_ID
codex:
  streamAgentOutput: false
`, "utf-8");

    await runRunnerCli(["--project-path", projectPath, "--config", configPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-cli",
          async run() {
            return { finalResponse: "done" };
          }
        })
      }),
      reporter: { log: message => reporterMessages.push(message) },
      env: telegramEnv,
      fetchImpl: telegramFetchRecorder(telegramMessages)
    });

    expect(reporterMessages).toContain("[PHASEDEV RUNNER] status: no_progress");
    expect(reporterMessages).toContain("[PHASEDEV RUNNER] iterations: 1");
    expect(telegramMessages).toEqual(reporterMessages);
  });

  test("flow:ralph CLI sends Telegram messages while the stage is still running", async () => {
    const projectPath = setupProject();
    const configPath = path.join(testTmpDir, "live-telegram-config.yaml");
    const telegramMessages: string[] = [];
    const releaseStage = createDeferred();

    fs.writeFileSync(configPath, `
loop:
  maxIterations: 1
  notifications:
    telegram:
      enabled: true
      botTokenEnv: TEST_TELEGRAM_BOT_TOKEN
      chatIdEnv: TEST_TELEGRAM_CHAT_ID
codex:
  streamAgentOutput: false
`, "utf-8");

    const runPromise = runRunnerCli(["--project-path", projectPath, "--config", configPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-live-telegram",
          async run() {
            await releaseStage.promise;
            return { finalResponse: "done" };
          }
        })
      }),
      reporter: { log: () => undefined },
      env: telegramEnv,
      fetchImpl: telegramFetchRecorder(telegramMessages)
    });

    await waitFor(() => telegramMessages.some(message => message.startsWith("[PHASEDEV RUNNER] running Codex stage with init bootstrap: ")));
    expect(telegramMessages).toContain("[PHASEDEV RUNNER] iteration 1/1");
    expect(telegramMessages).not.toContain("[PHASEDEV RUNNER] status: no_progress");

    releaseStage.resolve();
    await runPromise;

    expect(telegramMessages).toContain("[PHASEDEV RUNNER] status: no_progress");
  });

  test("flow:ralph CLI sends Telegram notifications when JSON logs are disabled", async () => {
    const projectPath = setupProject();
    const configPath = path.join(testTmpDir, "telegram-without-json-config.yaml");
    const logPath = path.join(projectPath, ".phasedev", "logs", "ralph-log.jsonl");
    const telegramMessages: string[] = [];

    fs.writeFileSync(configPath, `
loop:
  maxIterations: 1
  enableLogs: false
  notifications:
    telegram:
      enabled: true
      botTokenEnv: TEST_TELEGRAM_BOT_TOKEN
      chatIdEnv: TEST_TELEGRAM_CHAT_ID
codex:
  streamAgentOutput: false
`, "utf-8");

    await runRunnerCli(["--project-path", projectPath, "--config", configPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-telegram-no-json",
          async run() {
            return { finalResponse: "done" };
          }
        })
      }),
      reporter: { log: () => undefined },
      env: telegramEnv,
      fetchImpl: telegramFetchRecorder(telegramMessages)
    });

    expect(fs.existsSync(logPath)).toBe(false);
    expect(telegramMessages).toContain("[PHASEDEV RUNNER] iteration 1/1");
    expect(telegramMessages).toContain("[PHASEDEV RUNNER] status: no_progress");
  });

  test("flow:ralph CLI uses project flow config without --config", async () => {
    const projectPath = setupProject();
    const projectConfigPath = path.join(projectPath, ".phasedev", "config.yaml");
    const envPath = path.join(projectPath, ".phasedev", ".env");
    const reporterMessages: string[] = [];
    const telegramMessages: string[] = [];

    fs.writeFileSync(projectConfigPath, `
loop:
  maxIterations: 1
  notifications:
    telegram:
      enabled: true
codex:
  streamAgentOutput: false
`, "utf-8");
    fs.writeFileSync(envPath, `
TELEGRAM_BOT_TOKEN=123:from-project-env-file
TELEGRAM_CHAT_ID=789
`, "utf-8");

    await runRunnerCli(["--project-path", projectPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-project-config",
          async run() {
            return { finalResponse: "done from project config" };
          }
        })
      }),
      reporter: { log: message => reporterMessages.push(message) },
      env: {},
      fetchImpl: telegramFetchRecorder(telegramMessages)
    });

    expect(reporterMessages).toContain("[PHASEDEV RUNNER] iteration 1/1");
    expect(telegramMessages).toEqual(reporterMessages);
  });

  test("flow:ralph CLI loads Telegram credentials from .env next to config", async () => {
    const projectPath = setupProject();
    const configPath = path.join(testTmpDir, "ralph-config.yaml");
    const envPath = path.join(testTmpDir, ".env");
    const telegramMessages: string[] = [];

    fs.writeFileSync(configPath, `
loop:
  maxIterations: 1
  notifications:
    telegram:
      enabled: true
codex:
  streamAgentOutput: false
`, "utf-8");
    fs.writeFileSync(envPath, `
TELEGRAM_BOT_TOKEN=123:from-env-file
TELEGRAM_CHAT_ID=789
`, "utf-8");

    await runRunnerCli(["--project-path", projectPath, "--config", configPath], {
      createCodex: () => ({
        startThread: () => ({
          id: "thread-cli-env-file",
          async run() {
            return { finalResponse: "done from env file" };
          }
        })
      }),
      reporter: { log: () => undefined },
      env: {},
      fetchImpl: telegramFetchRecorder(telegramMessages)
    });

    expect(telegramMessages).toContain("[PHASEDEV RUNNER] iteration 1/1");
    expect(telegramMessages).toContain("[PHASEDEV RUNNER] status: no_progress");
  });
});
