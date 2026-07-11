import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { acquireLock, FileLock } from "../src/shared/fs/state-lock";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");
let workspace: string;

function runCli(args: string[]): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });
  return { exitCode: result.exitCode, output: `${result.stdout.toString()}${result.stderr.toString()}` };
}

function spawnCli(args: string[]): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", cliPath, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });
  return (async () => {
    const [out, err, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    return { exitCode, output: `${out}${err}` };
  })();
}

function initProject(): void {
  const r = runCli(["init-project", "--project-path", workspace]);
  expect(r.exitCode).toBe(0);
}

function writeFindings(changeName: string): string {
  const changeDir = path.join(workspace, ".phasedev", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  const findingsPath = path.join(changeDir, "validation_findings.md");
  fs.writeFileSync(findingsPath,
    "---\nverdict: repair_required\ntype: iteration\ndate: 2026-07-01\n---\n\n" +
    "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n" +
    "|---|---|---|---|---|---|---|---|\n" +
    "| F1 | open | MUST-FIX | validation | Iteration 1 | Broken | Fix it | |\n",
    "utf-8");
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8");
  return findingsPath;
}

beforeEach(() => { workspace = createTempWorkspace("state-lock-cli"); });
afterEach(() => { cleanupTempWorkspace(workspace); });

describe("mutating commands honor the state lock", () => {
  test("resolve-finding is BLOCKED while the lock is held and leaves the file unchanged", () => {
    initProject();
    const findingsPath = writeFindings("sample-change");
    const before = fs.readFileSync(findingsPath, "utf-8");

    let held: FileLock | undefined;
    try {
      held = acquireLock(path.join(workspace, ".phasedev", "state.lock"));
      const r = runCli(["resolve-finding", "F1", "--resolution", "Fixed; bun test -> pass", "--file", findingsPath, "--project-path", workspace]);
      expect(r.exitCode).toBe(1);
      expect(r.output).toContain("BLOCKED: another PhaseDev operation holds the lock");
      expect(fs.readFileSync(findingsPath, "utf-8")).toBe(before);
    } finally {
      held?.release();
    }
  });

  test("create-change is BLOCKED while the lock is held and creates no change dir", () => {
    initProject();
    const changeDir = path.join(workspace, ".phasedev", "changes", "concurrent-change");

    let held: FileLock | undefined;
    try {
      held = acquireLock(path.join(workspace, ".phasedev", "state.lock"));
      const r = runCli(["create-change", "concurrent-change", "--project-path", workspace]);
      expect(r.exitCode).toBe(1);
      expect(r.output).toContain("BLOCKED: another PhaseDev operation holds the lock");
      expect(fs.existsSync(changeDir)).toBe(false);
    } finally {
      held?.release();
    }
  });

  test("two parallel create-change on the same name never both create it", async () => {
    initProject();
    const [a, b] = await Promise.all([
      spawnCli(["create-change", "race", "--project-path", workspace]),
      spawnCli(["create-change", "race", "--project-path", workspace])
    ]);

    const successes = [a, b].filter(r => r.output.includes("[PHASEDEV CREATE-CHANGE] OK"));
    expect(successes.length).toBe(1);

    // The loser is either BLOCKED (overlapped) or "already exists" (serialized).
    const loser = a.output.includes("[PHASEDEV CREATE-CHANGE] OK") ? b : a;
    const blocked = loser.output.includes("BLOCKED: another PhaseDev operation holds the lock");
    const alreadyExists = loser.output.includes("already exists");
    expect(blocked || alreadyExists).toBe(true);
    expect(loser.exitCode).toBe(1);

    // state.json is valid, not a half-written clobber.
    const statePath = path.join(workspace, ".phasedev", "changes", "race", "state.json");
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(state.activePhase).toBe("change_intake");
  });

  test("two parallel resolve-finding leave a single consistent resolution", async () => {
    initProject();
    const findingsPath = writeFindings("dual-resolve");
    const [a, b] = await Promise.all([
      spawnCli(["resolve-finding", "F1", "--resolution", "Alpha fix; bun test -> pass", "--file", findingsPath, "--project-path", workspace]),
      spawnCli(["resolve-finding", "F1", "--resolution", "Beta fix; bun test -> pass", "--file", findingsPath, "--project-path", workspace])
    ]);

    const content = fs.readFileSync(findingsPath, "utf-8");
    // Exactly one F1 row, status resolved, with exactly one of the two resolutions — never an interleaved/corrupt row.
    expect((content.match(/\|\s*F1\s*\|/g) ?? []).length).toBe(1);
    expect(content).toContain("resolved");
    const hasAlpha = content.includes("Alpha fix");
    const hasBeta = content.includes("Beta fix");
    expect(hasAlpha !== hasBeta).toBe(true);

    // Whichever process printed BLOCKED must not be the one whose text won.
    const blockedRun = [a, b].find(r => r.output.includes("BLOCKED"));
    if (blockedRun) {
      const blockedResolution = a === blockedRun ? "Alpha fix" : "Beta fix";
      // A blocked run made no write; its resolution text must be absent unless the other run also used it.
      // Both resolutions differ, so the blocked run's text must be absent.
      expect(content.includes(blockedResolution)).toBe(false);
    }
  });
});
