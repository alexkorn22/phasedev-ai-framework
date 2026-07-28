import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getClarifyPrompt, hasClarifyContract, clarifyReminderFor } from "../src/features/phase-control/get-clarify-prompt";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";

let projectPath: string;

function writeState(change: string, state: Record<string, unknown>): void {
  const dir = path.join(projectPath, ".phasedev", "changes", change);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

beforeEach(() => {
  projectPath = createTempWorkspace("clarify");
});

afterEach(() => {
  cleanupTempWorkspace(projectPath);
});

describe("getClarifyPrompt", () => {
  test("with no change at all it returns the pre-flow task-definition scope", () => {
    const result = getClarifyPrompt(projectPath);

    expect(result.blocked).toBe(false);
    expect(result.phase).toBe("change_intake");
    expect(result.prompt).toContain("## Scope: task definition");
    expect(result.prompt).toContain("--task-file");
  });

  test("it returns the architecture scope at technical_design", () => {
    writeState("alpha", { activePhase: "technical_design", activeIteration: null, repairCycleCount: 0 });

    const result = getClarifyPrompt(projectPath, "alpha");

    expect(result.blocked).toBe(false);
    expect(result.phase).toBe("technical_design");
    expect(result.prompt).toContain("## Scope: architecture");
    expect(result.prompt).not.toContain("## Scope: task definition");
  });

  test("it returns the iteration-split scope at iteration_planning", () => {
    writeState("alpha", { activePhase: "iteration_planning", activeIteration: null, repairCycleCount: 0 });

    const result = getClarifyPrompt(projectPath, "alpha");

    expect(result.phase).toBe("iteration_planning");
    expect(result.prompt).toContain("## Scope: iteration split");
  });

  test("a phase without a clarify contract returns a non-blocking note", () => {
    writeState("alpha", { activePhase: "code_research", activeIteration: null, repairCycleCount: 0 });

    const result = getClarifyPrompt(projectPath, "alpha");

    expect(result.blocked).toBe(false);
    expect(result.prompt).not.toContain("## Scope:");
    expect(result.prompt).toContain("code_research");
  });

  test("a quick-mode change returns a non-blocking note instead of a scope", () => {
    writeState("alpha", { activePhase: "quick_plan", activeIteration: null, repairCycleCount: 0, flowMode: "quick" });

    const result = getClarifyPrompt(projectPath, "alpha");

    expect(result.blocked).toBe(false);
    expect(result.prompt).not.toContain("## Scope:");
    expect(result.prompt).toContain("quick");
  });

  test("an explicitly named change that does not exist is blocked", () => {
    const result = getClarifyPrompt(projectPath, "ghost");

    expect(result.blocked).toBe(true);
    expect(result.phase).toBeNull();
  });

  test("hasClarifyContract covers exactly the three decision points", () => {
    expect(hasClarifyContract("change_intake")).toBe(true);
    expect(hasClarifyContract("technical_design")).toBe(true);
    expect(hasClarifyContract("iteration_planning")).toBe(true);
    expect(hasClarifyContract("code_research")).toBe(false);
    expect(hasClarifyContract("implementation")).toBe(false);
    expect(hasClarifyContract("quick_plan")).toBe(false);
  });
});

describe("clarifyReminderFor", () => {
  test("mid-flow decision points get a reminder", () => {
    expect(clarifyReminderFor("technical_design")).toContain("phasedev clarify");
    expect(clarifyReminderFor("iteration_planning")).toContain("phasedev clarify");
  });

  test("phases without a decision point get no reminder", () => {
    expect(clarifyReminderFor("code_research")).toBe("");
    expect(clarifyReminderFor("implementation")).toBe("");
    expect(clarifyReminderFor("final_validation")).toBe("");
    expect(clarifyReminderFor("quick_plan")).toBe("");
  });
});
