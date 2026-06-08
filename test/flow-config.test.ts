import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  defaultConfigPath,
  getStageModelConfig,
  getStageSkillConfig,
  loadFlowRalphConfig,
  parseFlowRalphConfig,
  projectConfigPath,
  resolveFlowRalphConfigPath,
  resolveProjectLogDir
} from "../src/features/ralph-runner/config";

const testTmpDir = path.resolve(__dirname, "..", "test-config-temp");

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

function writeProjectConfig(projectPath: string, body: string): string {
  const configPath = projectConfigPath(projectPath);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

describe("flow-ralph config", () => {
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("parses config with comments and defaults", () => {
    const config = parseFlowRalphConfig(`
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
    expect(config.loop.logDir).toBe("openspec/flow-ralph");
    expect(config.loop.enableLogs).toBe(true);
    expect(config.loop.notifications.telegram).toEqual({
      enabled: false,
      botTokenEnv: "FLOW_RALPH_TELEGRAM_BOT_TOKEN",
      chatIdEnv: "FLOW_RALPH_TELEGRAM_CHAT_ID"
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

    const resolvedPath = resolveFlowRalphConfigPath(projectPath, explicitConfigPath);

    expect(resolvedPath).toBe(path.resolve(explicitConfigPath));
    expect(loadFlowRalphConfig(resolvedPath).codex.default.model).toBe("explicit-model");
  });

  test("resolves project openspec config before root default config", () => {
    const projectPath = path.join(testTmpDir, "project");
    const projectConfig = writeProjectConfig(projectPath, `
codex:
  default:
    model: project-model
`);

    const resolvedPath = resolveFlowRalphConfigPath(projectPath);

    expect(resolvedPath).toBe(projectConfig);
    expect(loadFlowRalphConfig(resolvedPath).codex.default.model).toBe("project-model");
  });

  test("resolves root default config when project config is missing", () => {
    const projectPath = path.join(testTmpDir, "project-without-config");

    expect(resolveFlowRalphConfigPath(projectPath)).toBe(defaultConfigPath());
  });

  test("parses stage skills without inheriting skills from default", () => {
    const config = parseFlowRalphConfig(`
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
    const config = parseFlowRalphConfig(`
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
    const config = parseFlowRalphConfig(`
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
    const config = parseFlowRalphConfig(`
codex:
  streamAgentOutput: false
`);

    expect(config.codex.streamAgentOutput).toBe(false);
  });

  test("parses enableLogs override", () => {
    const config = parseFlowRalphConfig(`
loop:
  enableLogs: false
`);

    expect(config.loop.enableLogs).toBe(false);
  });

  test("rejects invalid enableLogs type", () => {
    expect(() => parseFlowRalphConfig(`
loop:
  enableLogs: 123
`)).toThrow("loop.enableLogs");
  });

  test("parses telegram notification override", () => {
    const config = parseFlowRalphConfig(`
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
    expect(() => parseFlowRalphConfig(`
loop:
  notifications:
    telegram:
      enabled: yes
`)).toThrow("loop.notifications.telegram.enabled");

    expect(() => parseFlowRalphConfig(`
loop:
  notifications:
    telegram:
      botTokenEnv: ""
`)).toThrow("loop.notifications.telegram.botTokenEnv");
  });

  test("rejects invalid enum values", () => {
    expect(() => parseFlowRalphConfig(`
codex:
  default:
    reasoningEffort: huge
`)).toThrow("codex.default.reasoningEffort");
  });

  test("rejects invalid skill config", () => {
    expect(() => parseFlowRalphConfig(`
codex:
  stages:
    implementation:
      skills:
        main: dev-core
`)).toThrow("codex.stages.implementation.skills.main");

    expect(() => parseFlowRalphConfig(`
codex:
  stages:
    implementation:
      skills:
        additional:
          - ""
`)).toThrow("codex.stages.implementation.skills.additional[0]");
  });

  test("rejects invalid stage keys", () => {
    expect(() => parseFlowRalphConfig(`
codex:
  stages:
    unknown:
      model: gpt-5.4
`)).toThrow("not a valid flow stage");
  });

  test("rejects nonpositive maxIterations", () => {
    expect(() => parseFlowRalphConfig(`
loop:
  maxIterations: 0
`)).toThrow("loop.maxIterations");
  });

  test("resolves logDir under project path", () => {
    const projectPath = path.resolve("/tmp/project");
    expect(resolveProjectLogDir(projectPath, "openspec/flow-ralph")).toBe(path.join(projectPath, "openspec", "flow-ralph"));
  });

  test("rejects logDir outside project path", () => {
    expect(() => resolveProjectLogDir("/tmp/project", "../outside")).toThrow("inside projectPath");
    expect(() => resolveProjectLogDir("/tmp/project", "/tmp/outside")).toThrow("relative to projectPath");
  });
});
