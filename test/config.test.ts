import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  defaultConfigPath,
  getStageModelConfig,
  getStageSkillConfig,
  loadConfig,
  parseConfig,
  projectConfigPath,
  resolveConfigPath,
  resolveProjectLogDir
} from "../src/features/runner/config";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

function setupTestDir() {
  testTmpDir = createTempWorkspace("flow-config");
}

function cleanupTestDir() {
  cleanupTempWorkspace(testTmpDir);
}

function writeProjectConfig(projectPath: string, body: string): string {
  const configPath = projectConfigPath(projectPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

describe("logs config", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("parses config with comments and defaults", () => {
    const config = parseConfig(`
codex:
  default:
    model: gpt-5.4-mini # variants are documented in config.yaml
    reasoningEffort: medium
  stages:
    archive:
      reasoningEffort: low

loop:
  maxIterations: 3
`);

    expect(config.codex.default.model).toBe("gpt-5.4-mini");
    expect(config.codex.default.reasoningEffort).toBe("medium");
    expect(config.codex.sandboxMode).toBe("workspace-write");
    expect(config.codex.approvalPolicy).toBe("never");
    expect(config.codex.streamAgentOutput).toBe(true);
    expect(config.loop.maxIterations).toBe(3);
    expect(config.loop.logDir).toBe(".phasedev/logs");
    expect(config.loop.enableLogs).toBe(true);
    expect(config.loop.runArchiveStage).toBe(true);
    expect(config.loop.autoApprove).toBe(false);
    expect(config.loop.notifications.telegram).toEqual({
      enabled: false,
      botTokenEnv: "TELEGRAM_BOT_TOKEN",
      chatIdEnv: "TELEGRAM_CHAT_ID"
    });
    expect(getStageModelConfig(config, "archive")).toEqual({ model: "gpt-5.4-mini", reasoningEffort: "low" });
    expect(getStageModelConfig(config, "implementation")).toEqual({ model: "gpt-5.4-mini", reasoningEffort: "medium" });
    expect(getStageSkillConfig(config, "archive")).toEqual({ routers: [], main: [], additional: [] });
  });

  test("resolves explicit config before project config", () => {
    const projectPath = path.join(testTmpDir, "project");
    const explicitConfigPath = path.join(testTmpDir, "explicit-config.yaml");
    writeProjectConfig(projectPath, `
codex:
  default:
    model: project-model
`);
    fs.writeFileSync(explicitConfigPath, `
codex:
  default:
    model: explicit-model
`, "utf-8");

    const resolvedPath = resolveConfigPath(projectPath, explicitConfigPath);

    expect(resolvedPath).toBe(path.resolve(explicitConfigPath));
    expect(loadConfig(resolvedPath).codex.default.model).toBe("explicit-model");
  });

  test("resolves project flow config before root default config", () => {
    const projectPath = path.join(testTmpDir, "project");
    const projectConfig = writeProjectConfig(projectPath, `
codex:
  default:
    model: project-model
`);

    const resolvedPath = resolveConfigPath(projectPath);

    expect(resolvedPath).toBe(projectConfig);
    expect(loadConfig(resolvedPath).codex.default.model).toBe("project-model");
  });

  test("resolves root default config when project config is missing", () => {
    const projectPath = path.join(testTmpDir, "project-without-config");

    expect(resolveConfigPath(projectPath)).toBe(defaultConfigPath());
  });

  test("parses stage skills without inheriting skills from default", () => {
    const config = parseConfig(`
codex:
  default:
    model: gpt-5.4-mini
    reasoningEffort: medium
  stages:
    implementation:
      skills:
        routers:
          - using-zuvo
        main:
          - dev-core
          - test-driven-development
        additional:
          - api-and-interface-design
          - security-and-hardening
    archive:
      model: gpt-5.4
`);

    expect(getStageSkillConfig(config, "implementation")).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core", "test-driven-development"],
      additional: ["api-and-interface-design", "security-and-hardening"]
    });
    expect(getStageSkillConfig(config, "archive")).toEqual({ routers: [], main: [], additional: [] });
  });

  test("allows stages with only main and additional skills", () => {
    const config = parseConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - dev-core
        additional:
          - frontend-ui-engineering
`);

    expect(getStageSkillConfig(config, "implementation")).toEqual({
      routers: [],
      main: ["dev-core"],
      additional: ["frontend-ui-engineering"]
    });
  });

  test("deduplicates stage skills by priority", () => {
    const config = parseConfig(`
codex:
  stages:
    implementation:
      skills:
        routers:
          - using-zuvo
          - using-zuvo
        main:
          - using-zuvo
          - dev-core
          - dev-core
        additional:
          - dev-core
          - test-driven-development
          - test-driven-development
`);

    expect(getStageSkillConfig(config, "implementation")).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core"],
      additional: ["test-driven-development"]
    });
  });

  test("parses streamAgentOutput override", () => {
    const config = parseConfig(`
codex:
  streamAgentOutput: false
`);

    expect(config.codex.streamAgentOutput).toBe(false);
  });

  test("parses enableLogs override", () => {
    const config = parseConfig(`
loop:
  enableLogs: false
`);

    expect(config.loop.enableLogs).toBe(false);
  });

  test("parses runArchiveStage override", () => {
    const config = parseConfig(`
loop:
  runArchiveStage: false
`);

    expect(config.loop.runArchiveStage).toBe(false);
  });

  test("parses autoApprove override", () => {
    const config = parseConfig(`
loop:
  autoApprove: true
`);

    expect(config.loop.autoApprove).toBe(true);
  });

  test("rejects invalid enableLogs type", () => {
    expect(() => parseConfig(`
loop:
  enableLogs: 123
`)).toThrow("loop.enableLogs");
  });

  test("rejects invalid runArchiveStage type", () => {
    expect(() => parseConfig(`
loop:
  runArchiveStage: 123
`)).toThrow("loop.runArchiveStage");
  });

  test("rejects invalid autoApprove type", () => {
    expect(() => parseConfig(`
loop:
  autoApprove: yes
`)).toThrow("loop.autoApprove");
  });

  test("parses telegram notification override", () => {
    const config = parseConfig(`
loop:
  notifications:
    telegram:
      enabled: true
      botTokenEnv: CUSTOM_BOT_TOKEN
      chatIdEnv: CUSTOM_CHAT_ID
`);

    expect(config.loop.notifications.telegram).toEqual({
      enabled: true,
      botTokenEnv: "CUSTOM_BOT_TOKEN",
      chatIdEnv: "CUSTOM_CHAT_ID"
    });
  });

  test("rejects invalid telegram notification config", () => {
    expect(() => parseConfig(`
loop:
  notifications:
    telegram:
      enabled: yes
`)).toThrow("loop.notifications.telegram.enabled");

    expect(() => parseConfig(`
loop:
  notifications:
    telegram:
      botTokenEnv: ""
`)).toThrow("loop.notifications.telegram.botTokenEnv");
  });

  test("rejects invalid enum values", () => {
    expect(() => parseConfig(`
codex:
  default:
    reasoningEffort: huge
`)).toThrow("codex.default.reasoningEffort");
  });

  test("rejects invalid skill config", () => {
    expect(() => parseConfig(`
codex:
  stages:
    implementation:
      skills:
        main: dev-core
`)).toThrow("codex.stages.implementation.skills.main");

    expect(() => parseConfig(`
codex:
  stages:
    implementation:
      skills:
        additional:
          - ""
`)).toThrow("codex.stages.implementation.skills.additional[0]");
  });

  test("rejects invalid stage keys", () => {
    expect(() => parseConfig(`
codex:
  stages:
    unknown:
      model: gpt-5.4
`)).toThrow("not a valid flow stage");
  });

  test("rejects nonpositive maxIterations", () => {
    expect(() => parseConfig(`
loop:
  maxIterations: 0
`)).toThrow("loop.maxIterations");
  });

  test("resolves logDir under project path", () => {
    const projectPath = path.resolve("/tmp/project");
    expect(resolveProjectLogDir(projectPath, ".phasedev/logs")).toBe(path.join(projectPath, ".phasedev", "logs"));
  });

  test("rejects logDir outside project path", () => {
    expect(() => resolveProjectLogDir("/tmp/project", "../outside")).toThrow("inside projectPath");
    expect(() => resolveProjectLogDir("/tmp/project", "/tmp/outside")).toThrow("relative to projectPath");
  });
});
