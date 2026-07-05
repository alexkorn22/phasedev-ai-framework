import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import * as fs from "fs";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";

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
  const lines = blankFencedCodeLines(content.split("\n"));
  let inSection = false;

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

    if (!line.trim().startsWith("|")) {
      continue;
    }

    const cells = splitMarkdownTableRow(line);
    if (cells.length !== 2 || cells[0] === "Gate" || isMarkdownTableSeparatorRow(cells)) {
      continue;
    }

    const key = cells[0].toLowerCase() as keyof TestCommands;
    if (!required.includes(key)) {
      continue;
    }

    const value = cells[1].trim().replace(/^`(.+)`$/, "$1").trim();
    if (value.length > 0) {
      commands[key] = value;
    }
  }

  return {
    commands,
    missing: required.filter(key => commands[key] === undefined)
  };
}
