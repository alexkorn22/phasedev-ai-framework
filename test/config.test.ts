import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_CONFIG,
  defaultConfigPath,
  getConfigValue,
  loadConfig,
  parseConfig,
  projectConfigPath,
  resolveConfigPath
} from "../src/entities/config/config";
import { initProject } from "../src/features/project-init/init-project";
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

// ============================================================================
// parseConfig — 4-key contract
// ============================================================================

describe("parseConfig", () => {
  test("recognizes exactly the 4 keys with defaults", () => {
    const c = parseConfig("");
    expect(c.autoApprove).toBe(false);
    expect(c.blockingSeverity).toBe("must_fix");
    expect(c.requireIterationCommit).toBe(true);
    expect(c.roles).toEqual([]);
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
    expect(c.roles).toEqual([]);
    expect(warnings.some(w => w.includes('"stages"'))).toBe(true);
    expect(warnings.some(w => w.includes('"codex"'))).toBe(true);
  });

  test("parses the roles catalog", () => {
    const config = parseConfig(`
autoApprove: false
roles:
  implementer: { tier: standard, skills: [tdd-method] }
  security-review: { tier: strong, skills: [security-review-method] }
`);
    expect(config.roles).toEqual([
      { name: "implementer", tier: "standard", skills: ["tdd-method"] },
      { name: "security-review", tier: "strong", skills: ["security-review-method"] }
    ]);
  });

  test("defaults roles to an empty catalog when absent", () => {
    expect(parseConfig("autoApprove: true\n").roles).toEqual([]);
  });

  test("legacy phases: key warns and is ignored without blocking the flow", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const config = parseConfig(`
phases:
  implementation:
    skills:
      main: [tdd]
roles:
  implementer: { tier: standard, skills: [tdd-method] }
`);
    expect(config.roles).toEqual([{ name: "implementer", tier: "standard", skills: ["tdd-method"] }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("rejects an invalid tier inside roles", () => {
    expect(() => parseConfig("roles:\n  a: { tier: turbo, skills: [s] }\n")).toThrow(
      "Config key roles.a.tier must be one of: cheap, standard, strong."
    );
  });

  test("reads a role by dot-notation config key", () => {
    const config = parseConfig("roles:\n  implementer: { tier: standard, skills: [tdd-method] }\n");
    expect(getConfigValue(config, "roles")).toEqual([
      { name: "implementer", tier: "standard", skills: ["tdd-method"] }
    ]);
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
    expect(parseConfig("roles: {}\n").requireIterationCommit).toBe(true);
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
roles:
  implementer: { tier: standard, skills: [dev-core] }
`);
    const config = loadConfig(configPath);
    expect(config.roles).toEqual([{ name: "implementer", tier: "standard", skills: ["dev-core"] }]);
    expect(config.autoApprove).toBe(false);
  });

  test("returns DEFAULT_CONFIG when config file does not exist", () => {
    const config = loadConfig("/nonexistent/path/config.yaml");
    expect(config.roles).toEqual([]);
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
roles:
  implementer: { tier: standard, skills: [project-skill] }
`);
    fs.writeFileSync(explicitConfigPath, `
roles:
  implementer: { tier: standard, skills: [explicit-skill] }
`, "utf-8");

    const resolvedPath = resolveConfigPath(projectPath, explicitConfigPath);
    expect(resolvedPath).toBe(path.resolve(explicitConfigPath));
    expect(loadConfig(resolvedPath).roles).toEqual([{ name: "implementer", tier: "standard", skills: ["explicit-skill"] }]);
  });

  test("resolves project flow config before root default config", () => {
    const projectPath = path.join(testTmpDir, "project");
    writeProjectConfig(projectPath, `
roles:
  implementer: { tier: standard, skills: [project-skill] }
`);

    const resolvedPath = resolveConfigPath(projectPath);
    expect(resolvedPath).toBe(projectConfigPath(projectPath));
    expect(loadConfig(resolvedPath).roles).toEqual([{ name: "implementer", tier: "standard", skills: ["project-skill"] }]);
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
roles:
  implementer: { tier: standard, skills: [dev-core] }
autoApprove: true
`);
    expect(getConfigValue(config, "autoApprove")).toBe(true);
    expect(getConfigValue(config, "roles")).toEqual([{ name: "implementer", tier: "standard", skills: ["dev-core"] }]);
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

// Regression for the fallback used when the bundled repo-root config.yaml is
// missing: it must emit YAML that parseConfig can actually load, not throw.
test("initProject falls back to a parseable config.yaml when the bundled template is missing", () => {
  const dir = createTempWorkspace("init-config-fallback");
  const realExistsSync = fs.existsSync;
  const spy = spyOn(fs, "existsSync").mockImplementation((target: fs.PathLike) => {
    if (target === defaultConfigPath()) return false;
    return realExistsSync(target);
  });
  try {
    const result = initProject(dir);
    expect(result.ok).toBe(true);

    const configPath = projectConfigPath(dir);
    spy.mockRestore();
    expect(() => loadConfig(configPath)).not.toThrow();
    expect(loadConfig(configPath).roles).toEqual([]);
  } finally {
    spy.mockRestore();
    cleanupTempWorkspace(dir);
  }
});

// Direct guard for the class of bug in Fix 1: the shipped template used as
// both the init scaffold and loadConfig's default must actually parse.
test("loadConfig parses the shipped default config.yaml into a valid roles catalog", () => {
  const config = loadConfig(defaultConfigPath());
  expect(config.roles.length).toBeGreaterThan(0);
  const validTiers = ["cheap", "standard", "strong"];
  for (const role of config.roles) {
    expect(validTiers).toContain(role.tier);
  }
});
