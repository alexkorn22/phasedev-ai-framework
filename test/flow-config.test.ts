import { describe, test, expect } from "bun:test";
import * as path from "path";
import { getStageModelConfig, getStageSkillConfig, parseFlowRalphConfig, resolveProjectLogDir } from "../src/features/ralph-runner/config";

describe("flow-ralph config", () => {
  test("parses config with comments and defaults", () => {
    const config = parseFlowRalphConfig(`
codex:
  default:
    model: gpt-5.4-mini # варианты описаны в config.yaml
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
    expect(getStageModelConfig(config, "archive")).toEqual({ model: "gpt-5.4-mini", reasoningEffort: "low" });
    expect(getStageModelConfig(config, "implementation")).toEqual({ model: "gpt-5.4-mini", reasoningEffort: "medium" });
    expect(getStageSkillConfig(config, "archive")).toEqual({ routers: [], main: [], additional: [] });
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
