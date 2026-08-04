import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { parseConfig } from "../src/entities/config/config";
import { ModelTiers } from "../src/entities/model-tiers/model-tiers";
import { renderMissingHarnessUsage, renderSpawnPlan } from "../src/features/spawn-plan/render-spawn-plan";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

const CONFIG = parseConfig(`
roles:
  research:        { tier: cheap,    skills: [codebase-recon] }
  implementer:     { tier: standard, skills: [tdd-method, typescript-standards] }
  security-review: { tier: strong,   skills: [security-review-method] }
`);

const TIERS: ModelTiers = {
  source: "file",
  harnesses: {
    "claude-code": { cheap: "haiku", standard: "sonnet", strong: "opus" },
    opencode: { cheap: "google/gemini-flash", standard: "anthropic/claude-sonnet-5", strong: "anthropic/claude-opus-5" }
  }
};

const NO_TIERS: ModelTiers = { source: "missing", harnesses: {} };

describe("renderSpawnPlan", () => {
  test("resolves models for the requested harness only", () => {
    const result = renderSpawnPlan(CONFIG, TIERS, "claude-code");

    expect(result.ok).toBe(true);
    expect(result.roles).toEqual([
      { name: "research", model: "haiku", skills: ["codebase-recon"] },
      { name: "implementer", model: "sonnet", skills: ["tdd-method", "typescript-standards"] },
      { name: "security-review", model: "opus", skills: ["security-review-method"] }
    ]);
    expect(result.message).toContain("Roles for sub-agent dispatch (claude-code).");
    expect(result.message).toContain("The skills and model of a chosen role are mandatory.");
    expect(result.message).toContain("implementer     | sonnet | tdd-method, typescript-standards");
    expect(result.message).not.toContain("opencode");
  });

  test("prints a role comment as a trailing column and omits it when absent", () => {
    const config = parseConfig(`
roles:
  research:    { tier: cheap,    skills: [codebase-recon], comment: "Read-only codebase recon" }
  implementer: { tier: standard, skills: [tdd-method] }
`);
    const result = renderSpawnPlan(config, TIERS, "claude-code");

    expect(result.roles).toEqual([
      { name: "research", model: "haiku", skills: ["codebase-recon"], comment: "Read-only codebase recon" },
      { name: "implementer", model: "sonnet", skills: ["tdd-method"] }
    ]);
    expect(result.message).toContain("research    | haiku  | codebase-recon | Read-only codebase recon");
    expect(result.message).toContain("implementer | sonnet | tdd-method");
    expect(result.message).not.toContain("tdd-method |");
  });

  test("aligns the role and model columns", () => {
    const lines = renderSpawnPlan(CONFIG, TIERS, "claude-code").message.split("\n");
    const rows = lines.filter(line => line.includes(" | "));
    const firstSeparator = rows.map(row => row.indexOf("|"));
    expect(new Set(firstSeparator).size).toBe(1);
  });

  test("prints tiers and a note when the models file is missing", () => {
    const result = renderSpawnPlan(CONFIG, NO_TIERS, "claude-code");

    expect(result.ok).toBe(true);
    expect(result.roles.map(role => role.model)).toEqual(["cheap", "standard", "strong"]);
    expect(result.message).toContain(
      "Tier-to-model mapping is not configured — run every sub-agent on the session model."
    );
  });

  test("prints tiers and names the known harnesses when the harness is unknown", () => {
    const result = renderSpawnPlan(CONFIG, TIERS, "cursor");

    expect(result.ok).toBe(true);
    expect(result.roles.map(role => role.model)).toEqual(["cheap", "standard", "strong"]);
    expect(result.message).toContain('Harness "cursor" is not in the model tiers file');
    expect(result.message).toContain("claude-code, opencode");
  });

  test("falls back to the tier for a tier the harness does not define", () => {
    const partial: ModelTiers = { source: "file", harnesses: { "claude-code": { cheap: "haiku" } } };
    const result = renderSpawnPlan(CONFIG, partial, "claude-code");
    expect(result.roles.map(role => role.model)).toEqual(["haiku", "standard", "strong"]);
  });

  test("notes the missing tiers when the harness is only partially mapped", () => {
    const partial: ModelTiers = { source: "file", harnesses: { "claude-code": { cheap: "haiku" } } };
    const result = renderSpawnPlan(CONFIG, partial, "claude-code");

    expect(result.message).toContain('Harness "claude-code"');
    expect(result.message).toContain("standard, strong");
    expect(result.message).toContain("Run implementer, security-review on the session model for now");
    expect(result.message).not.toContain("Tier-to-model mapping is not configured");
    expect(result.message).not.toContain("is not in the model tiers file");
  });

  test("prints no degradation note when the harness maps every tier a role needs", () => {
    const result = renderSpawnPlan(CONFIG, TIERS, "claude-code");
    expect(result.message).not.toContain("Harness \"claude-code\"");
  });

  test("reports an empty catalog when no roles are configured", () => {
    const result = renderSpawnPlan(parseConfig("autoApprove: false\n"), TIERS, "claude-code");

    expect(result.ok).toBe(true);
    expect(result.roles).toEqual([]);
    expect(result.message).toContain("No roles are configured in config.yaml.");
  });

  test("renders a role with no skills as none", () => {
    const config = parseConfig("roles:\n  bare: { tier: cheap }\n");
    expect(renderSpawnPlan(config, TIERS, "claude-code").message).toContain("bare | haiku | none");
  });
});

describe("renderMissingHarnessUsage", () => {
  test("lists the harnesses from the models file", () => {
    const usage = renderMissingHarnessUsage(TIERS);
    expect(usage).toContain("phasedev spawn-plan --harness <name>");
    expect(usage).toContain("claude-code, opencode");
  });

  test("says the mapping is unavailable when the file is missing", () => {
    expect(renderMissingHarnessUsage(NO_TIERS)).toContain("no model tiers file was found");
  });
});

const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

function runSpawnPlanCli(
  projectPath: string,
  args: string[],
  env: Record<string, string> = {}
): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "spawn-plan", "--project-path", projectPath, ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env }
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
}

describe("phasedev spawn-plan (CLI)", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = createTempWorkspace("spawn-plan");
    fs.mkdirSync(path.join(projectPath, ".phasedev"), { recursive: true });
    fs.writeFileSync(
      path.join(projectPath, ".phasedev", "config.yaml"),
      "roles:\n  implementer: { tier: standard, skills: [tdd-method] }\n",
      "utf-8"
    );
  });

  afterEach(() => {
    cleanupTempWorkspace(projectPath);
  });

  test("fails with usage when --harness is absent", () => {
    const { exitCode, output } = runSpawnPlanCli(projectPath, []);

    expect(exitCode).toBe(1);
    expect(output).toContain("[PHASEDEV SPAWN-PLAN] FAILED: --harness is required.");
    expect(output).toContain("Usage: phasedev spawn-plan --harness <name>");
  });

  test("prints the catalog with resolved models for the requested harness", () => {
    const modelsPath = path.join(projectPath, "models.yaml");
    fs.writeFileSync(modelsPath, "claude-code: { cheap: haiku, standard: sonnet, strong: opus }\n", "utf-8");

    const { exitCode, output } = runSpawnPlanCli(
      projectPath,
      ["--harness", "claude-code"],
      { PHASEDEV_MODELS_FILE: modelsPath }
    );

    expect(exitCode).toBe(0);
    expect(output).toContain("Roles for sub-agent dispatch (claude-code).");
    expect(output).toContain("implementer | sonnet | tdd-method");
    expect(output).not.toContain("Tier-to-model mapping is not configured");
  });

  test("falls back to tiers with a note when no models file exists", () => {
    const { exitCode, output } = runSpawnPlanCli(
      projectPath,
      ["--harness", "claude-code"],
      { PHASEDEV_MODELS_FILE: path.join(projectPath, "absent.yaml") }
    );

    expect(exitCode).toBe(0);
    expect(output).toContain("implementer | standard | tdd-method");
    expect(output).toContain("Tier-to-model mapping is not configured");
  });

  test("emits a JSON envelope with the resolved roles under --json", () => {
    const modelsPath = path.join(projectPath, "models.yaml");
    fs.writeFileSync(modelsPath, "claude-code: { cheap: haiku, standard: sonnet, strong: opus }\n", "utf-8");

    const { exitCode, output } = runSpawnPlanCli(
      projectPath,
      ["--harness", "claude-code", "--json"],
      { PHASEDEV_MODELS_FILE: modelsPath }
    );

    expect(exitCode).toBe(0);
    const envelope = JSON.parse(output);
    expect(envelope.ok).toBe(true);
    expect(envelope.kind).toBe("spawn-plan");
    expect(envelope.data.harness).toBe("claude-code");
    expect(envelope.data.modelTiers).toBe("file");
    expect(envelope.data.roles).toEqual([
      { name: "implementer", model: "sonnet", skills: ["tdd-method"] }
    ]);
  });
});
