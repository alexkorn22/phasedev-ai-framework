import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getInitPrompt, getNextPrompt } from "../src/features/flow-control";

const testTmpDir = path.resolve(__dirname, "..", "test-controller-temp");

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved ? "true" : "false"}\n---\n${body}`, "utf-8");
}

function setupChange(planContent: string, options: { findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n");
  writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), "# Research\n", "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), "# Design\n", options.designApproved ?? true);
  writeArtifact(path.join(changeDir, "implementation_plan.md"), planContent, options.planApproved ?? true);

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  return changeDir;
}

describe("flow controller typed stages", () => {
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("init prompt reports init stage", () => {
    const result = getInitPrompt(testTmpDir);

    expect(result.command).toBe("init");
    expect(result.stage).toBe("init");
    expect(result.blocked).toBe(false);
  });

  test("missing active change routes to setup stage", () => {
    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("setup");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Этап 0. AI Layer Setup.");
  });

  test("implementation route reports implementation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] Implement endpoint
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("implementation");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Этап 4. Implementation.");
  });

  test("completed multi-phase phase routes to phase validation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint

## Phase 2: UI [ ]
- [ ] Build page
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("phase_validation");
    expect(result.prompt).toContain("Этап 5A. Phase Validation.");
  });

  test("completed single-phase route reports final validation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("final_validation");
    expect(result.prompt).toContain("Этап 5B. Final Validation.");
  });

  test("repair route reports repair stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, {
      findings: "---\nverdict: repair_required\ntype: phase\ndate: 2026-05-29\n---\n"
    });

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("repair");
    expect(result.prompt).toContain("Этап 5R. Repair Loop.");
  });

  test("archive route reports archive stage and moves active change to pending archive", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [x]
- [x] Implement endpoint
`, {
      findings: "---\nverdict: ready\ntype: final\ndate: 2026-05-29\n---\n"
    });

    const result = getNextPrompt(testTmpDir);
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);
    const statePath = path.join(archiveDir, ".flow-archive.json");

    expect(result.stage).toBe("archive");
    expect(result.prompt).toContain("Этап 6. Archive.");
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8"))).toMatchObject({
      status: "in_progress",
      changeName: "sample-change",
      archivePath: archiveDir
    });
  });

  test("pending archive state resumes archive prompt for archived change", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] Implement endpoint
`, {
      findings: "---\nverdict: ready\ntype: final\ndate: 2026-05-29\n---\n"
    });

    const first = getNextPrompt(testTmpDir);
    const second = getNextPrompt(testTmpDir);

    expect(first.stage).toBe("archive");
    expect(second.stage).toBe("archive");
    expect(second.prompt).toContain(".flow-archive.json");
    expect(second.prompt).toContain("openspec/changes/archive");
  });

  test("approval blocker reports blocked gate stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] Implement endpoint
`, {
      designApproved: false
    });

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("design");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Design requires review");
  });
});
