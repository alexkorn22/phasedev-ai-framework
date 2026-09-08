import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;
const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

function runCli(
  args: string[] = [],
  env?: Record<string, string>
): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...env
    }
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
}

describe("CLI Lifecycle Security Guard", () => {
  beforeEach(() => {
    testTmpDir = createTempWorkspace("cli-security");
    // initialize project structure
    runCli(["init-project", "--project-path", testTmpDir]);
  });

  afterEach(() => {
    cleanupTempWorkspace(testTmpDir);
  });

  test("refuses advance when PHASEDEV_ORCHESTRATOR is unset and no --manual-lifecycle flag", () => {
    const result = runCli(["advance", "--project-path", testTmpDir], {
      PHASEDEV_ORCHESTRATOR: ""
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV] PERMISSION DENIED: Lifecycle mutation command 'advance'");
  });

  test("refuses advance in JSON mode with permission_denied envelope", () => {
    const result = runCli(["advance", "--project-path", testTmpDir, "--json"], {
      PHASEDEV_ORCHESTRATOR: ""
    });
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.output);
    expect(parsed.ok).toBe(false);
    expect(parsed.kind).toBe("permission_denied");
  });

  test("refuses archive when PHASEDEV_ORCHESTRATOR is unset and no --manual-lifecycle flag", () => {
    const result = runCli(["archive", "some-change", "--project-path", testTmpDir], {
      PHASEDEV_ORCHESTRATOR: ""
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV] PERMISSION DENIED: Lifecycle mutation command 'archive'");
  });

  test("refuses reset-change when PHASEDEV_ORCHESTRATOR is unset and no --manual-lifecycle flag", () => {
    const result = runCli(["reset-change", "--yes", "--project-path", testTmpDir], {
      PHASEDEV_ORCHESTRATOR: ""
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV] PERMISSION DENIED: Lifecycle mutation command 'reset-change'");
  });

  test("allows reset-change with explicit --manual-lifecycle flag even if env unset", () => {
    const result = runCli(["reset-change", "--yes", "--manual-lifecycle", "--project-path", testTmpDir], {
      PHASEDEV_ORCHESTRATOR: ""
    });
    expect(result.output).not.toContain("PERMISSION DENIED");
  });

  test("correctly parses change name in archive with --manual-lifecycle placed before name", () => {
    const result = runCli(["archive", "--manual-lifecycle", "nonexistent-change", "--project-path", testTmpDir], {
      PHASEDEV_ORCHESTRATOR: ""
    });
    expect(result.output).not.toContain("PERMISSION DENIED");
    expect(result.output).not.toContain("<change-name> is required");
    expect(result.output).toContain("nonexistent-change");
  });

  test("allows advance when PHASEDEV_ORCHESTRATOR=1 is set", () => {
    const result = runCli(["advance", "--project-path", testTmpDir], {
      PHASEDEV_ORCHESTRATOR: "1"
    });
    expect(result.output).not.toContain("PERMISSION DENIED");
  });

  test("help output does not leak --manual-lifecycle", () => {
    const result = runCli(["help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("--manual-lifecycle");
  });
});
