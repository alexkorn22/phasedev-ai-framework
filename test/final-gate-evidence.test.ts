import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { buildChangePaths, ChangePaths } from "../src/entities/change/paths";
import { parseFinalGateEvidence } from "../src/entities/final-gate-evidence/parse-final-gate-evidence";
import { recordFinalGate, resetFinalGateEvidence } from "../src/features/artifact-ops/manage-gate-evidence";
import { enterValidationPhase } from "../src/features/phase-control/normalize-validation-state";
import { validRulesBody } from "./helpers/fixtures";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("final-gate-evidence");
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


function setupPaths(contractBody: string, options: { findings?: string } = {}): ChangePaths {
  const changeDir = path.join(testTmpDir, "change");
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "execution_contract.md"), contractBody, "utf-8");
  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }
  return buildChangePaths(changeDir);
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

describe("recordFinalGate", () => {
  test("records full gate with matching command into final_gate_evidence.md", () => {
    const paths = setupPaths(validRulesBody());
    const result = recordFinalGate(paths, "full", "passed", "12 passed, 0 failed", "bun test full");
    expect(result.ok).toBe(true);

    const artifact = parseFinalGateEvidence(paths.finalGateEvidencePath);
    expect(artifact.exists).toBe(true);
    expect(artifact.rows).toEqual([
      {
        gate: "full",
        result: "passed",
        command: "bun test full",
        evidence: "12 passed, 0 failed"
      }
    ]);
  });

  test("records full gate using contract command when --command is omitted", () => {
    const paths = setupPaths(validRulesBody());
    const result = recordFinalGate(paths, "full", "passed", "12 passed, 0 failed");
    expect(result.ok).toBe(true);

    const artifact = parseFinalGateEvidence(paths.finalGateEvidencePath);
    expect(artifact.rows[0]?.command).toBe("bun test full");
  });

  test("refuses full gate when command does not match contract and leaves file unchanged", () => {
    const paths = setupPaths(validRulesBody());
    const result = recordFinalGate(paths, "full", "passed", "12 passed, 0 failed", "bun test wrong");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("command");
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(false);
  });

  test("refuses browser gate when Browser Validation section is absent", () => {
    const paths = setupPaths(validRulesBody());
    const result = recordFinalGate(paths, "browser", "passed", "UI verified manually");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Browser Validation section is absent; do not record a browser gate.");
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(false);
  });

  test("records browser gate with section url as stored command", () => {
    const paths = setupPaths(`${validRulesBody()}\n\n${browserValidationTable("http://localhost:4173/login")}`);
    const result = recordFinalGate(paths, "browser", "passed", "Login form renders and accepts input.");
    expect(result.ok).toBe(true);

    const artifact = parseFinalGateEvidence(paths.finalGateEvidencePath);
    expect(artifact.rows).toEqual([
      {
        gate: "browser",
        result: "passed",
        command: "http://localhost:4173/login",
        evidence: "Login form renders and accepts input."
      }
    ]);
  });

  test("refuses browser gate when optional command mismatches url", () => {
    const paths = setupPaths(`${validRulesBody()}\n\n${browserValidationTable("http://localhost:4173/login")}`);
    const result = recordFinalGate(
      paths,
      "browser",
      "passed",
      "Login form renders and accepts input.",
      "http://localhost:3000/other"
    );
    expect(result.ok).toBe(false);
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(false);
  });

  test("overwrites the same gate row while preserving the other gate", () => {
    const paths = setupPaths(`${validRulesBody()}\n\n${browserValidationTable()}`);
    expect(recordFinalGate(paths, "full", "passed", "first full run", "bun test full").ok).toBe(true);
    expect(recordFinalGate(paths, "browser", "passed", "browser ok").ok).toBe(true);
    expect(recordFinalGate(paths, "full", "failed", "second full run", "bun test full").ok).toBe(true);

    const artifact = parseFinalGateEvidence(paths.finalGateEvidencePath);
    expect(artifact.rows).toHaveLength(2);
    expect(artifact.rows.find(row => row.gate === "full")).toEqual({
      gate: "full",
      result: "failed",
      command: "bun test full",
      evidence: "second full run"
    });
    expect(artifact.rows.find(row => row.gate === "browser")?.result).toBe("passed");
  });
});

describe("resetFinalGateEvidence", () => {
  test("deletes final_gate_evidence.md when present", () => {
    const paths = setupPaths(validRulesBody());
    expect(recordFinalGate(paths, "full", "passed", "12 passed, 0 failed").ok).toBe(true);
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(true);

    resetFinalGateEvidence(paths.finalGateEvidencePath);
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(false);
    expect(parseFinalGateEvidence(paths.finalGateEvidencePath)).toEqual({ exists: false, rows: [] });
  });
});

describe("enterValidationPhase gate evidence reset", () => {
  test("deletes existing final_gate_evidence.md when entering final_validation", () => {
    const paths = setupPaths(validRulesBody(), { findings: validFindings("final", "repaired") });
    expect(recordFinalGate(paths, "full", "passed", "12 passed, 0 failed").ok).toBe(true);
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(true);

    const result = enterValidationPhase(paths, "final_validation");
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(false);
    expect(result.notes.some(note => note.includes("final_gate_evidence"))).toBe(true);
  });

  test("does not delete final_gate_evidence.md when entering iteration_validation", () => {
    const paths = setupPaths(validRulesBody(), { findings: validFindings("iteration", "repaired") });
    expect(recordFinalGate(paths, "full", "passed", "12 passed, 0 failed").ok).toBe(true);

    const result = enterValidationPhase(paths, "iteration_validation");
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(true);
    expect(result.notes.some(note => note.includes("final_gate_evidence"))).toBe(false);
  });

  test("reports changed false when no evidence file exists and verdict is repaired", () => {
    const paths = setupPaths(validRulesBody(), { findings: validFindings("final", "repaired") });
    const result = enterValidationPhase(paths, "final_validation");
    expect(result.changed).toBe(false);
    expect(fs.existsSync(paths.finalGateEvidencePath)).toBe(false);
  });
});
