import * as fs from "fs";
import * as path from "path";
import { stringify as stringifyYaml } from "yaml";
import { Config, DEFAULT_CONFIG, defaultConfigPath, projectConfigPath } from "../../entities/config/config";
import { RoleConfig } from "../../entities/role/role";
import { SYSTEM_DIR } from "../../entities/change/paths";

export interface InitProjectResult {
  ok: boolean;
  message: string;
}

// Config.roles is a RoleConfig[] in TypeScript but a name-keyed map in YAML
// (see parseRoles); stringifying DEFAULT_CONFIG as-is would emit a YAML array
// that parseConfig then rejects. Convert to the map shape before serializing.
function toYamlConfig(config: Config): Record<string, unknown> {
  const roles: Record<string, { tier: RoleConfig["tier"]; skills: string[] }> = {};
  for (const role of config.roles) {
    roles[role.name] = { tier: role.tier, skills: role.skills };
  }

  return { ...config, roles };
}

function readInitialConfig(): string {
  const bundledConfigPath = defaultConfigPath();
  if (fs.existsSync(bundledConfigPath)) {
    return fs.readFileSync(bundledConfigPath, "utf-8");
  }

  console.warn(
    `[config] Bundled config.yaml not found at ${bundledConfigPath} — scaffolded config has an empty roles catalog.`
  );
  return stringifyYaml(toYamlConfig(DEFAULT_CONFIG));
}

export function initProject(projectPath: string): InitProjectResult {
  const resolvedProjectPath = path.resolve(projectPath);

  if (!fs.existsSync(resolvedProjectPath) || !fs.statSync(resolvedProjectPath).isDirectory()) {
    return {
      ok: false,
      message: `[PHASEDEV INIT-PROJECT] FAILED: project path must exist and be a directory: ${resolvedProjectPath}`
    };
  }

  const flowRoot = path.join(resolvedProjectPath, SYSTEM_DIR);
  const directories = [
    flowRoot,
    path.join(flowRoot, "changes"),
    path.join(flowRoot, "changes", "archive"),
    path.join(flowRoot, "specs"),
    path.join(flowRoot, "knowledge"),
    path.join(flowRoot, "knowledge", "phases")
  ];

  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const antipatternsPath = path.join(flowRoot, "knowledge", "antipatterns.md");
  if (!fs.existsSync(antipatternsPath)) {
    fs.writeFileSync(
      antipatternsPath,
      [
        "# Project Anti-Patterns & Taboos",
        "",
        "> Lessons learned from AI engineering mistakes in this project.",
        "> Rule: When an agent makes an engineering mistake twice, add it here.",
        "",
        "## Forbidden Patterns",
        "<!-- List recurring mistakes, forbidden patterns, and traps specific to this codebase -->",
        ""
      ].join("\n"),
      "utf-8"
    );
  }

  const generalMemoryPath = path.join(flowRoot, "knowledge", "general-memory.md");
  if (!fs.existsSync(generalMemoryPath)) {
    fs.writeFileSync(
      generalMemoryPath,
      [
        "# Project General Engineering Memory",
        "",
        "> Shared operational context, environment quirks, and architectural rules applied to all phases.",
        "",
        "## Operational Context",
        "<!-- Environment, runtimes, package managers, and architecture conventions -->",
        ""
      ].join("\n"),
      "utf-8"
    );
  }

  const configPath = projectConfigPath(resolvedProjectPath);
  const configStatus = fs.existsSync(configPath) ? "existing" : "created";
  if (configStatus === "created") {
    fs.writeFileSync(configPath, readInitialConfig(), "utf-8");
  }

  return {
    ok: true,
    message: [
      `[PHASEDEV INIT-PROJECT] OK: initialized ${flowRoot}`,
      `config: ${configStatus}`,
      "created/reused:",
      ...directories.map(directory => `- ${directory}`),
      `- ${configPath}`
    ].join("\n")
  };
}
