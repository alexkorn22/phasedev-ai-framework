import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
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
  resolveConfigPath
} from "../src/entities/config/config";
import { initProject } from "../src/features/project-init/init-project";
import { renderSkillComplianceLine, renderSkillPolicy } from "../src/features/phase-control/skill-policy";
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
// parseConfig — 4-key contract
// ============================================================================

describe("parseConfig", () => {
  test("recognizes exactly the 4 keys with defaults", () => {
    const c = parseConfig("");
    expect(c.autoApprove).toBe(false);
    expect(c.blockingSeverity).toBe("must_fix");
    expect(c.requireIterationCommit).toBe(true);
    expect(c.phases).toEqual({});
    expect((c as unknown as Record<string, unknown>).runArchiveStage).toBeUndefined();
    expect((c as unknown as Record<string, unknown>).maxIterations).toBeUndefined();
  });

  test("removed root keys warn once and are ignored", () => {
    const warnings: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((m: string) => warnings.push(m));
    parseConfig("runArchiveStage: false\nmaxIterations: 5\nmaxRepairCycles: 9\n");
    spy.mockRestore();
    expect(warnings.some(w => w.includes('"runArchiveStage"'))).toBe(true);
    expect(warnings.some(w => w.includes('"maxIterations"'))).toBe(true);
    expect(warnings.some(w => w.includes('"maxRepairCycles"'))).toBe(true);
  });

  test("legacy stages:/codex.stages: keys warn and are ignored (no parsing)", () => {
    const warnings: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((m: string) => warnings.push(m));
    const c = parseConfig("stages:\n  plan:\n    skills:\n      main: [tdd]\ncodex:\n  stages: {}\n");
    spy.mockRestore();
    expect(c.phases).toEqual({});
    expect(warnings.some(w => w.includes('"stages"'))).toBe(true);
    expect(warnings.some(w => w.includes('"codex"'))).toBe(true);
  });

  test("unknown phase name warns and is skipped, flow not blocked", () => {
    const warnings: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((m: string) => warnings.push(m));
    const c = parseConfig("phases:\n  not_a_phase:\n    skills:\n      main: [x]\n  implementation:\n    skills:\n      main: [tdd]\n");
    spy.mockRestore();
    expect(c.phases.implementation?.skills.main).toEqual(["tdd"]);
    expect(c.phases).not.toHaveProperty("not_a_phase");
    expect(warnings.some(w => w.includes("not_a_phase"))).toBe(true);
  });

  test("rejects quick_* phase names under phases: (warn+skip, not a hard error)", () => {
    const warnings: string[] = [];
    const spy = spyOn(console, "warn").mockImplementation((m: string) => warnings.push(m));
    const c = parseConfig("phases:\n  quick_plan:\n    skills:\n      main: [foo]\n");
    spy.mockRestore();
    expect(c.phases).not.toHaveProperty("quick_plan");
    expect(warnings.some(w => w.includes('quick_plan'))).toBe(true);
  });

  test("parses empty/missing phases to empty object", () => {
    const config = parseConfig(`{}`);
    expect(config.phases).toEqual({});
  });

  test("parses phases with empty skills", () => {
    const config = parseConfig(`
phases:
  change_intake:
    skills:
      routers: []
      main: []
      additional: []
`);
    expect(config.phases.change_intake?.skills).toEqual({ routers: [], main: [], additional: [] });
    expect(config.phases.implementation).toBeUndefined();
  });

  test("deduplicates phase skills by priority", () => {
    const config = parseConfig(`
phases:
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
phases:
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
phases:
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
autoApprove: true
`);
    expect(config.phases.change_intake).toBeDefined();
    expect(config.phases.change_intake?.skills).toEqual({
      routers: ["using-zuvo"],
      main: ["dev-core"],
      additional: ["security-and-hardening"]
    });
    expect(config.phases.implementation?.skills.main).toEqual(["test-driven-development"]);
    expect(config.autoApprove).toBe(true);
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
phases:
  implementation:
    skills:
      main: ["dev-core"]
`);
    const config = loadConfig(configPath);
    expect(config.phases.implementation?.skills.main).toEqual(["dev-core"]);
    expect(config.autoApprove).toBe(false);
  });

  test("returns DEFAULT_CONFIG when config file does not exist", () => {
    const config = loadConfig("/nonexistent/path/config.yaml");
    expect(config.phases).toEqual({});
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
phases:
  implementation:
    skills:
      main: ["project-skill"]
`);
    fs.writeFileSync(explicitConfigPath, `
phases:
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
phases:
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
// getConfigValue — plain deep-get, no legacy mapping
// ============================================================================

describe("getConfigValue", () => {
  test("gets values from the 4-key config shape", () => {
    const config = parseConfig(`
phases:
  change_intake:
    skills:
      main: ["dev-core"]
autoApprove: true
`);
    expect(getConfigValue(config, "autoApprove")).toBe(true);
    expect(getConfigValue(config, "phases.change_intake.skills.main")).toEqual(["dev-core"]);
  });

  test("has no loop.*/stages.*/codex.stages.* mapping", () => {
    const c = parseConfig("autoApprove: true\n");
    expect(getConfigValue(c, "autoApprove")).toBe(true);
    expect(getConfigValue(c, "loop.autoApprove")).toBeUndefined();
    expect(getConfigValue(c, "stages.plan.skills.main")).toBeUndefined();
  });

  test("returns undefined for nonexistent key", () => {
    const config = parseConfig(`{}`);
    expect(getConfigValue(config, "nonexistent.key")).toBeUndefined();
  });

  test("returns undefined for malformed key", () => {
    const config = parseConfig(`autoApprove: true`);
    expect(getConfigValue(config, "")).toBeUndefined();
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
