import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadFlowState, writeFlowState, isActivePhase } from "../src/entities/change/flow-state";

function tmpStateDir(state: unknown): { projectPath: string; changeName: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-flowmode-"));
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify(state, null, 2) + "\n");
  return { projectPath: root, changeName: "c1" };
}

describe("flowMode in state.json", () => {
  it("parses a quick state with a quick activePhase", () => {
    const { projectPath, changeName } = tmpStateDir({ activePhase: "quick_plan", activeIteration: null, repairCycleCount: 0, flowMode: "quick" });
    const state = loadFlowState(projectPath, changeName);
    expect(state?.activePhase).toBe("quick_plan");
    expect(state?.flowMode).toBe("quick");
  });

  it("treats absent flowMode as standard (undefined)", () => {
    const { projectPath, changeName } = tmpStateDir({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 });
    expect(loadFlowState(projectPath, changeName)?.flowMode).toBeUndefined();
  });

  it("throws on an unknown flowMode value", () => {
    const { projectPath, changeName } = tmpStateDir({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0, flowMode: "turbo" });
    expect(() => loadFlowState(projectPath, changeName)).toThrow(/flowMode/);
  });

  it("writes standard state without a flowMode key (byte-identical)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-write-"));
    const p = path.join(dir, "state.json");
    writeFlowState(p, { activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 });
    expect(fs.readFileSync(p, "utf-8")).toBe(JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n");
  });

  it("recognises quick phases as active phases", () => {
    expect(isActivePhase("quick_spec_revision")).toBe(true);
  });
});
