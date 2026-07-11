import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { renderHelp } from "../src/features/cli-help/render-help";

const repoRoot = path.resolve(__dirname, "..");
const readmePath = path.join(repoRoot, "README.md");

function commandNamesFromHelp(): string[] {
  const help = renderHelp();
  const commandsSection = help.split("Commands:\n")[1]?.split("\nOptions:")[0] ?? "";
  const names = new Set<string>();
  for (const match of commandsSection.matchAll(/^ {2}phasedev ([a-z][a-z-]*)\b/gm)) {
    names.add(match[1]);
  }
  return Array.from(names).sort();
}

describe("README command docs vs phasedev help drift", () => {
  test("every command named in `phasedev help` appears in README.md", () => {
    const helpCommands = commandNamesFromHelp();
    const readme = fs.readFileSync(readmePath, "utf-8");

    expect(helpCommands.length).toBeGreaterThan(0);

    const missing = helpCommands.filter(name => !readme.includes(`phasedev ${name}`));
    expect(missing).toEqual([]);
  });
});
