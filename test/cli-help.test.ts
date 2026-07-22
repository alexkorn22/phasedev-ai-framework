import { describe, test, expect } from "bun:test";
import { renderHelp } from "../src/features/cli-help/render-help";
import { CLI_COMMAND_NAMES } from "../src/features/cli-help/cli-command-names";

describe("renderHelp completeness", () => {
  test("every registered CLI command is documented in help", () => {
    const help = renderHelp();
    for (const name of CLI_COMMAND_NAMES) {
      expect(help).toContain(`phasedev ${name}`);
    }
  });
});
