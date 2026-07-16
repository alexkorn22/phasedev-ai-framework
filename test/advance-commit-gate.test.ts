import { describe, it, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { runArchive } from "../src/features/phase-control/archive-command";
import { buildChangePaths } from "../src/entities/change/paths";
import { readCommitLog, readFindingsBaseline } from "../src/entities/change/flow-state";
import { DEFAULT_CONFIG } from "../src/entities/config/config";

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-git-"));
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

function writeArtifact(filePath: string, body: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
}

function validPrdBody(): string {
  return `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep flow routing grounded in approved requirements. |
| Target state | Exercise the commit gate. |
| Risk boundaries | Test fixture only; no production risk. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | Route the flow according to approved artifacts. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | The expected stage prompt is rendered. | review |
`;
}

function validResearchBody(): string {
  return `# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | fix | not_applicable | prd-only | Classification comes from PRD. |
| Why | Keep flow routing grounded in approved requirements. | not_applicable | prd-only | User intent, not repository evidence. |
| Target state | Exercise the commit gate. | confirmed | F1 | Code fixture confirms routing. |
| Risk boundaries | Test fixture only; no production risk. | confirmed | F2 | Existing fixture tests cover the boundary. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | none | none |
| SC1 | confirmed | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/features/phase-control/advance-flow.ts:1\` | Missing research routes to the research stage. | R1 |
| F2 | code | \`test/advance-commit-gate.test.ts:1\` | Controller fixture asserts commit gate behavior. | SC1 |

## Research Gaps & Blockers

No non-blocking gaps.
`;
}

function validDesignBody(): string {
  return `# Design

## Executive Summary

| Area | Decision |
|---|---|
| Approval scope | Approve the fixture flow routing design. |
| Out of scope | Unrelated product behavior. |
| Key decision | D1 keeps routing grounded in approved artifacts. |
| Validation | Review evidence covers R1 and SC1. |

## Traceability Mapping

| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |
|---|---|---|---|---|
| R1 | F1 | D1 | Route selection uses approved artifacts as the design boundary. | Plan phase implements routing behavior. |
| SC1 | F2 | D1 | Prompt rendering remains the observable success path. | Plan checks verify prompt rendering. |

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point and approval summary for this design package. | approval snapshot, traceability map, decision table | high |

## Key Design Decisions

| Decision ID | Decision | Rationale | Applies To | Impacts |
|---|---|---|---|---|
| D1 | Keep routing driven by approved artifacts. | This preserves the positive PRD contract. | R1, SC1 | flow route, plan decomposition |

## Contracts, Interfaces & Boundaries

| Boundary | Contract | Applies To |
|---|---|---|
| Flow routing | The controller advances only when approved artifacts pass validation. | D1 |

## Risks & Open Questions
None.
`;
}

function iterationPlanBody(headingStatus: "~" | "x"): string {
  return `
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Exercise the commit gate fixture path. |
| Out of scope | Unrelated product behavior. |
| Sequencing risk | none |
| Validation | Use fixture unit, phase, and full commands. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Exercise the test fixture production path. |
| Tests | yes | Use fixture commands from execution_contract.md. |
| Docs/specs | not_applicable | No documentation behavior is part of this fixture. |
| Migrations | not_applicable | No persistence changes are part of this fixture. |
| Feature flags/rollout | not_applicable | No rollout controls are part of this fixture. |
| Observability | not_applicable | No observability changes are part of this fixture. |
| Rollback path | not_applicable | Revert the fixture change if needed. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Complete fixture phase. | 1.1 | unit |

## Iteration 1: Fixture Feature [${headingStatus}]
- [x] 1.1 Implement endpoint

### Goal

Complete the fixture phase. Satisfies R1 and SC1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | Fixture implementation area | R1, SC1, D1 |

### Tasks

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | passed unit tests |  |
`;
}

function validationFindings(verdict: "ready" | "repair_required" | "repaired", type: "iteration" | "final", rows = ""): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-29
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}

/**
 * Drives a fresh change directly to a passing iteration_validation(1) exit:
 * the plan's only iteration is already marked [x] (as applyStateSideEffects
 * would leave it) so resolveRoute's fallback resolves forward to
 * final_validation, matching the exact "passing exit" condition the commit
 * gate keys off (mirrors the manual `set-iteration-status` step in
 * test/e2e-flow.test.ts for the single-iteration case).
 */
function driveToIterationValidationExit(projectPath: string): string {
  const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeArtifact(path.join(changeDir, "execution_contract.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |

## Constraints
None.

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody());
  writeArtifact(path.join(changeDir, "iteration_plan.md"), iterationPlanBody("x"));
  fs.writeFileSync(path.join(changeDir, "validation_findings.md"), validationFindings("ready", "iteration"), "utf-8");

  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8"
  );

  return changeDir;
}

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

describe("advance commit gate", () => {
  it("refuses to advance out of a passing iteration_validation when the tree is dirty", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    driveToIterationValidationExit(repo);
    fs.writeFileSync(path.join(repo, "leftover.ts"), "x"); // uncommitted outside .phasedev

    const res = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });

    expect(res.ok).toBe(false);
    expect(res.message).toContain("Commit the iteration before advancing");
  });

  it("advances and records the boundary SHA when the tree is clean", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo);
    const head = gitCommitAll(repo, "iter1");

    const res = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });

    expect(res.ok).toBe(true);
    expect(res.newState?.activePhase).toBe("final_validation");
    expect(readCommitLog(buildChangePaths(changeDir).statePath)?.iterations["1"]).toBe(head);
  });

  it("does not gate when requireIterationCommit is false (still records boundary when a commit exists)", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo);
    const head = gitCommitAll(repo, "iter1");
    fs.writeFileSync(path.join(repo, "leftover.ts"), "x"); // dirty tree left on purpose

    const res = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: false });

    expect(res.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(changeDir).statePath)?.iterations["1"]).toBe(head);
  });

  it("does not gate in a non-git project", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-plain-")); dirs.push(plain);
    driveToIterationValidationExit(plain);

    const res = advanceFlow(plain, { ...DEFAULT_CONFIG, requireIterationCommit: true });

    expect(res.ok).toBe(true);
  });

  it("overwrites iterations[N] on a repair-cycle re-validation of iteration N", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo);
    const firstHead = gitCommitAll(repo, "iter1");

    const firstAdvance = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });
    expect(firstAdvance.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(changeDir).statePath)?.iterations["1"]).toBe(firstHead);

    // Simulate a repair cycle landing back on a fresh re-validation of the
    // same iteration: state returns to iteration_validation(1), findings
    // type reverts to "iteration" (the first advance promoted it to "final"),
    // and the repair commit produces a new HEAD.
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 1 }, null, 2) + "\n",
      "utf-8"
    );
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), validationFindings("ready", "iteration"), "utf-8");
    fs.writeFileSync(path.join(repo, "repair-fix.ts"), "x");
    const repairHead = gitCommitAll(repo, "repair fix");
    expect(repairHead).not.toBe(firstHead);

    const secondAdvance = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });

    expect(secondAdvance.ok).toBe(true);
    expect(readCommitLog(buildChangePaths(changeDir).statePath)?.iterations["1"]).toBe(repairHead);
  });

  it("refuses to archive when the tree is dirty, then archives once committed", () => {
    const repo = makeGitRepo(); dirs.push(repo);
    const changeDir = driveToIterationValidationExit(repo);
    gitCommitAll(repo, "iter1");

    const toFinalValidation = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });
    expect(toFinalValidation.ok).toBe(true);
    expect(toFinalValidation.newState?.activePhase).toBe("final_validation");

    const archiveMarkerPath = path.join(changeDir, ".phase-archive.json");
    const statePath = path.join(changeDir, "state.json");
    expect(readFindingsBaseline(statePath)).not.toBeNull();

    // advance now clean-completes at final_validation without mutating anything.
    const cleanComplete = advanceFlow(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true });
    expect(cleanComplete.ok).toBe(true);
    expect(cleanComplete.finished).toBe(true);
    expect(cleanComplete.message).toBe("Final validation passed. Flow complete.");
    expect(readFindingsBaseline(statePath)).not.toBeNull();
    expect(fs.existsSync(archiveMarkerPath)).toBe(false);
    expect(fs.existsSync(changeDir)).toBe(true);
    const stateAfterClean = JSON.parse(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8"));
    expect(stateAfterClean.activePhase).toBe("final_validation");

    fs.writeFileSync(path.join(repo, "leftover-final.ts"), "x"); // uncommitted outside .phasedev

    const blockedArchive = runArchive(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true }, "sample-change");

    expect(blockedArchive.ok).toBe(false);
    expect(blockedArchive.message).toContain("Final validation passed. Commit before archive.");
    expect(blockedArchive.message).toContain("phasedev(sample-change): final validation");
    // No archive mutation happened: the baseline survives, no archive marker
    // was created, the change dir was not moved, and state.json still locks
    // final_validation.
    expect(readFindingsBaseline(statePath)).not.toBeNull();
    expect(fs.existsSync(archiveMarkerPath)).toBe(false);
    expect(fs.existsSync(changeDir)).toBe(true);
    const stateAfterBlock = JSON.parse(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8"));
    expect(stateAfterBlock.activePhase).toBe("final_validation");

    gitCommitAll(repo, "final validation");

    const archiveAdvance = runArchive(repo, { ...DEFAULT_CONFIG, requireIterationCommit: true }, "sample-change");

    expect(archiveAdvance.ok).toBe(true);
    expect(archiveAdvance.started).toBe(true);
    expect(fs.existsSync(changeDir)).toBe(false);
  });
});
