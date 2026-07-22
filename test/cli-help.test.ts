import { describe, test, expect } from "bun:test";
import { renderHelp } from "../src/features/cli-help/render-help";
import { CLI_COMMAND_NAMES } from "../src/features/cli-help/cli-command-names";

describe("renderHelp completeness", () => {
  test("every registered CLI command is documented in help", () => {
    const help = renderHelp();
    for (const name of CLI_COMMAND_NAMES) {
      // Boundary-aware match: `name` must not be a strict prefix of another
      // documented command (e.g. `check` ⊂ `check-validation`), which a plain
      // substring check would miss.
      expect(help).toMatch(new RegExp(`phasedev ${name}(?![\\w-])`));
    }
  });

  test("help documents the behavioral contracts", () => {
    const help = renderHelp();
    for (const section of [
      "Concurrency & locking:",
      "Exit codes & output conventions:",
      "Findings lifecycle:",
      "Approval gates:"
    ]) {
      expect(help).toContain(section);
    }
    expect(help).toContain(".phasedev/state.lock");
    expect(help).toContain("append-only");
  });
});
