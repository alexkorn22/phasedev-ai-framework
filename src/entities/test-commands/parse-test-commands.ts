import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

export interface TestCommands {
  unit?: string;
  phase?: string;
  full?: string;
}

export interface TestCommandsParseResult {
  commands: TestCommands;
  missing: Array<keyof TestCommands>;
}

export function parseTestCommands(filePath: string): TestCommandsParseResult {
  const required: Array<keyof TestCommands> = ["unit", "phase", "full"];
  const commands: TestCommands = {};

  if (!fs.existsSync(filePath)) {
    return { commands, missing: required };
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const lines = content.split("\n");
  let inSection = false;
  const commandRegex = /^-\s*(unit|phase|full)\s*:\s*(.+)$/i;

  for (const line of lines) {
    if (/^##\s+Test Commands\s*$/i.test(line.trim())) {
      inSection = true;
      continue;
    }

    if (inSection && /^##\s+/.test(line.trim())) {
      break;
    }

    if (!inSection) {
      continue;
    }

    const match = line.trim().match(commandRegex);
    if (!match || match[1] === undefined || match[2] === undefined) {
      continue;
    }

    const key = match[1].toLowerCase() as keyof TestCommands;
    const value = match[2].trim().replace(/^`(.+)`$/, "$1").trim();
    if (value.length > 0) {
      commands[key] = value;
    }
  }

  return {
    commands,
    missing: required.filter(key => commands[key] === undefined)
  };
}
