import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { buildChangePaths } from "../src/entities/change/paths";
import { recordFinalGate } from "../src/features/artifact-ops/manage-gate-evidence";
import { addFinding, setFindingsVerdict } from "../src/features/artifact-ops/manage-findings";
import { validatePhase } from "../src/features/phase-control/phase-validators";
import { finalReadyGateIssues } from "../src/features/phase-control/final-gate-readiness";
import { passedBrowserGateEvidence, passedFullGateEvidence, validRulesBody } from "./helpers/fixtures";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("final-gate-readiness");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

function browserValidationTable(url = "http://localhost:3000/app"): string {
  return `## Browser Validation

| Field | Value |
|---|---|
| start | Open the app and wait for the shell to load. |
| url | ${url} |
| criteria | The dashboard renders with the primary navigation visible. |
`;
}

function validFindings(type: "iteration" | "final", verdict = "repaired"): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-07-04
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | resolved | RECOMMENDED | validation | 1 | Finding 1 | Fix 1 |`;
}

function iterationPlanBody(iterationStatus: "[x]" | "[~]" | "[ ]"): string {
  return `# Implementation Plan

## Approval Summary

| Field | Value |
|---|---|
| Approved | yes |

## Generation Bundle

| Artifact | Path |
|---|---|
| design | architecture/design.md |

## Iteration Overview

| Iteration | Status |
|---|---|
| 1 | API |

## Iteration 1: API ${iterationStatus}

### Tasks

- [x] 1.1 Implement endpoint
`;
}

function setupChange(
  contractBody: string,
  options: {
    findings?: string;
    activePhase?: string;
    gateEvidence?: string;
    iterationPlan?: string;
  } = {}
): string {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "execution_contract.md"), contractBody, "utf-8");
  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }
  if (options.gateEvidence) {
    fs.writeFileSync(path.join(changeDir, "final_gate_evidence.md"), options.gateEvidence, "utf-8");
  }
  if (options.iterationPlan) {
    fs.writeFileSync(path.join(changeDir, "iteration_plan.md"), options.iterationPlan, "utf-8");
  }
  if (options.activePhase) {
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: options.activePhase, activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );
  }
  return changeDir;
}

function gateIssuesMatchingFull(issues: string[]): boolean {
  return issues.some(issue => /full/i.test(issue));
}

function runCli(args: string[]): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args, "--project-path", testTmpDir],
    stdout: "pipe",
    stderr: "pipe"
  });
  return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
}

describe("finalReadyGateIssues", () => {
  test("requires a passed full gate row matching the execution contract", () => {
    const changeDir = setupChange(validRulesBody());
    const paths = buildChangePaths(changeDir);
    expect(finalReadyGateIssues(paths)).toEqual([expect.stringMatching(/full/i)]);
  });

  test("accepts a matching passed full gate row", () => {
    const changeDir = setupChange(validRulesBody(), {
      gateEvidence: passedFullGateEvidence("bun test full")
    });
    const paths = buildChangePaths(changeDir);
    expect(finalReadyGateIssues(paths)).toEqual([]);
  });
});

describe("set-verdict final gate enforcement", () => {
  test("set-verdict ready on final with no evidence file fails and leaves verdict unchanged", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation"
    });
    const findingsPath = path.join(changeDir, "validation_findings.md");
    const before = fs.readFileSync(findingsPath, "utf-8");

    const result = runCli(["set-verdict", "ready"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/full/i);
    expect(fs.readFileSync(findingsPath, "utf-8")).toBe(before);
  });

  test("set-verdict ready_with_risks on final with no evidence file fails and leaves verdict unchanged", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation"
    });
    const findingsPath = path.join(changeDir, "validation_findings.md");
    const before = fs.readFileSync(findingsPath, "utf-8");

    const result = runCli(["set-verdict", "ready_with_risks"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/full/i);
    expect(fs.readFileSync(findingsPath, "utf-8")).toBe(before);
  });

  test("set-verdict ready succeeds after record-gate full passed when browser section is absent", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation"
    });
    const paths = buildChangePaths(changeDir);
    expect(recordFinalGate(paths, "full", "passed", "12 passed, 0 failed").ok).toBe(true);

    const result = runCli(["set-verdict", "ready"]);
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(paths.findingsPath, "utf-8")).toContain("verdict: ready");
  });

  test("set-verdict ready succeeds when browser validation is present and both gates passed", () => {
    const changeDir = setupChange(`${validRulesBody()}\n${browserValidationTable()}`, {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation",
      gateEvidence: passedBrowserGateEvidence("http://localhost:3000/app", "bun test full")
    });

    const result = runCli(["set-verdict", "ready"]);
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(changeDir, "validation_findings.md"), "utf-8")).toContain("verdict: ready");
  });

  test("set-verdict ready fails when browser validation is present but only full gate passed", () => {
    const changeDir = setupChange(`${validRulesBody()}\n${browserValidationTable()}`, {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation",
      gateEvidence: passedFullGateEvidence("bun test full")
    });

    const result = runCli(["set-verdict", "ready"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/browser/i);
  });

  test("set-verdict ready fails when full gate result is blocked", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation"
    });
    const paths = buildChangePaths(changeDir);
    expect(recordFinalGate(paths, "full", "blocked", "command unavailable").ok).toBe(true);

    const result = runCli(["set-verdict", "ready"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/full/i);
  });

  test("set-verdict repair_required still works without gate rows", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "repaired"),
      activePhase: "final_validation"
    });
    const paths = buildChangePaths(changeDir);
    expect(
      addFinding(
        paths.findingsPath,
        "F2",
        "Missing coverage",
        "MUST-FIX",
        "Add final validation coverage",
        "validation",
        "Final"
      ).ok
    ).toBe(true);

    const result = runCli(["set-verdict", "repair_required"]);
    expect(result.exitCode).toBe(0);
    expect(fs.readFileSync(paths.findingsPath, "utf-8")).toContain("verdict: repair_required");
  });

  test("iteration set-verdict ready does not require final_gate_evidence.md", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("iteration", "repaired"),
      activePhase: "iteration_validation"
    });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    const result = runCli(["set-verdict", "ready"]);
    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(path.join(changeDir, "final_gate_evidence.md"))).toBe(false);
  });
});

describe("validatePhase final_validation gate enforcement", () => {
  test("validatePhase reports gate issues when verdict is ready without gate evidence", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "ready")
    });
    const paths = buildChangePaths(changeDir);
    const result = validatePhase(testTmpDir, "final_validation", paths, null);
    expect(result.ok).toBe(false);
    expect(gateIssuesMatchingFull(result.issues)).toBe(true);
  });

  test("validatePhase skips gate issues when ready verdict has incomplete iteration plan", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "ready"),
      iterationPlan: iterationPlanBody("[~]")
    });
    const paths = buildChangePaths(changeDir);
    const result = validatePhase(testTmpDir, "final_validation", paths, null);
    expect(gateIssuesMatchingFull(result.issues)).toBe(false);
  });

  test("validatePhase reports gate issues when ready verdict and all iterations are complete", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "ready"),
      iterationPlan: iterationPlanBody("[x]")
    });
    const paths = buildChangePaths(changeDir);
    const result = validatePhase(testTmpDir, "final_validation", paths, null);
    expect(gateIssuesMatchingFull(result.issues)).toBe(true);
  });

  test("check-validation final skips gate issues when ready verdict has incomplete iteration plan", () => {
    setupChange(validRulesBody(), {
      findings: validFindings("final", "ready"),
      iterationPlan: iterationPlanBody("[~]")
    });

    const result = runCli(["check-validation", "--scope", "final"]);
    expect(result.output).not.toMatch(/Final gate `full`/i);
  });

  test("check-validation final reports gate issues when ready verdict and all iterations are complete", () => {
    setupChange(validRulesBody(), {
      findings: validFindings("final", "ready"),
      iterationPlan: iterationPlanBody("[x]")
    });

    const result = runCli(["check-validation", "--scope", "final"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/Final gate `full`/i);
  });

  test("setFindingsVerdict direct call bypasses gate enforcement", () => {
    const changeDir = setupChange(validRulesBody(), {
      findings: validFindings("final", "repaired")
    });
    const paths = buildChangePaths(changeDir);
    expect(setFindingsVerdict(paths.findingsPath, "ready", { type: "final", date: "2026-07-04" }).ok).toBe(true);
  });
});
