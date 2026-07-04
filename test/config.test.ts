import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
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

  test("warns on unknown phase but does not throw (forward compatibility)", () => {
    const warnings = captureWarnings(() => {
      const config = parseConfig(`
stages:
  unknown_stage:
    skills:
      main: ["test"]
`);
      expect(config).toBeDefined();
      expect((config.phases as any).unknown_stage).toBeUndefined();
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes("unknown_stage"))).toBe(true);
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

  test("returns undefined for legacy codex.default.* keys", () => {
    const config = parseConfig(`{}`);
    const warnings = captureWarnings(() => {
      expect(getConfigValue(config, "codex.default.model")).toBeUndefined();
    });
    expect(
      warnings.some(w => w.includes("Deprecated") && w.includes("codex.default"))
    ).toBe(true);
  });

  test("returns undefined for legacy codex.sandboxMode", () => {
    const config = parseConfig(`{}`);
    const warnings = captureWarnings(() => {
      expect(getConfigValue(config, "codex.sandboxMode")).toBeUndefined();
    });
    expect(
      warnings.some(w => w.includes("Deprecated") && w.includes("codex.sandboxMode"))
    ).toBe(true);
  });

  test("returns undefined for legacy codex.approvalPolicy", () => {
    const config = parseConfig(`{}`);
    const warnings = captureWarnings(() => {
      expect(getConfigValue(config, "codex.approvalPolicy")).toBeUndefined();
    });
    expect(
      warnings.some(w => w.includes("Deprecated") && w.includes("codex.approvalPolicy"))
    ).toBe(true);
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
