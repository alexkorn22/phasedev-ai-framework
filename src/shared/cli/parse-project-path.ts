import * as path from "path";

export function parseProjectPath(args: string[]): string {
  let projectPath = process.cwd();

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--project-path" || args[i] === "-p") && args[i + 1]) {
      projectPath = args[i + 1];
    }
  }

  return path.resolve(projectPath);
}

export function parseConfigPath(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      return path.resolve(args[i + 1]);
    }
  }

  return undefined;
}
