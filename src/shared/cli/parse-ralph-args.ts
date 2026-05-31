import * as path from "path";

export function parseRalphArgs(args: string[]): { projectPath: string; configPath?: string } {
  let projectPath = process.cwd();
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--project-path" || args[i] === "-p") && args[i + 1]) {
      projectPath = args[i + 1];
    }
    if (args[i] === "--config" && args[i + 1]) {
      configPath = args[i + 1];
    }
  }

  return { projectPath: path.resolve(projectPath), configPath };
}
