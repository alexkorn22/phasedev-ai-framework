import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_CONFIG,
  defaultConfigPath,
  getConfigValue,
  getPhaseSkillConfig,
  loadConfig,
  parseConfig,
  projectConfigPath,
  resolveConfigPath,
  resolveProjectLogDir
} from "../src/entities/config/config";
import { initProject } from "../src/features/project-init/init-project";
import type { Config } from "../src/entities/config/config";
import { renderSkillComplianceLine, renderSkillPolicy } from "../src/features/phase-control/skill-policy";
import { setConfigValue } from "../src/features/config-ops/set-config";
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

function captureWarnings(fn: () => void): string[] {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };
  try {
    fn();
  } finally {
    console.warn = origWarn;
  }
  return warnings;
}

// ============================================================================
// parseConfig — all parsing tests
// ============================================================================

describe("parseConfig", () => {
  test("parses phases config with skills", () => {
    const config = parseConfig(`
stages:
  change_intake:
    skills:
      routers: ["using-zuvo"]
      main: ["dev-core"]
      additional: ["security-and-hardening"]
  implementation:
    skills:
      main: ["test-driven-development"]
runArchiveStage: true
autoApprove: false
`);
    expect(config.phases.change_intake).toBeDefined();
    expect(config.phases.change_intake?.skills).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core"],
      additional: ["security-and-hardening"]
    });
    expect(config.phases.implementation?.skills.main).toEqual(["test-driven-development"]);
    expect(config.runArchiveStage).toBe(true);
    expect(config.autoApprove).toBe(false);
  });

  test("provides defaults for runArchiveStage (true) and autoApprove (false)", () => {
    const config = parseConfig(`{}`);
    expect(config.runArchiveStage).toBe(true);
    expect(config.autoApprove).toBe(false);
  });

  test("throws a hard error on unknown stage name naming the bad key and valid phases", () => {
    expect(() =>
      parseConfig(`
stages:
  unknown_stage:
    skills:
      main: ["test"]
`)
    ).toThrow(/unknown_stage/);
    expect(() =>
      parseConfig(`
stages:
  unknown_stage:
    skills:
      main: ["test"]
`)
    ).toThrow(/change_intake/);
  });

  test("throws a hard error on unknown phase name in 'phases:' section", () => {
    expect(() =>
      parseConfig(`
phases:
  unknown_phase:
    skills:
      main: ["test"]
`)
    ).toThrow(/unknown_phase/);
  });

  test("parses empty/missing phases to empty object", () => {
    const config = parseConfig(`{}`);
    expect(config.phases).toEqual({});
  });

  test("parses phases with empty skills", () => {
    const config = parseConfig(`
stages:
  change_intake:
    skills:
      routers: []
      main: []
      additional: []
`);
    expect(config.phases.change_intake?.skills).toEqual({ routers: [], main: [], additional: [] });
    expect(config.phases.implementation).toBeUndefined();
  });

  test("deduplicates stage skills by priority", () => {
    const config = parseConfig(`
stages:
  change_intake:
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
    expect(config.phases.change_intake?.skills).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core"],
      additional: ["test-driven-development"]
    });
  });

  test("getPhaseSkillConfig returns correct skills for a phase", () => {
    const config = parseConfig(`
stages:
  implementation:
    skills:
      routers: ["using-zuvo"]
      main: ["dev-core"]
      additional: ["security-and-hardening"]
`);
    expect(getPhaseSkillConfig(config, "implementation")).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core"],
      additional: ["security-and-hardening"]
    });
  });

  test("getPhaseSkillConfig returns empty for init stage", () => {
    const config = parseConfig(`{}`);
    expect(getPhaseSkillConfig(config, "init")).toEqual({ routers: [], main: [], additional: [] });
  });

  test("getPhaseSkillConfig returns empty for unconfigured phase", () => {
    const config = parseConfig(`
stages:
  implementation:
    skills:
      main: ["dev-core"]
`);
    expect(getPhaseSkillConfig(config, "change_intake")).toEqual({ routers: [], main: [], additional: [] });
  });

  test("canonical 'phases:' key works and parses correctly", () => {
    const config = parseConfig(`
phases:
  change_intake:
    skills:
      routers: ["using-zuvo"]
      main: ["dev-core"]
      additional: ["security-and-hardening"]
  implementation:
    skills:
      main: ["test-driven-development"]
runArchiveStage: false
autoApprove: true
`);
    expect(config.phases.change_intake).toBeDefined();
    expect(config.phases.change_intake?.skills).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core"],
      additional: ["security-and-hardening"]
    });
    expect(config.phases.implementation?.skills.main).toEqual(["test-driven-development"]);
    expect(config.runArchiveStage).toBe(false);
    expect(config.autoApprove).toBe(true);
  });

  test("legacy 'stages:' key emits deprecation warning", () => {
    const warnings = captureWarnings(() => {
      const config = parseConfig(`
stages:
  change_intake:
    skills:
      main: ["dev-core"]
`);
      expect(config.phases.change_intake?.skills.main).toEqual(["dev-core"]);
    });
    expect(warnings.some(w => w.includes("stages:"))).toBe(true);
  });

  test("conflict 'phases:' and 'stages:' resolved with 'phases:' winning", () => {
    const warnings = captureWarnings(() => {
      const config = parseConfig(`
phases:
  change_intake:
    skills:
      main: ["phases-skill"]
stages:
  change_intake:
    skills:
      main: ["stages-skill"]
`);
      expect(config.phases.change_intake?.skills.main).toEqual(["phases-skill"]);
    });
    // Should warn about conflict and that phases: takes precedence
    expect(warnings.some(w => w.includes("both") || w.includes("Both"))).toBe(true);
  });

  test("defaults maxRepairCycles to 3 when absent", () => {
    const config = parseConfig("");
    expect(config.maxRepairCycles).toBe(3);
  });

  test("parses explicit maxRepairCycles", () => {
    const config = parseConfig("maxRepairCycles: 5");
    expect(config.maxRepairCycles).toBe(5);
  });

  test("rejects maxRepairCycles of zero", () => {
    expect(() => parseConfig("maxRepairCycles: 0")).toThrow("must be a positive integer");
  });

  test("rejects non-numeric maxRepairCycles", () => {
    expect(() => parseConfig("maxRepairCycles: abc")).toThrow("must be a positive integer");
  });

  test("parses blockingSeverity values", () => {
    expect(parseConfig(`blockingSeverity: must_fix`).blockingSeverity).toBe("must_fix");
    expect(parseConfig(`blockingSeverity: recommended`).blockingSeverity).toBe("recommended");
    expect(parseConfig(`blockingSeverity: nit`).blockingSeverity).toBe("nit");
  });

  test("defaults blockingSeverity to must_fix when absent", () => {
    expect(parseConfig(`{}`).blockingSeverity).toBe("must_fix");
    expect(DEFAULT_CONFIG.blockingSeverity).toBe("must_fix");
  });

  test("rejects an invalid blockingSeverity", () => {
    expect(() => parseConfig(`blockingSeverity: sometimes`)).toThrow(/blockingSeverity/);
  });

  test("defaults requireIterationCommit to true when absent", () => {
    expect(DEFAULT_CONFIG.requireIterationCommit).toBe(true);
    expect(parseConfig("phases: {}\n").requireIterationCommit).toBe(true);
  });

  test("reads an explicit requireIterationCommit: false", () => {
    expect(parseConfig("requireIterationCommit: false\n").requireIterationCommit).toBe(false);
  });

  test("rejects a non-boolean requireIterationCommit", () => {
    expect(() => parseConfig("requireIterationCommit: yes-please\n")).toThrow(/requireIterationCommit/);
  });
});

// ============================================================================
// loadConfig — loading tests
// ============================================================================

describe("loadConfig", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("loads config from existing path", () => {
    const configPath = writeProjectConfig(testTmpDir, `
stages:
  implementation:
    skills:
      main: ["dev-core"]
`);
    const config = loadConfig(configPath);
    expect(config.phases.implementation?.skills.main).toEqual(["dev-core"]);
    expect(config.runArchiveStage).toBe(true);
    expect(config.autoApprove).toBe(false);
  });

  test("returns DEFAULT_CONFIG when config file does not exist", () => {
    const config = loadConfig("/nonexistent/path/config.yaml");
    expect(config.phases).toEqual({});
    expect(config.runArchiveStage).toBe(true);
    expect(config.autoApprove).toBe(false);
  });
});

// ============================================================================
// resolveConfigPath — path resolution
// ============================================================================

describe("resolveConfigPath", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("resolves explicit config before project config", () => {
    const projectPath = path.join(testTmpDir, "project");
    const explicitConfigPath = path.join(testTmpDir, "explicit-config.yaml");
    writeProjectConfig(projectPath, `
stages:
  implementation:
    skills:
      main: ["project-skill"]
`);
    fs.writeFileSync(explicitConfigPath, `
stages:
  implementation:
    skills:
      main: ["explicit-skill"]
`, "utf-8");

    const resolvedPath = resolveConfigPath(projectPath, explicitConfigPath);
    expect(resolvedPath).toBe(path.resolve(explicitConfigPath));
    expect(loadConfig(resolvedPath).phases.implementation?.skills.main).toEqual(["explicit-skill"]);
  });

  test("resolves project flow config before root default config", () => {
    const projectPath = path.join(testTmpDir, "project");
    writeProjectConfig(projectPath, `
stages:
  implementation:
    skills:
      main: ["project-skill"]
`);

    const resolvedPath = resolveConfigPath(projectPath);
    expect(resolvedPath).toBe(projectConfigPath(projectPath));
    expect(loadConfig(resolvedPath).phases.implementation?.skills.main).toEqual(["project-skill"]);
  });

  test("resolves root default config when project config is missing", () => {
    const projectPath = path.join(testTmpDir, "project-without-config");
    expect(resolveConfigPath(projectPath)).toBe(defaultConfigPath());
  });
});

// ============================================================================
// resolveProjectLogDir — log dir utility
// ============================================================================

describe("resolveProjectLogDir", () => {
  test("resolves logDir under project path", () => {
    const projectPath = path.resolve("/tmp/project");
    expect(resolveProjectLogDir(projectPath, ".phasedev/logs")).toBe(
      path.join(projectPath, ".phasedev", "logs")
    );
  });

  test("rejects logDir outside project path", () => {
    expect(() => resolveProjectLogDir("/tmp/project", "../outside")).toThrow("inside projectPath");
    expect(() => resolveProjectLogDir("/tmp/project", "/tmp/outside")).toThrow(
      "relative to projectPath"
    );
  });
});

// ============================================================================
// getConfigValue — config value access
// ============================================================================

describe("getConfigValue", () => {
  test("gets values from new config shape", () => {
    const config = parseConfig(`
stages:
  change_intake:
    skills:
      main: ["dev-core"]
runArchiveStage: false
autoApprove: true
`);
    expect(getConfigValue(config, "runArchiveStage")).toBe(false);
    expect(getConfigValue(config, "autoApprove")).toBe(true);
  });

  test("maps legacy codex.stages.setup to phases.change_intake", () => {
    const config = parseConfig(`
stages:
  change_intake:
    skills:
      main: ["dev-core"]
`);
    const warnings = captureWarnings(() => {
      const value = getConfigValue(config, "codex.stages.setup.skills.main");
      expect(value).toEqual(["dev-core"]);
    });
    expect(
      warnings.some(w => w.includes("Deprecated") && w.includes("codex.stages.setup"))
    ).toBe(true);
  });

  test("maps legacy stages.plan to phases.iteration_planning", () => {
    const config = parseConfig(`
stages:
  iteration_planning:
    skills:
      main: ["test"]
`);
    const warnings = captureWarnings(() => {
      const value = getConfigValue(config, "stages.plan.skills.main");
      expect(value).toEqual(["test"]);
    });
    expect(
      warnings.some(w => w.includes("Deprecated") && w.includes("stages.plan"))
    ).toBe(true);
  });

  test("returns undefined for removed codex.default.* keys", () => {
    const config = parseConfig(`{}`);
    expect(getConfigValue(config, "codex.default.model")).toBeUndefined();
  });

  test("returns undefined for removed codex.sandboxMode", () => {
    const config = parseConfig(`{}`);
    expect(getConfigValue(config, "codex.sandboxMode")).toBeUndefined();
  });

  test("returns undefined for removed codex.approvalPolicy", () => {
    const config = parseConfig(`{}`);
    expect(getConfigValue(config, "codex.approvalPolicy")).toBeUndefined();
  });

  test("maps legacy loop.runArchiveStage to config.runArchiveStage", () => {
    const config = parseConfig(`runArchiveStage: false`);
    const warnings = captureWarnings(() => {
      expect(getConfigValue(config, "loop.runArchiveStage")).toBe(false);
    });
    expect(warnings.some(w => w.includes("loop.runArchiveStage"))).toBe(true);
  });

  test("maps legacy loop.autoApprove to config.autoApprove", () => {
    const config = parseConfig(`autoApprove: true`);
    const warnings = captureWarnings(() => {
      expect(getConfigValue(config, "loop.autoApprove")).toBe(true);
    });
    expect(warnings.some(w => w.includes("loop.autoApprove"))).toBe(true);
  });

  test("returns undefined for other legacy loop.* keys", () => {
    const config = parseConfig(`{}`);
    const warnings = captureWarnings(() => {
      expect(getConfigValue(config, "loop.maxIterations")).toBe(10);
    });
    expect(
      warnings.some(w => w.includes("Deprecated") && w.includes("loop"))
    ).toBe(true);
  });

  test("returns undefined for malformed key", () => {
    const config = parseConfig(`runArchiveStage: true`);
    expect(getConfigValue(config, "")).toBeUndefined();
  });
});

// ============================================================================
// Legacy migration — codex.stages → phases mapping
// ============================================================================

describe("legacy migration", () => {
  test("parses legacy codex.stages.setup and maps to phases.change_intake", () => {
    const warnings = captureWarnings(() => {
      const config = parseConfig(`
codex:
  default:
    model: claude-sonnet-5
    reasoningEffort: medium
  stages:
    setup:
      skills:
        main: ["test"]
`);
      expect(config.phases).toBeDefined();
      expect(config.phases.change_intake).toBeDefined();
      expect(config.phases.change_intake?.skills.main).toEqual(["test"]);
      expect(config.phases.change_intake?.skills.routers).toEqual([]);
      expect(config.phases.change_intake?.skills.additional).toEqual([]);
      expect(config.runArchiveStage).toBe(true);
      expect(config.autoApprove).toBe(false);
    });
    expect(
      warnings.some(w => w.toLowerCase().includes("deprecat") || w.toLowerCase().includes("legacy"))
    ).toBe(true);
  });

  test("emits per-stage WARNING for legacy model/effort override", () => {
    const warnings = captureWarnings(() => {
      const config = parseConfig(`
codex:
  default:
    model: claude-sonnet-5
    reasoningEffort: medium
  stages:
    setup:
      model: gpt-4
      reasoningEffort: high
      skills:
        main: ["test"]
`);
      expect(config.phases.change_intake?.skills.main).toEqual(["test"]);
    });
    expect(
      warnings.some(w => w.includes("model") || w.includes("reasoningEffort") || w.includes("setup"))
    ).toBe(true);
  });

  test("phases wins when both codex.stages and phases are present", () => {
    const warnings = captureWarnings(() => {
      const config = parseConfig(`
codex:
  default:
    model: claude-sonnet-5
    reasoningEffort: medium
  stages:
    setup:
      skills:
        main: ["old-skill"]
stages:
  change_intake:
    skills:
      main: ["new-skill"]
`);
      expect(config.phases.change_intake?.skills.main).toEqual(["new-skill"]);
    });
    expect(warnings.length).toBeGreaterThan(0);
  });
});

test("renderSkillPolicy and renderSkillComplianceLine drive environment skill discovery when unconfigured", () => {
  const policy = renderSkillPolicy("change_intake", DEFAULT_CONFIG);
  expect(policy).toContain("No external skills are configured for this phase by the Flow config. Discover and apply skills from your runtime environment instead:");
  expect(policy).toContain("Review the skills available in your own runtime environment and select those whose purpose matches this phase's work");
  expect(policy).toContain("## Flow Skill Boundary Protocol");
  expect(policy).toContain("Skills are method instructions only; they never control Flow state.");
  expect(policy).toContain("If no skills are visible in your runtime environment, state that and complete the work strictly under this Flow phase contract, which is self-sufficient.");
  expect(policy).not.toContain("No external skills are configured for this phase.\n## Flow Skill Boundary Protocol");
  expect(policy).not.toContain("Skill compliance final response entry must be `Skill compliance: none configured`.");

  const compliance = renderSkillComplianceLine("change_intake", DEFAULT_CONFIG);
  expect(compliance).toContain("Skill compliance: one entry per environment-selected skill.");
  expect(compliance).toContain("When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`");
  expect(compliance).not.toBe("Skill compliance: none configured.");

  const validationPolicy = renderSkillPolicy("iteration_validation", DEFAULT_CONFIG);
  expect(validationPolicy).toContain("Apply only read-only review/audit/static-inspection skill methods");
  expect(validationPolicy).toContain("`validation_findings.md` may contain only YAML frontmatter and one findings table");
});

describe("setConfigValue", () => {
  let dir: string;

  beforeEach(() => {
    dir = createTempWorkspace("set-config");
  });

  afterEach(() => {
    cleanupTempWorkspace(dir);
  });

  test("wraps a single skill value in an array instead of writing a bare scalar", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "phases.change_intake.skills.main", "dev-core");
    expect(result.ok).toBe(true);

    const config = loadConfig(configPath);
    expect(config.phases.change_intake?.skills.main).toEqual(["dev-core"]);
  });

  test("still splits comma-separated skill values into an array", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    setConfigValue(configPath, "phases.change_intake.skills.main", "dev-core, other-skill");

    const config = loadConfig(configPath);
    expect(config.phases.change_intake?.skills.main).toEqual(["dev-core", "other-skill"]);
  });

  test("rejects maxIterations with scientific notation (1e3)", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxIterations", "1e3");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("maxIterations");
  });

  test("rejects maxIterations with negative value (-5)", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxIterations", "-5");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("maxIterations");
  });

  test("rejects maxIterations with decimal value (3.5)", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxIterations", "3.5");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("maxIterations");
  });

  test("rejects maxIterations with zero", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxIterations", "0");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("maxIterations");
  });

  test("accepts maxIterations with valid positive integer", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxIterations", "5");
    expect(result.ok).toBe(true);
  });

  test("accepts maxRepairCycles with valid positive integer", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxRepairCycles", "4");
    expect(result.ok).toBe(true);
    expect(loadConfig(configPath).maxRepairCycles).toBe(4);
  });

  test("rejects maxRepairCycles with zero", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "maxRepairCycles", "0");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("maxRepairCycles");
  });

  test("rejects runArchiveStage with non-boolean string", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "runArchiveStage", "hello");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("runArchiveStage");
  });

  test("rejects runArchiveStage with number 0", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "runArchiveStage", "0");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("runArchiveStage");
  });

  test("accepts runArchiveStage with boolean true", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "runArchiveStage", "true");
    expect(result.ok).toBe(true);
  });

  test("accepts runArchiveStage with boolean false", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "runArchiveStage", "false");
    expect(result.ok).toBe(true);
  });

  test("rejects autoApprove with non-boolean value", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "autoApprove", "yes");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("autoApprove");
  });

  test("accepts autoApprove with boolean true", () => {
    const configPath = writeProjectConfig(dir, "phases: {}\n");

    const result = setConfigValue(configPath, "autoApprove", "true");
    expect(result.ok).toBe(true);
  });

  test("rejects __proto__ as a path segment and does not pollute Object.prototype", () => {
    const configPath = writeProjectConfig(dir, "maxIterations: 5\n");
    const before = fs.readFileSync(configPath, "utf-8");

    const result = setConfigValue(configPath, "__proto__.polluted", "yes");

    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("__proto__");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(fs.readFileSync(configPath, "utf-8")).toBe(before);
  });

  test("rejects a dangerous segment in the middle of the path", () => {
    const configPath = writeProjectConfig(dir, "maxIterations: 5\n");
    const result = setConfigValue(configPath, "phases.constructor.main", "x");
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("constructor");
  });

  test("rejects prototype as a trailing segment", () => {
    const configPath = writeProjectConfig(dir, "maxIterations: 5\n");
    const result = setConfigValue(configPath, "phases.prototype", "x");
    expect(result.ok).toBe(false);
    expect(result.message.toLowerCase()).toContain("prototype");
  });
});

// initProject creates only the flow config (runner config was removed with the deprecated runner)
test("initProject creates config.yaml", () => {
  const dir = createTempWorkspace("init-config");
  try {
    const result = initProject(dir);
    expect(result.ok).toBe(true);

    const configPath = projectConfigPath(dir);
    expect(fs.existsSync(configPath)).toBe(true);
  } finally {
    cleanupTempWorkspace(dir);
  }
});
