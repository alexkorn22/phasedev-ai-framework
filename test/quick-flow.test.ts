import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { quickPhasePrompt } from "../src/features/phase-control/quick-phase-prompt";
import { quickAdvance } from "../src/features/phase-control/quick-advance";
import { quickCheck } from "../src/features/phase-control/quick-check";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { checkPhase } from "../src/features/phase-control/check-flow";
import { loadFlowState } from "../src/entities/change/flow-state";
import { buildChangePaths } from "../src/entities/change/paths";
import { recordCommitLogStart } from "../src/entities/change/commit-log";
import { findArchiveStateForChange, writeArchiveState } from "../src/entities/change/archive-state";

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-quick-git-"));
  const run = (args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf-8" });
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["config", "commit.gpgsign", "false"]);
  return dir;
}

function gitCommitAll(dir: string, message: string): string {
  spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf-8" });
  spawnSync("git", ["-C", dir, "commit", "-m", message, "--no-gpg-sign"], { encoding: "utf-8" });
  return spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
}

function quickChangeDir(): { projectPath: string; changeDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-arch-"));
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "quick_spec_revision", activeIteration: null, repairCycleCount: 0, flowMode: "quick" }, null, 2) + "\n");
  return { projectPath: root, changeDir };
}

function scaffoldQuickIn(root: string, activePhase: string, worklogBody = "# Worklog\n\n## Task\nx\n"): { projectPath: string; changeName: string } {
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase, activeIteration: null, repairCycleCount: 0, flowMode: "quick" }, null, 2) + "\n");
  fs.writeFileSync(path.join(changeDir, "worklog.md"), worklogBody);
  return { projectPath: root, changeName: "c1" };
}

function scaffoldQuick(activePhase: string, worklogBody = "# Worklog\n\n## Task\nx\n"): { projectPath: string; changeName: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-quick-"));
  return scaffoldQuickIn(root, activePhase, worklogBody);
}

describe("startArchiveStage flowMode preservation", () => {
  it("carries flowMode:quick into the archived state.json", () => {
    const { projectPath, changeDir } = quickChangeDir();
    const result = startArchiveStage(projectPath, changeDir, new Date("2026-07-11T00:00:00Z"), DEFAULT_CONFIG);
    expect(result.blocked).toBeFalsy();
    const archived = path.join(projectPath, ".phasedev", "changes", "archive", "2026-07-11-c1", "state.json");
    const state = JSON.parse(fs.readFileSync(archived, "utf-8"));
    expect(state.flowMode).toBe("quick");
    expect(state.activePhase).toBe("archive");
  });

  it("leaves standard archived state without a flowMode key", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-arch2-"));
    const changeDir = path.join(root, ".phasedev", "changes", "c2");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n");
    startArchiveStage(root, changeDir, new Date("2026-07-11T00:00:00Z"), DEFAULT_CONFIG);
    const state = JSON.parse(fs.readFileSync(path.join(root, ".phasedev", "changes", "archive", "2026-07-11-c2", "state.json"), "utf-8"));
    expect("flowMode" in state).toBe(false);
  });
});

describe("quickPhasePrompt", () => {
  it("renders the quick_plan contract with the env-discovery skill policy and no configured-skill block", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    const state = loadFlowState(projectPath, changeName)!;
    const prompt = quickPhasePrompt(projectPath, DEFAULT_CONFIG, state, changeName);
    expect(prompt.blocked).toBe(false);
    expect(prompt.prompt).toContain("Quick Phase: Plan");
    expect(prompt.prompt).toContain("Discover and apply skills from your runtime environment");
  });

  it("renders the quick archive contract with the bare change name, not the dated archive basename", () => {
    const { projectPath, changeDir } = quickChangeDir();
    const result = startArchiveStage(projectPath, changeDir, new Date("2026-07-11T00:00:00Z"), DEFAULT_CONFIG);
    expect(result.blocked).toBeFalsy();

    const state = loadFlowState(projectPath, "c1")!;
    expect(state.activePhase).toBe("archive");

    const prompt = quickPhasePrompt(projectPath, DEFAULT_CONFIG, state, "c1");
    expect(prompt.blocked).toBe(false);
    expect(prompt.prompt).toContain("Archived change: c1");
    expect(prompt.prompt).not.toContain("Archived change: 2026-07-11-c1");
  });

  it("returns a blocked prompt for a non-quick phase", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    const state = loadFlowState(projectPath, changeName)!;
    const prompt = quickPhasePrompt(projectPath, DEFAULT_CONFIG, { ...state, activePhase: "final_validation" }, changeName);
    expect(prompt.blocked).toBe(true);
  });
});

describe("quickAdvance", () => {
  it("advances quick_plan -> quick_implementation when worklog is non-empty", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    const state = loadFlowState(projectPath, changeName)!;
    const result = quickAdvance(projectPath, DEFAULT_CONFIG, state, changeName);
    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("quick_implementation");
    expect(loadFlowState(projectPath, changeName)?.flowMode).toBe("quick");
  });

  it("refuses to leave quick_plan when worklog is empty", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan", "");
    const state = loadFlowState(projectPath, changeName)!;
    const result = quickAdvance(projectPath, DEFAULT_CONFIG, state, changeName);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/worklog/i);
  });

  it("advances quick_validation -> quick_spec_revision with no gate", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_validation");
    const state = loadFlowState(projectPath, changeName)!;
    const result = quickAdvance(projectPath, DEFAULT_CONFIG, state, changeName);
    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("quick_spec_revision");
  });

  it("blocks quick_implementation when requireIterationCommit is true and there is no new commit since baseline", () => {
    const repo = makeGitRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "# fixture\n");
    const baselineHead = gitCommitAll(repo, "initial commit");
    const { projectPath, changeName } = scaffoldQuickIn(repo, "quick_implementation");
    const paths = buildChangePaths(path.join(repo, ".phasedev", "changes", "c1"));
    recordCommitLogStart(paths.commitLogPath, baselineHead);
    const state = loadFlowState(projectPath, changeName)!;
    const config = { ...DEFAULT_CONFIG, requireIterationCommit: true };

    const blocked = quickAdvance(projectPath, config, state, changeName);
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toMatch(/commit/i);

    gitCommitAll(repo, "implementation work");
    const passed = quickAdvance(projectPath, config, state, changeName);
    expect(passed.ok).toBe(true);
    expect(passed.newState?.activePhase).toBe("quick_validation");
  });

  it("does not gate quick_implementation in a non-git project (fail open)", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_implementation");
    const state = loadFlowState(projectPath, changeName)!;
    const config = { ...DEFAULT_CONFIG, requireIterationCommit: true };

    const result = quickAdvance(projectPath, config, state, changeName);
    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("quick_validation");
  });

  it("runs the archive mutation from quick_spec_revision, refuses while in_progress, and finishes once completed", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_spec_revision");
    const state = loadFlowState(projectPath, changeName)!;

    const toArchive = quickAdvance(projectPath, DEFAULT_CONFIG, state, changeName);
    expect(toArchive.ok).toBe(true);
    expect(toArchive.advanced).toBe(true);
    expect(toArchive.newState?.activePhase).toBe("archive");

    const archiveState = loadFlowState(projectPath, changeName)!;
    expect(archiveState.activePhase).toBe("archive");

    const whileInProgress = quickAdvance(projectPath, DEFAULT_CONFIG, archiveState, changeName);
    expect(whileInProgress.ok).toBe(false);
    expect(whileInProgress.message).toMatch(/not complete/i);

    const archived = findArchiveStateForChange(projectPath, changeName);
    expect(archived).not.toBeNull();
    writeArchiveState({ ...archived!, status: "completed", completedAt: new Date().toISOString() });

    const finished = quickAdvance(projectPath, DEFAULT_CONFIG, archiveState, changeName);
    expect(finished.ok).toBe(true);
    expect(finished.finished).toBe(true);
  });

  it("refuses to advance from quick_spec_revision when runArchiveStage is false", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_spec_revision");
    const state = loadFlowState(projectPath, changeName)!;
    const config = { ...DEFAULT_CONFIG, runArchiveStage: false };

    const result = quickAdvance(projectPath, config, state, changeName);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/archive is disabled/i);
  });
});

describe("dispatch guards route quick changes before standard-track machinery", () => {
  it("getPhasePrompt routes a quick change to the quick contract without resolveRoute", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    const prompt = getPhasePrompt(projectPath, DEFAULT_CONFIG, changeName);
    expect(prompt.prompt).toContain("Quick Phase: Plan");
  });

  it("advanceFlow steps a quick change linearly", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    const result = advanceFlow(projectPath, DEFAULT_CONFIG, changeName);
    expect(result.newState?.activePhase).toBe("quick_implementation");
  });

  it("checkPhase reports quick-phase validity", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    expect(checkPhase(projectPath, undefined, changeName).ok).toBe(true);
  });
});

describe("quickCheck", () => {
  it("reports OK for quick_plan when worklog is non-empty", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan");
    const state = loadFlowState(projectPath, changeName)!;
    expect(quickCheck(projectPath, state, changeName).ok).toBe(true);
  });

  it("reports failure for quick_plan when worklog is empty", () => {
    const { projectPath, changeName } = scaffoldQuick("quick_plan", "");
    const state = loadFlowState(projectPath, changeName)!;
    expect(quickCheck(projectPath, state, changeName).ok).toBe(false);
  });
});
