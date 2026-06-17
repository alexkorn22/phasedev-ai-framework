import * as fs from "fs";
import * as path from "path";
import { stringify as stringifyYaml } from "yaml";
import { DEFAULT_CONFIG, defaultConfigPath, projectConfigPath } from "../../entities/config/config";
import { SYSTEM_DIR } from "../../entities/change/paths";

export interface InitProjectResult {
  ok: boolean;
  message: string;
}

function readInitialConfig(): string {
  const bundledConfigPath = defaultConfigPath();
  if (fs.existsSync(bundledConfigPath)) {
    return fs.readFileSync(bundledConfigPath, "utf-8");
  }

  return stringifyYaml(DEFAULT_CONFIG);
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
    path.join(flowRoot, "logs")
  ];

  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
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
