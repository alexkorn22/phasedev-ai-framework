import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { quickPhasePrompt } from "../src/features/phase-control/quick-phase-prompt";
import { quickAdvance } from "../src/features/phase-control/quick-advance";
import { quickCheck } from "../src/features/phase-control/quick-check";
import { loadFlowState } from "../src/entities/change/flow-state";

function quickChangeDir(): { projectPath: string; changeDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-arch-"));
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "quick_spec_revision", activeIteration: null, repairCycleCount: 0, flowMode: "quick" }, null, 2) + "\n");
  return { projectPath: root, changeDir };
}

function scaffoldQuick(activePhase: string, worklogBody = "# Worklog\n\n## Task\nx\n"): { projectPath: string; changeName: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-quick-"));
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase, activeIteration: null, repairCycleCount: 0, flowMode: "quick" }, null, 2) + "\n");
  fs.writeFileSync(path.join(changeDir, "worklog.md"), worklogBody);
  return { projectPath: root, changeName: "c1" };
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
