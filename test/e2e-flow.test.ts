import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;
const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

function run(args: string[]): { code: number; out: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args, "--project-path", testTmpDir],
    stdout: "pipe",
    stderr: "pipe"
  });
  return { code: result.exitCode, out: result.stdout.toString() + result.stderr.toString() };
}

function state(): { activePhase: string; activeIteration: number | null } | null {
  const dirs = fs.readdirSync(path.join(testTmpDir, ".phasedev", "changes"), { withFileTypes: true })
    .filter(d => d.isDirectory());
  for (const dir of dirs) {
    const statePath = path.join(testTmpDir, ".phasedev", "changes", dir.name, "state.json");
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, "utf-8"));
    }
  }
  const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive");
  if (fs.existsSync(archiveDir)) {
    const archiveDirs = fs.readdirSync(archiveDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of archiveDirs) {
      const statePath = path.join(archiveDir, dir.name, "state.json");
      if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, "utf-8"));
      }
    }
  }
  return null;
}

function changeDir(): string {
  const dirs = fs.readdirSync(path.join(testTmpDir, ".phasedev", "changes"), { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== "archive");
  return dirs.length > 0
    ? path.join(testTmpDir, ".phasedev", "changes", dirs[0].name)
    : "";
}

function simulateAgent(file: string, body: string, approved = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\napproved: ${approved}\n---\n${body}`, "utf-8");
}

describe("E2E flow via CLI subprocess", () => {
  beforeEach(() => {
    testTmpDir = createTempWorkspace("e2e-flow");
  });

  afterEach(() => {
    cleanupTempWorkspace(testTmpDir);
  });

  // ── K: Deprecated next ─────────────────────────────────────

  test("next is deprecated — shows warning and exits 0", () => {
    const result = run(["next"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("next");
    expect(result.out).toContain("deprecated");
    expect(result.out).toContain("phase");
    expect(result.out).toContain("advance");
  });

  // ── A: create-change ───────────────────────────────────────

  test("create-change works — creates state.json with initial phase", () => {
    const result = run(["create-change", "my-change"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("Created change");

    const statePath = path.join(testTmpDir, ".phasedev", "changes", "my-change", "state.json");
    expect(fs.existsSync(statePath)).toBe(true);

    const st = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(st.activePhase).toBe("change_intake");
    expect(st.activeIteration).toBeNull();
  });

  test("create-change accepts the name after option flags, as documented", () => {
    const result = run(["create-change", "--project-path", testTmpDir, "flag-first-change"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("Created change flag-first-change");
  });

  test("create-change refuses duplicate", () => {
    run(["create-change", "my-change"]);
    const result = run(["create-change", "my-change"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("already exists");
  });

  // ── B: phase ───────────────────────────────────────────────

  test("phase prints contract after create-change", () => {
    run(["create-change", "my-change"]);

    const result = run(["phase"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("Phase 1.");
    expect(result.out).toContain("Change Intake");
  });

  test("phase without state.json shows blocker", () => {
    const result = run(["phase"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("No active change");
  });

  test("phase is idempotent — same output on repeated calls", () => {
    run(["create-change", "my-change"]);

    const a = run(["phase"]).out;
    const b = run(["phase"]).out;

    expect(a).toEqual(b);
  });

  // ── C: check ───────────────────────────────────────────────

  test("check without artifacts shows issues", () => {
    run(["create-change", "my-change"]);
    const result = run(["check"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("has issues");
  });

  test("check without state.json fails", () => {
    const result = run(["check"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("No active change");
  });

  test("check --phase unknown fails", () => {
    run(["create-change", "my-change"]);
    const result = run(["check", "--phase", "nonsense"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("Unknown phase");
  });

  // ── D: advance ─────────────────────────────────────────────

  test("advance refuses when artifacts are invalid", () => {
    run(["create-change", "my-change"]);

    const result = run(["advance"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("Cannot leave phase");
  });

  test("advance refuses without state.json", () => {
    const result = run(["advance"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("No active change");
  });

  // ── E2E: Partial smoke — create, phase, check, advance ─────

  test("E2E: create → phase → check → advance (approval block)", () => {
    run(["create-change", "feature-x"]);
    const dir = changeDir();
    expect(dir).not.toBe("");

    // phase should print contract
    expect(run(["phase"]).code).toBe(0);

    // check should fail — no artifacts yet
    expect(run(["check"]).code).toBe(1);

    // advance should refuse
    const adv = run(["advance"]);
    expect(adv.code).toBe(1);
    expect(adv.out).toContain("Cannot leave phase");
  });

});
