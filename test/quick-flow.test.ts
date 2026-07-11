import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { DEFAULT_CONFIG } from "../src/entities/config/config";

function quickChangeDir(): { projectPath: string; changeDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-arch-"));
  const changeDir = path.join(root, ".phasedev", "changes", "c1");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "quick_spec_revision", activeIteration: null, repairCycleCount: 0, flowMode: "quick" }, null, 2) + "\n");
  return { projectPath: root, changeDir };
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
