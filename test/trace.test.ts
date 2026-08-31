import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ensureTraceDirs, recordPhaseContract, recordGitDiff } from "../src/features/trace-capture/record-trace";
import { buildChangePaths } from "../src/entities/change/paths";
import { createChange } from "../src/features/phase-control/create-change";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";
import { loadConfig } from "../src/entities/config/config";

describe("Trace Capture & Paths", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-trace-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("buildChangePaths includes traceDirPath", () => {
    const changeDir = path.join(tmpDir, ".phasedev", "changes", "test-change");
    const paths = buildChangePaths(changeDir);
    expect(paths.traceDirPath).toBe(path.join(changeDir, "trace"));
  });

  it("ensureTraceDirs creates phases and diffs directories", () => {
    const changeDir = path.join(tmpDir, ".phasedev", "changes", "test-change");
    const dirs = ensureTraceDirs(changeDir);

    expect(fs.existsSync(dirs.traceDir)).toBe(true);
    expect(fs.existsSync(dirs.phasesDir)).toBe(true);
    expect(fs.existsSync(dirs.diffsDir)).toBe(true);
  });

  it("recordPhaseContract writes contract snapshot to trace/phases/<phase>/phase_contract.md", () => {
    const changeDir = path.join(tmpDir, ".phasedev", "changes", "test-change");
    recordPhaseContract(changeDir, "technical_design", "# Design Contract Content");

    const contractFile = path.join(changeDir, "trace", "phases", "technical_design", "phase_contract.md");
    expect(fs.existsSync(contractFile)).toBe(true);
    expect(fs.readFileSync(contractFile, "utf-8")).toBe("# Design Contract Content");
  });

  it("createChange copies task text to trace/00_intake_task.md", () => {
    const result = createChange(tmpDir, "my-feature", "Build a feature according to spec");
    expect(result.ok).toBe(true);

    const changeDir = result.changeDir!;
    const traceTask = path.join(changeDir, "trace", "00_intake_task.md");
    expect(fs.existsSync(traceTask)).toBe(true);
    expect(fs.readFileSync(traceTask, "utf-8").trim()).toBe("Build a feature according to spec");
  });

  it("getPhasePrompt automatically records phase contract to trace", () => {
    const created = createChange(tmpDir, "trace-prompt-test", "Test prompt capture");
    expect(created.ok).toBe(true);

    const promptResult = getPhasePrompt(tmpDir, loadConfig(), "trace-prompt-test");
    expect(promptResult.blocked).toBe(false);

    const contractFile = path.join(created.changeDir!, "trace", "phases", "change_intake", "phase_contract.md");
    expect(fs.existsSync(contractFile)).toBe(true);
    expect(fs.readFileSync(contractFile, "utf-8")).toBe(promptResult.prompt);
  });
});
