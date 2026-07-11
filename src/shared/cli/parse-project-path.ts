import * as path from "path";
import { parseStringOption } from "./parse-string-option";

export function parseProjectPath(args: string[]): string {
  const value = parseStringOption(args, "--project-path") ?? parseStringOption(args, "-p");
  return path.resolve(value ?? process.cwd());
}

export function parseConfigPath(args: string[]): string | undefined {
  const value = parseStringOption(args, "--config");
  return value === undefined ? undefined : path.resolve(value);
}
