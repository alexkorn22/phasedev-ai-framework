import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";
import { createChange } from "../src/features/phase-control/create-change";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { resolveRoute } from "../src/features/phase-control/flow-route";
import { checkValidationCompletion } from "../src/features/phase-control/check-flow";
import { loadFlowState } from "../src/entities/change/flow-state";
import { loadConfig, Config } from "../src/entities/config/config";
import { approveArtifact } from "../src/features/artifact-ops/approve-artifact";
import { setIterationStatus } from "../src/features/iteration-ops/set-iteration-status";
import { addFinding, resolveFinding, setFindingsVerdict } from "../src/features/artifact-ops/manage-findings";
import { findPendingArchiveState } from "../src/entities/change/archive-state";
import { listChanges } from "../src/features/flow-status/list-changes";
import { buildChangePaths, archiveRootPath } from "../src/entities/change/paths";
import { syncState } from "../src/features/phase-control/sync-state";

let testTmpDir: string;
const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

function run(args: string[]): { code: number; out: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args, "--project-path", testTmpDir],
    stdout: "pipe",
    stderr: "pipe"
  });
  return { code: result.exitCode, out: result.stdout.toString() + result.stderr.toString() };
}

function state(): { activePhase: string; activeIteration: number | null } | null {
  const dirs = fs.readdirSync(path.join(testTmpDir, ".phasedev", "changes"), { withFileTypes: true })
    .filter(d => d.isDirectory());
  for (const dir of dirs) {
    const statePath = path.join(testTmpDir, ".phasedev", "changes", dir.name, "state.json");
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, "utf-8"));
    }
  }
  const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive");
  if (fs.existsSync(archiveDir)) {
    const archiveDirs = fs.readdirSync(archiveDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of archiveDirs) {
      const statePath = path.join(archiveDir, dir.name, "state.json");
      if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, "utf-8"));
      }
    }
  }
  return null;
}

function changeDir(): string {
  const dirs = fs.readdirSync(path.join(testTmpDir, ".phasedev", "changes"), { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== "archive");
  return dirs.length > 0
    ? path.join(testTmpDir, ".phasedev", "changes", dirs[0].name)
    : "";
}

// The current phase's artifacts already satisfy the flow, so the artifact-derived
// route has moved ahead of the still-locked state.json — check grades that ahead
// phase (whose own artifacts don't exist yet) and points the agent at `advance`.
function expectCheckSignalsReadyToAdvance(): void {
  const result = run(["check"]);
  expect(result.code).toBe(1);
  expect(result.out).toContain("run `phasedev advance`");
}

function simulateAgent(file: string, body: string, approved = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (approved) {
    fs.writeFileSync(file, `---\napproved: true\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(file, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf-8");
}

// -----------------------------------------------------------------------
// Shared full-lifecycle artifact fixtures, reused by the single-change
// happy-path e2e and the paired multi-change e2e below.
// -----------------------------------------------------------------------

function makePrdBody(params: { why: string; targetState: string; requirement: string; criterion: string }): string {
  return `\
# PRD

## Intent

| Field | Value |
|---|---|
| Change type | feature |
| Why | ${params.why} |
| Target state | ${params.targetState} |
| Risk boundaries | None beyond normal project risk |

## Requirements

| ID | Requirement |
|---|---|
| R1 | ${params.requirement} |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | ${params.criterion} | full |
`;
}

function makeExecutionContractBody(): string {
  return `\
# Rules

## Test Commands

| Gate | Command |
|---|---|
| unit | \`echo unit\` |
| phase | \`echo phase\` |
| full | \`echo full\` |

## Constraints

No special constraints.

## Verification Gates

Standard verification gates.

## Manual Checks

None required.

## Environment Notes

None.
`;
}

function makeResearchFactsBody(params: { why: string; targetState: string }): string {
  return `\
# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | feature | not_applicable | prd-only | n/a |
| Why | ${params.why} | not_applicable | prd-only | n/a |
| Target state | ${params.targetState} | confirmed | F1 | n/a |
| Risk boundaries | None beyond normal project risk | confirmed | F1 | n/a |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | not_applicable | none |
| SC1 | confirmed | F1 | not_applicable | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | test/e2e-flow.test.ts:1 | E2E test verifies full flow | R1, SC1 |

## Research Gaps & Blockers

No non-blocking gaps.
`;
}

function makeDesignBody(): string {
  return `\
---
approved: false
approved_by: ""
date: 2026-07-06
---
# Design

## Executive Summary

| Area | Decision |
|---|---|
| Approval scope | Full flow E2E |
| Out of scope | None |
| Key decision | Use minimal valid content |
| Reviewer attention | Verify hash computation |
| Validation | full |

## Traceability Mapping

| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |
|---|---|---|---|---|
| R1 | F1 | D1 | Full | Iteration 1 |
| SC1 | not_applicable:test | D1 | Full | Iteration 1 |

## Architecture Package Map

| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point and approval summary for this design package. | approval summary, package map | high |

## Key Design Decisions

| Decision ID | Decision | Rationale | Applies To | Impacts |
|---|---|---|---|---|
| D1 | Execute full flow | Validate end-to-end | R1 | Iteration 1 |

## Contracts, Interfaces & Boundaries

| Boundary | Contract | Applies To |
|---|---|---|
| E2E flow | Complete without re-approvals | D1 |

## Risks & Open Questions

None.
`;
}

function makeIterationPlanBody(): string {
  return `\
---
approved: false
approved_by: ""
date: 2026-07-06
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Full E2E flow |
| Out of scope | Nothing |
| Sequencing risk | none |
| Validation | full |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | no | No code changes needed |
| Tests | yes | E2E test verifies flow |
| Docs/specs | no | No docs needed |
| Migrations | no | No migrations needed |
| Feature flags/rollout | no | No feature flags needed |
| Observability | no | No observability changes |
| Rollback path | no | No rollback needed |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| 1 | Complete flow | Go through all phases | unit |

## Iteration 1: Full Flow [ ]

### Goal

Complete the full PhaseDev flow.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| .phasedev/ | create | test | R1, SC1, D1 |

### Tasks

- [ ] 1.1 Execute full flow through all phases

### Checks

- unit: \`echo unit\`

Additional checks:

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`echo unit\` | pending |  |  |
`;
}

function markIterationOneDone(planContent: string): string {
  return planContent
    .replace("- [ ] 1.1 Execute full flow", "- [x] 1.1 Execute full flow")
    .replace(
      "| unit | `echo unit` | pending |  |  |",
      "| unit | `echo unit` | passed | All tasks completed |  |",
    );
}

function makeValidationFindingsBody(verdict: string, type: string): string {
  return `\
---\n\
verdict: ${verdict}\n\
type: ${type}\n\
date: 2026-07-06\n\
---\n
| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n\
|---|---|---|---|---|---|---|---|\n\
`;
}

interface LifecycleFixture {
  why: string;
  targetState: string;
  requirement: string;
  criterion: string;
}

/**
 * One closure per phase transition, driving a single change from
 * change_intake all the way to the archive move (7 steps total). Used to
 * interleave two changes' lifecycles step-by-step in the paired
 * multi-change e2e below.
 */
function buildLifecycleSteps(root: string, config: Config, name: string, fixture: LifecycleFixture): Array<() => void> {
  const changeDir = path.join(root, ".phasedev", "changes", name);
  const paths = buildChangePaths(changeDir);

  return [
    // 1. change_intake -> code_research
    () => {
      simulateAgent(paths.prdPath, makePrdBody(fixture), true);
      simulateAgent(paths.executionContractPath, makeExecutionContractBody(), true);
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("code_research");
    },
    // 2. code_research -> technical_design
    () => {
      writeFile(paths.researchPath, makeResearchFactsBody(fixture));
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("technical_design");
    },
    // 3. technical_design -> iteration_planning
    () => {
      writeFile(paths.designPath, makeDesignBody());
      approveArtifact(paths.designPath, "test");
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("iteration_planning");
    },
    // 4. iteration_planning -> implementation
    () => {
      writeFile(paths.iterationPlanPath, makeIterationPlanBody());
      approveArtifact(paths.iterationPlanPath, "test");
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("implementation");
      expect(result.newState?.activeIteration).toBe(1);
    },
    // 5. implementation -> iteration_validation
    () => {
      const planContent = markIterationOneDone(fs.readFileSync(paths.iterationPlanPath, "utf-8"));
      writeFile(paths.iterationPlanPath, planContent);
      approveArtifact(paths.iterationPlanPath, "test");
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("iteration_validation");
    },
    // 6. iteration_validation -> final_validation
    () => {
      writeFile(paths.findingsPath, makeValidationFindingsBody("ready", "iteration"));
      expect(setIterationStatus(root, 1, "completed", undefined, name).ok).toBe(true);
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("final_validation");
    },
    // 7. final_validation -> archive (mutates: moves change dir into archive/)
    () => {
      writeFile(paths.findingsPath, makeValidationFindingsBody("ready", "final"));
      const result = advanceFlow(root, config, name);
      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("archive");
    },
  ];
}

function archiveDirFor(root: string, name: string): string {
  const archiveRoot = archiveRootPath(root);
  const match = fs.readdirSync(archiveRoot).find(entry => entry.endsWith(`-${name}`));
  if (!match) throw new Error(`No archive directory found for change "${name}" under ${archiveRoot}`);
  return path.join(archiveRoot, match);
}

function completeArchive(archiveDir: string): void {
  const statePath = path.join(archiveDir, ".phase-archive.json");
  const current = JSON.parse(fs.readFileSync(statePath, "utf-8"));
  current.status = "completed";
  current.completedAt = new Date().toISOString();
  writeFile(statePath, JSON.stringify(current, null, 2) + "\n");
}

describe("E2E flow via CLI subprocess", () => {
  beforeEach(() => {
    testTmpDir = createTempWorkspace("e2e-flow");
  });

  afterEach(() => {
    cleanupTempWorkspace(testTmpDir);
  });

  // ── K: Deprecated next ─────────────────────────────────────

  test("next is deprecated — shows warning and exits 0", () => {
    const result = run(["next"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("next");
    expect(result.out).toContain("deprecated");
    expect(result.out).toContain("phase");
    expect(result.out).toContain("advance");
  });

  // ── A: create-change ───────────────────────────────────────

  test("create-change works — creates state.json with initial phase", () => {
    const result = run(["create-change", "my-change"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("Created change");

    const statePath = path.join(testTmpDir, ".phasedev", "changes", "my-change", "state.json");
    expect(fs.existsSync(statePath)).toBe(true);

    const st = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    expect(st.activePhase).toBe("change_intake");
    expect(st.activeIteration).toBeNull();
  });

  test("create-change accepts the name after option flags, as documented", () => {
    const result = run(["create-change", "--project-path", testTmpDir, "flag-first-change"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("Created change flag-first-change");
  });

  test("create-change refuses duplicate", () => {
    run(["create-change", "my-change"]);
    const result = run(["create-change", "my-change"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("already exists");
  });

  // ── B: phase ───────────────────────────────────────────────

  test("phase prints contract after create-change", () => {
    run(["create-change", "my-change"]);

    const result = run(["phase"]);

    expect(result.code).toBe(0);
    expect(result.out).toContain("Phase 1.");
    expect(result.out).toContain("Change Intake");
  });

  test("phase without state.json shows blocker", () => {
    const result = run(["phase"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("No active change");
  });

  test("phase is idempotent — same output on repeated calls", () => {
    run(["create-change", "my-change"]);

    const a = run(["phase"]).out;
    const b = run(["phase"]).out;

    expect(a).toEqual(b);
  });

  // ── C: check ───────────────────────────────────────────────

  test("check without artifacts shows issues", () => {
    run(["create-change", "my-change"]);
    const result = run(["check"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("has issues");
  });

  test("check without state.json fails", () => {
    const result = run(["check"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("No active change");
  });

  test("check --phase unknown fails", () => {
    run(["create-change", "my-change"]);
    const result = run(["check", "--phase", "nonsense"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("Unknown phase");
  });

  // ── D: advance ─────────────────────────────────────────────

  test("advance refuses when artifacts are invalid", () => {
    run(["create-change", "my-change"]);

    const result = run(["advance"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("Cannot leave phase");
  });

  test("advance refuses without state.json", () => {
    const result = run(["advance"]);

    expect(result.code).toBe(1);
    expect(result.out).toContain("No .phasedev directory found at");
  });

  // ── E2E: Partial smoke — create, phase, check, advance ─────

  test("E2E: create → phase → check → advance (approval block)", () => {
    run(["create-change", "feature-x"]);
    const dir = changeDir();
    expect(dir).not.toBe("");

    // phase should print contract
    expect(run(["phase"]).code).toBe(0);

    // check should fail — no artifacts yet
    expect(run(["check"]).code).toBe(1);

    // advance should refuse
    const adv = run(["advance"]);
    expect(adv.code).toBe(1);
    expect(adv.out).toContain("Cannot leave phase");
  });

  // ── E2E: Full happy-path flow without re-approvals ────────

  test("E2E: Full happy-path flow without re-approvals", () => {
    // -----------------------------------------------------------------------
    // 1. Init project and create change
    // -----------------------------------------------------------------------
    expect(run(["init-project"]).code).toBe(0);
    expect(run(["create-change", "test-flow"]).code).toBe(0);
    let st = state();
    expect(st?.activePhase).toBe("change_intake");

    // -----------------------------------------------------------------------
    // 2. Phase 1: change_intake — prd.md + execution_contract.md
    // -----------------------------------------------------------------------
    const cdir = changeDir();
    expect(cdir).not.toBe("");

    const prdBody = makePrdBody({
      why: "Verify the full flow without re-approvals",
      targetState: "Flow completes from start to archive",
      requirement: "The system must pass through all phases without re-approvals",
      criterion: "Full flow completes in one pass",
    });

    const ecBody = makeExecutionContractBody();

    const prdPath = path.join(cdir, "prd.md");
    const ecPath = path.join(cdir, "execution_contract.md");

    simulateAgent(prdPath, prdBody, true);
    simulateAgent(ecPath, ecBody, true);

    // check now grades the artifact-derived route, which is already ahead of
    // the still-locked change_intake state — it reports that and points to advance
    expectCheckSignalsReadyToAdvance();

    // advance should work — goes to code_research
    const adv1 = run(["advance"]);
    expect(adv1.code).toBe(0);
    expect(adv1.out).toContain("code_research");
    st = state();
    expect(st?.activePhase).toBe("code_research");

    // -----------------------------------------------------------------------
    // 3. Phase 2: code_research — research_facts.md
    // -----------------------------------------------------------------------
    const researchBody = makeResearchFactsBody({
      why: "Verify the full flow without re-approvals",
      targetState: "Flow completes from start to archive",
    });
    const researchPath = path.join(cdir, "research_facts.md");
    writeFile(researchPath, researchBody);

    expectCheckSignalsReadyToAdvance();

    const adv2 = run(["advance"]);
    expect(adv2.code).toBe(0);
    expect(adv2.out).toContain("technical_design");
    st = state();
    expect(st?.activePhase).toBe("technical_design");

    // -----------------------------------------------------------------------
    // 4. Phase 3: technical_design — architecture/design.md
    // -----------------------------------------------------------------------
    const designBody = makeDesignBody();
    const designPath = path.join(cdir, "architecture", "design.md");
    // Write without approval in frontmatter; approve via CLI below
    writeFile(designPath, designBody);

    // Approve via CLI
    const approveDesign = run(["approve", designPath]);
    expect(approveDesign.code).toBe(0);

    expectCheckSignalsReadyToAdvance();

    const adv3 = run(["advance"]);
    expect(adv3.code).toBe(0);
    expect(adv3.out).toContain("iteration_planning");
    st = state();
    expect(st?.activePhase).toBe("iteration_planning");

    // -----------------------------------------------------------------------
    // 5. Phase 4: iteration_planning — iteration_plan.md
    // -----------------------------------------------------------------------
    const planBody = makeIterationPlanBody();
    const planPath = path.join(cdir, "iteration_plan.md");
    writeFile(planPath, planBody);

    // Approve plan via CLI
    const approvePlan = run(["approve", planPath]);
    expect(approvePlan.code).toBe(0);

    expectCheckSignalsReadyToAdvance();

    const adv4 = run(["advance"]);
    expect(adv4.code).toBe(0);
    expect(adv4.out).toContain("implementation");
    st = state();
    expect(st?.activePhase).toBe("implementation");
    expect(st?.activeIteration).toBe(1);

    // After advance, iteration 1 should be [~] (in_progress)
    const planAfterAdvance = fs.readFileSync(planPath, "utf-8");
    expect(planAfterAdvance).toMatch(/## Iteration 1: Full Flow \[~\].*/);

    // -----------------------------------------------------------------------
    // 6. Phase 5: implementation — mark tasks done, update check evidence
    // -----------------------------------------------------------------------
    // Read current plan, update task [ ] -> [x], check evidence pending -> passed with non-empty evidence
    const planContent = markIterationOneDone(fs.readFileSync(planPath, "utf-8"));
    writeFile(planPath, planContent);

    // Re-approve the plan after body edits
    const reapprovePlan = run(["approve", planPath]);
    expect(reapprovePlan.code).toBe(0);

    expectCheckSignalsReadyToAdvance();

    const adv5 = run(["advance"]);
    expect(adv5.code).toBe(0);
    expect(adv5.out).toContain("iteration_validation");
    st = state();
    expect(st?.activePhase).toBe("iteration_validation");
    expect(st?.activeIteration).toBe(1);

    // -----------------------------------------------------------------------
    // 7. Phase 6a: iteration_validation — validation_findings.md
    // -----------------------------------------------------------------------
    const ivFindingsBody = makeValidationFindingsBody("ready", "iteration");
    const findingsPath = path.join(cdir, "validation_findings.md");
    writeFile(findingsPath, ivFindingsBody);

    // Mark iteration 1 as [x] (completed) so resolveRoute can move past it
    const setIterStatus = run(["set-iteration-status", "1", "x"]);
    expect(setIterStatus.code).toBe(0);

    expectCheckSignalsReadyToAdvance();

    const adv6 = run(["advance"]);
    expect(adv6.code).toBe(0);
    expect(adv6.out).toContain("final_validation");
    st = state();
    expect(st?.activePhase).toBe("final_validation");

    // -----------------------------------------------------------------------
    // 8. Phase 6b: final_validation — update validation_findings.md
    // -----------------------------------------------------------------------
    const fvFindingsBody = makeValidationFindingsBody("ready", "final");
    writeFile(findingsPath, fvFindingsBody);

    expectCheckSignalsReadyToAdvance();

    const adv7 = run(["advance"]);
    expect(adv7.code).toBe(0);
    expect(adv7.out).toContain("archive");
    st = state();
    expect(st?.activePhase).toBe("archive");

    // ===================================================================
    // Find the archive directory
    // ===================================================================
    const archiveRoot = path.join(testTmpDir, ".phasedev", "changes", "archive");
    expect(fs.existsSync(archiveRoot)).toBe(true);
    const archiveDirs = fs.readdirSync(archiveRoot).filter(d =>
      fs.statSync(path.join(archiveRoot, d)).isDirectory()
    );
    expect(archiveDirs.length).toBe(1);
    const archivePathName = archiveDirs[0];
    const fullArchivePath = path.join(archiveRoot, archivePathName);

    // Verify state.json is in the archive dir
    const archiveStatePath = path.join(fullArchivePath, "state.json");
    expect(fs.existsSync(archiveStatePath)).toBe(true);
    const stArchive = JSON.parse(fs.readFileSync(archiveStatePath, "utf-8"));
    expect(stArchive.activePhase).toBe("archive");

    // -----------------------------------------------------------------------
    // 9. Phase 7: archive — complete the archive
    // -----------------------------------------------------------------------
    // Write delta specs
    const specsDir = path.join(fullArchivePath, "specs", "e2e-flow");
    fs.mkdirSync(specsDir, { recursive: true });
    const specContent = `\
## ADDED Requirements

### Requirement: E2E flow must complete

The E2E flow SHALL complete without re-approvals.
`;
    writeFile(path.join(specsDir, "spec.md"), specContent);

    // Complete the archive state (status -> completed)
    const archiveStateFilePath = path.join(fullArchivePath, ".phase-archive.json");
    const currentArchiveState = JSON.parse(fs.readFileSync(archiveStateFilePath, "utf-8"));
    currentArchiveState.status = "completed";
    currentArchiveState.completedAt = new Date().toISOString();
    writeFile(archiveStateFilePath, JSON.stringify(currentArchiveState, null, 2) + "\n");

    // Verify archive completion via check-archive (uses explicit path, bypassing loadFlowState)
    const archiveCheck = run(["check-archive", "--archive-path", fullArchivePath]);
    expect(archiveCheck.code).toBe(0);
    expect(archiveCheck.out).toContain("OK");

    // ===================================================================
    // Final verification — also verify files directly
    // ===================================================================
    const finalArchiveState = JSON.parse(fs.readFileSync(archiveStateFilePath, "utf-8"));
    expect(finalArchiveState.status).toBe("completed");
    expect(finalArchiveState.completedAt).toBeTruthy();
    expect(typeof finalArchiveState.completedAt).toBe("string");
  });

});

// ── E2E: Repaired finding re-validation reaches archive (final scope) ──

describe("repaired finding re-validation e2e", () => {
  let root: string;

  beforeEach(() => {
    root = createTempWorkspace("repaired-revalidation-e2e");
  });

  afterEach(() => {
    cleanupTempWorkspace(root);
  });

  test("final-scope repaired finding re-validates and reaches archive without manual type edit", () => {
    // Arrange: drive the change up to final_validation with all iterations
    // [x]. buildLifecycleSteps' final_validation entry (step index 5)
    // already promotes validation_findings.md to `type: final` via
    // advanceFlow's setFindingsType side effect — no manual type edit.
    expect(createChange(root, "repair-e2e").ok).toBe(true);
    const config = loadConfig();

    const steps = buildLifecycleSteps(root, config, "repair-e2e", {
      why: "Verify a repaired final finding re-validates and reaches archive",
      targetState: "Flow reaches archive_ready without a manual type edit",
      requirement: "A repaired final finding must route back to final_validation for re-validation",
      criterion: "resolveRoute reaches archive_ready after re-validation",
    });
    for (let i = 0; i < 6; i++) steps[i]();

    const changeDir = path.join(root, ".phasedev", "changes", "repair-e2e");
    const paths = buildChangePaths(changeDir);

    let st = loadFlowState(root, "repair-e2e");
    expect(st?.activePhase).toBe("final_validation");
    expect(st?.repairCycleCount).toBe(0);

    let findingsContent = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(findingsContent).toContain("type: final");
    expect(findingsContent).not.toContain("type: iteration");

    // 1. Add a blocking Final finding -> verdict flips to repair_required.
    const added = addFinding(paths.findingsPath, null, "Late defect found in final validation", "MUST-FIX", "Fix the defect", "validation", "Final");
    expect(added.ok).toBe(true);
    findingsContent = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(findingsContent).toContain("verdict: repair_required");
    expect(findingsContent).toContain("type: final");

    // 2. advance -> finding_repair.
    const toRepair = advanceFlow(root, config, "repair-e2e");
    expect(toRepair.ok).toBe(true);
    expect(toRepair.newState?.activePhase).toBe("finding_repair");
    expect(toRepair.newState?.repairCycleCount).toBe(1);

    // 3. resolveFinding(F1) closes the only open blocking row -> verdict
    // auto-flips repair_required -> repaired (Task 1).
    const resolved = resolveFinding(paths.findingsPath, "F1", "Fixed the defect in src/x.ts; bun test x -> pass");
    expect(resolved.ok).toBe(true);
    expect(resolved.message).toContain("verdict updated to repaired (re-validation pending)");
    findingsContent = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(findingsContent).toContain("verdict: repaired");
    expect(findingsContent).toContain("type: final");

    // 4. advance -> back to final_validation (Task 4 routes repaired+final
    // straight to final_validation); repairCycleCount is preserved, not reset.
    const toRevalidation = advanceFlow(root, config, "repair-e2e");
    expect(toRevalidation.ok).toBe(true);
    expect(toRevalidation.newState?.activePhase).toBe("final_validation");
    expect(toRevalidation.newState?.repairCycleCount).toBe(1);

    // 5. check-validation --scope final reports re-validation pending (Task 3),
    // rather than a type deadlock or a false pass.
    const revalidationCheck = checkValidationCompletion(root, { scope: "final" }, "repair-e2e");
    expect(revalidationCheck.ok).toBe(false);
    expect(revalidationCheck.message).toContain("Re-validation pending: verdict is `repaired`.");

    // 6. Re-validation sets a terminal verdict.
    const verdictSet = setFindingsVerdict(paths.findingsPath, "ready_with_risks", { type: "final", date: "2026-07-13" });
    expect(verdictSet.ok).toBe(true);
    findingsContent = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(findingsContent).toContain("verdict: ready_with_risks");
    expect(findingsContent).toContain("type: final");
    expect(findingsContent).not.toContain("type: iteration");

    // 7. resolveRoute now resolves to archive_ready, with no manual type edit
    // ever having been applied to validation_findings.md.
    const finalRoute = resolveRoute(root, "repair-e2e");
    expect(finalRoute.kind).toBe("archive_ready");

    st = loadFlowState(root, "repair-e2e");
    expect(st?.activePhase).toBe("final_validation");
  });
});

// ── E2E: Scope change after final validation un-wedges the flow ──

describe("stale final verdict scope-change e2e", () => {
  let root: string;

  beforeEach(() => {
    root = createTempWorkspace("stale-final-verdict-e2e");
  });

  afterEach(() => {
    cleanupTempWorkspace(root);
  });

  test("scope change adds an iteration after final validation passed: flow un-wedges to the new iteration with a reset pending verdict", () => {
    // Reach archive_ready: drive the change through the same steps as the
    // "repaired finding" e2e (change_intake through final_validation with
    // iteration 1 completed), then set a terminal-final ready verdict.
    expect(createChange(root, "stale-final-e2e").ok).toBe(true);
    const config = loadConfig();

    const steps = buildLifecycleSteps(root, config, "stale-final-e2e", {
      why: "Verify a scope change after final validation un-wedges the flow",
      targetState: "A late scope change routes into the new iteration instead of wedging at archive_ready",
      requirement: "A stale terminal-final verdict must reset to pending when a new incomplete iteration appears",
      criterion: "resolveRoute reaches archive_ready, then routes into the new iteration after sync-state resets the verdict",
    });
    for (let i = 0; i < 6; i++) steps[i]();

    const changeDir = path.join(root, ".phasedev", "changes", "stale-final-e2e");
    const paths = buildChangePaths(changeDir);

    writeFile(paths.findingsPath, makeValidationFindingsBody("ready", "final"));
    expect(resolveRoute(root, "stale-final-e2e").kind).toBe("archive_ready");

    // Scope change: append a new incomplete iteration and un-approve the plan.
    // Iteration id must be sequential (2, not an arbitrary skip like 99) —
    // validate-plan-artifact rejects non-sequential iteration ids.
    const newIterationId = 2;
    const planContent = fs.readFileSync(paths.iterationPlanPath, "utf-8")
      .replace(
        "| 1 | Complete flow | Go through all phases | unit |",
        "| 1 | Complete flow | Go through all phases | unit |\n" +
          `| ${newIterationId} | Follow-up scope change | Implement the follow-up work | unit |`
      );
    fs.writeFileSync(
      paths.iterationPlanPath,
      planContent.replace(/^approved:\s*true\s*$/m, "approved: false") +
        `\n\n## Iteration ${newIterationId}: Follow-up scope change [ ]\n\n` +
        "### Goal\n\nAddress the follow-up scope change.\n\n" +
        "### Expected Change Surface\n\n" +
        "| Area / Path Pattern | Change Type | Ownership | Trace |\n" +
        "|---|---|---|---|\n" +
        "| .phasedev/ | create | test | R1, SC1, D1 |\n\n" +
        `### Tasks\n\n- [ ] ${newIterationId}.1 Implement the follow-up work\n\n` +
        "### Checks\n\n- unit: `echo unit`\n\n" +
        "### Check Evidence\n\n" +
        "| Check | Command Or Method | Result | Evidence | Notes |\n" +
        "|---|---|---|---|---|\n" +
        "| unit | `echo unit` | pending |  |  |\n",
      "utf-8"
    );

    // sync-state resets the stale verdict and rolls state off archive.
    const synced = syncState(root, "stale-final-e2e");
    expect(synced.ok).toBe(true);
    expect(synced.message).toContain("Reset the stale final verdict to `pending`");
    expect(synced.message).not.toContain("No artifacts were modified");
    const afterSync = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(afterSync).toContain("verdict: pending");
    expect(afterSync).toContain("type: final");
    expect(resolveRoute(root, "stale-final-e2e").kind).not.toBe("archive_ready");
    expect(resolveRoute(root, "stale-final-e2e").kind).not.toBe("archive_readiness_blocked");

    // Re-approve the plan; the flow now routes into the new iteration.
    const reapproved = fs.readFileSync(paths.iterationPlanPath, "utf-8")
      .replace(/^approved:\s*false\s*$/m, "approved: true");
    fs.writeFileSync(paths.iterationPlanPath, reapproved, "utf-8");

    const route = resolveRoute(root, "stale-final-e2e");
    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.activeIteration.id).toBe(newIterationId);
    }
  });

  test("scope change after final validation drives the new iteration through fresh final validation into the archive mutation", () => {
    // (a) Reach archive_ready, scope-add iteration 2, sync-state (resets verdict
    // pending), re-approve — same setup as the line-869 scenario above.
    expect(createChange(root, "full-arc-e2e").ok).toBe(true);
    const config = loadConfig();

    const steps = buildLifecycleSteps(root, config, "full-arc-e2e", {
      why: "Verify a scope change after final validation drives to the archive mutation",
      targetState: "A late scope change reaches a fresh final validation and archives",
      requirement: "A stale terminal-final verdict must reset to pending when a new incomplete iteration appears",
      criterion: "advance reaches the archive mutation after the new iteration completes",
    });
    for (let i = 0; i < 6; i++) steps[i]();

    const changeDir = path.join(root, ".phasedev", "changes", "full-arc-e2e");
    const paths = buildChangePaths(changeDir);

    writeFile(paths.findingsPath, makeValidationFindingsBody("ready", "final"));
    expect(resolveRoute(root, "full-arc-e2e").kind).toBe("archive_ready");

    const newIterationId = 2;
    const planContent = fs.readFileSync(paths.iterationPlanPath, "utf-8")
      .replace(
        "| 1 | Complete flow | Go through all phases | unit |",
        "| 1 | Complete flow | Go through all phases | unit |\n" +
          `| ${newIterationId} | Follow-up scope change | Implement the follow-up work | unit |`
      );
    fs.writeFileSync(
      paths.iterationPlanPath,
      planContent.replace(/^approved:\s*true\s*$/m, "approved: false") +
        `\n\n## Iteration ${newIterationId}: Follow-up scope change [ ]\n\n` +
        "### Goal\n\nAddress the follow-up scope change.\n\n" +
        "### Expected Change Surface\n\n" +
        "| Area / Path Pattern | Change Type | Ownership | Trace |\n" +
        "|---|---|---|---|\n" +
        "| .phasedev/ | create | test | R1, SC1, D1 |\n\n" +
        `### Tasks\n\n- [ ] ${newIterationId}.1 Implement the follow-up work\n\n` +
        "### Checks\n\n- unit: `echo unit`\n\n" +
        "### Check Evidence\n\n" +
        "| Check | Command Or Method | Result | Evidence | Notes |\n" +
        "|---|---|---|---|---|\n" +
        "| unit | `echo unit` | pending |  |  |\n",
      "utf-8"
    );

    const synced = syncState(root, "full-arc-e2e");
    expect(synced.ok).toBe(true);
    expect(synced.message).toContain("Reset the stale final verdict to `pending`");
    const afterSync = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(afterSync).toContain("verdict: pending");
    expect(afterSync).toContain("type: final");

    const reapproved = fs.readFileSync(paths.iterationPlanPath, "utf-8")
      .replace(/^approved:\s*false\s*$/m, "approved: true");
    fs.writeFileSync(paths.iterationPlanPath, reapproved, "utf-8");

    // (b) advance into implementation of iteration 2; implement; advance into
    // iteration_validation (entering the phase rewrites the leftover
    // type: final -> iteration, so the exit gate passes); set-verdict ready
    // (no coerceType, so type stays iteration); mark iteration 2 [x].
    const toImplementation = advanceFlow(root, config, "full-arc-e2e");
    expect(toImplementation.ok).toBe(true);
    expect(toImplementation.newState?.activePhase).toBe("implementation");
    expect(toImplementation.newState?.activeIteration).toBe(newIterationId);

    const implementedPlan = fs.readFileSync(paths.iterationPlanPath, "utf-8")
      .replace(
        `- [ ] ${newIterationId}.1 Implement the follow-up work`,
        `- [x] ${newIterationId}.1 Implement the follow-up work`
      )
      .replace(
        "| unit | `echo unit` | pending |  |  |",
        "| unit | `echo unit` | passed | All tasks completed |  |"
      );
    writeFile(paths.iterationPlanPath, implementedPlan);
    approveArtifact(paths.iterationPlanPath, "test");

    const toIterationValidation = advanceFlow(root, config, "full-arc-e2e");
    expect(toIterationValidation.ok).toBe(true);
    expect(toIterationValidation.newState?.activePhase).toBe("iteration_validation");
    const enteredValidationFindings = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(enteredValidationFindings).toContain("type: iteration");

    const iterationVerdict = setFindingsVerdict(paths.findingsPath, "ready", { type: "iteration", date: "2026-07-14" });
    expect(iterationVerdict.ok).toBe(true);
    const readyIterationFindings = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(readyIterationFindings).toContain("verdict: ready");
    expect(readyIterationFindings).toContain("type: iteration");

    expect(setIterationStatus(root, newIterationId, "completed", undefined, "full-arc-e2e").ok).toBe(true);

    // (c) advance -> route falls to final_validation (all [x], type iteration);
    // advance sets type: final; run fresh final validation; set-verdict ready.
    const toFinalValidation = advanceFlow(root, config, "full-arc-e2e");
    expect(toFinalValidation.ok).toBe(true);
    expect(toFinalValidation.newState?.activePhase).toBe("final_validation");
    const enteredFinalFindings = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(enteredFinalFindings).toContain("type: final");

    writeFile(paths.findingsPath, makeValidationFindingsBody("ready", "final"));

    // (d) advance -> the archive mutation.
    const toArchive = advanceFlow(root, config, "full-arc-e2e");
    expect(toArchive.ok).toBe(true);
    expect(toArchive.newState?.activePhase).toBe("archive");

    const archivedChangeDir = archiveDirFor(root, "full-arc-e2e");
    expect(fs.existsSync(path.join(archivedChangeDir, ".phase-archive.json"))).toBe(true);
    const archiveState = JSON.parse(fs.readFileSync(path.join(archivedChangeDir, ".phase-archive.json"), "utf-8"));
    expect(archiveState.status).toBe("in_progress");
    expect(loadFlowState(root, "full-arc-e2e")?.activePhase).toBe("archive");
  });

  test("advance once self-heals a wedged field state (ready/final/all-[x]/locked at iteration_validation)", () => {
    expect(createChange(root, "self-heal-e2e").ok).toBe(true);
    const config = loadConfig();

    const steps = buildLifecycleSteps(root, config, "self-heal-e2e", {
      why: "Verify advance self-heals a wedged field state",
      targetState: "A locked iteration_validation phase with a stale terminal-final verdict un-wedges",
      requirement: "A wedged ready/final/all-[x] field state must self-heal on a single advance call",
      criterion: "advance leaves iteration_validation and normalizes the stale findings type",
    });
    // Drive through the real final_validation entry so validation_findings.md
    // and iteration_plan.md are genuine artifacts, then lock state.json back to
    // iteration_validation to construct the wedge directly (field-state repair,
    // not something the normal flow produces on its own).
    for (let i = 0; i < 6; i++) steps[i]();

    const changeDir = path.join(root, ".phasedev", "changes", "self-heal-e2e");
    const paths = buildChangePaths(changeDir);

    const findingsBefore = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(findingsBefore).toContain("verdict: ready");
    expect(findingsBefore).toContain("type: final");

    let wedged = loadFlowState(root, "self-heal-e2e");
    expect(wedged).not.toBeNull();
    wedged = { ...(wedged as NonNullable<typeof wedged>), activePhase: "iteration_validation", activeIteration: 1 };
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify(wedged, null, 2) + "\n", "utf-8");

    const result = advanceFlow(root, config, "self-heal-e2e");
    expect(result.ok).toBe(true);
    expect(loadFlowState(root, "self-heal-e2e")?.activePhase).not.toBe("iteration_validation");
    expect(loadFlowState(root, "self-heal-e2e")?.activePhase).toBe("final_validation");
    // findings type normalized to iteration during the stuck phase, then
    // re-set to final on entry to the fresh final_validation as the flow proceeds.
    expect(result.message).toContain("Normalized validation_findings.md `type` to `iteration`");
    expect(result.message).toContain("iteration_validation");
    const findingsAfter = fs.readFileSync(paths.findingsPath, "utf-8");
    expect(findingsAfter).toContain("type: final");
  });
});

// ── E2E: Independent multi-change flows ─────────────────────

describe("multi-change e2e", () => {
  let root: string;

  beforeEach(() => {
    root = createTempWorkspace("multi-change-e2e");
  });

  afterEach(() => {
    cleanupTempWorkspace(root);
  });

  test("alpha and beta advance independently, and unscoped advance refuses on ambiguity", () => {
    // 1. Create alpha and beta in one workspace.
    expect(createChange(root, "alpha").ok).toBe(true);
    expect(createChange(root, "beta").ok).toBe(true);

    const config = loadConfig();

    // 2. Drive alpha forward one phase: change_intake -> code_research.
    const alphaDir = path.join(root, ".phasedev", "changes", "alpha");
    const prdBody = `\
# PRD

## Intent

| Field | Value |
|---|---|
| Change type | feature |
| Why | Verify multi-change isolation |
| Target state | Alpha advances without touching beta |
| Risk boundaries | None beyond normal project risk |

## Requirements

| ID | Requirement |
|---|---|
| R1 | Alpha and beta must advance independently |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Alpha advances while beta stays put | full |
`;
    const ecBody = `\
# Rules

## Test Commands

| Gate | Command |
|---|---|
| unit | \`echo unit\` |
| phase | \`echo phase\` |
| full | \`echo full\` |

## Constraints

No special constraints.

## Verification Gates

Standard verification gates.

## Manual Checks

None required.

## Environment Notes

None.
`;
    simulateAgent(path.join(alphaDir, "prd.md"), prdBody, true);
    simulateAgent(path.join(alphaDir, "execution_contract.md"), ecBody, true);

    const alphaAdvance = advanceFlow(root, config, "alpha");
    expect(alphaAdvance.ok).toBe(true);
    expect(alphaAdvance.newState?.activePhase).toBe("code_research");

    // 3. Beta must not have moved, and must not have alpha's artifacts.
    expect(loadFlowState(root, "beta")?.activePhase).toBe("change_intake");
    const betaDir = path.join(root, ".phasedev", "changes", "beta");
    expect(fs.existsSync(path.join(betaDir, "prd.md"))).toBe(false);
    expect(fs.existsSync(path.join(betaDir, "execution_contract.md"))).toBe(false);

    // 4. Routes diverge: beta still at change_intake, alpha moved on.
    expect(resolveRoute(root, "beta").kind).toBe("change_intake");
    expect(resolveRoute(root, "alpha").kind).not.toBe("change_intake");

    // 5. Unscoped advance refuses due to ambiguity between alpha and beta.
    expect(() => advanceFlow(root, config)).toThrow("Multiple changes exist");
  });

  test("alpha and beta interleave through the full lifecycle to two completed archives", () => {
    // 1. Create both changes and confirm archive is enabled by default.
    expect(createChange(root, "alpha").ok).toBe(true);
    expect(createChange(root, "beta").ok).toBe(true);

    const config = loadConfig();
    expect(config.runArchiveStage).toBe(true);

    const alphaSteps = buildLifecycleSteps(root, config, "alpha", {
      why: "Verify alpha advances through the full lifecycle while beta runs alongside it",
      targetState: "Alpha reaches a completed archive independently of beta",
      requirement: "Alpha must reach final_validation and archive without depending on beta",
      criterion: "Alpha's own artifacts and state drive its own advance",
    });
    const betaSteps = buildLifecycleSteps(root, config, "beta", {
      why: "Verify beta advances through the full lifecycle while alpha runs alongside it",
      targetState: "Beta reaches a completed archive independently of alpha",
      requirement: "Beta must reach final_validation and archive without depending on alpha",
      criterion: "Beta's own artifacts and state drive its own advance",
    });

    const betaStatePath = path.join(root, ".phasedev", "changes", "beta", "state.json");

    // 2. Drive alpha and beta forward interleaved (alpha one phase, then beta
    // one phase) through change_intake .. final_validation (steps 0-5), so
    // neither change ever runs two phases back-to-back before the other moves.
    for (let i = 0; i < 6; i++) {
      const betaStateBeforeAlphaStep = i === 2 ? fs.readFileSync(betaStatePath, "utf-8") : null;

      alphaSteps[i]();

      if (betaStateBeforeAlphaStep !== null) {
        // Mid-flow snapshot: alpha just advanced past beta. Prove beta's
        // state.json was untouched and the two changes sit in different phases.
        expect(fs.readFileSync(betaStatePath, "utf-8")).toBe(betaStateBeforeAlphaStep);
        const alphaPhase = loadFlowState(root, "alpha")?.activePhase;
        const betaPhase = loadFlowState(root, "beta")?.activePhase;
        expect(alphaPhase).not.toBe(betaPhase);
        expect(alphaPhase).toBe("iteration_planning");
        expect(betaPhase).toBe("technical_design");
      }

      betaSteps[i]();
    }

    // Both changes are now at final_validation. Bring alpha to archive_ready
    // and advance, without touching beta yet.
    alphaSteps[6]();

    // 3. Alpha's dir moved to the archive; beta is still active, untouched.
    expect(fs.existsSync(path.join(root, ".phasedev", "changes", "alpha"))).toBe(false);
    const alphaArchiveDir = archiveDirFor(root, "alpha");
    const alphaArchiveState = JSON.parse(fs.readFileSync(path.join(alphaArchiveDir, ".phase-archive.json"), "utf-8"));
    expect(alphaArchiveState.status).toBe("in_progress");

    const betaDir = path.join(root, ".phasedev", "changes", "beta");
    expect(fs.existsSync(betaDir)).toBe(true);
    expect(loadFlowState(root, "beta")?.activePhase).toBe("final_validation");

    // 4. Bring beta to archive too, without completing alpha's archive first.
    betaSteps[6]();

    // Two pending archives coexist.
    expect(findPendingArchiveState(root, "alpha")?.status).toBe("in_progress");
    expect(findPendingArchiveState(root, "beta")?.status).toBe("in_progress");

    // 5. Complete alpha's archive first, then beta's.
    completeArchive(alphaArchiveDir);
    const alphaFinish = advanceFlow(root, config, "alpha");
    expect(alphaFinish.ok).toBe(true);
    expect(alphaFinish.finished).toBe(true);

    // Beta's pending archive is unaffected by alpha's completion.
    expect(findPendingArchiveState(root, "beta")?.status).toBe("in_progress");

    const betaArchiveDir = archiveDirFor(root, "beta");
    completeArchive(betaArchiveDir);
    const betaFinish = advanceFlow(root, config, "beta");
    expect(betaFinish.ok).toBe(true);
    expect(betaFinish.finished).toBe(true);

    // 6. Final state: both archives completed, no unfinished changes remain.
    const finalAlphaState = JSON.parse(fs.readFileSync(path.join(alphaArchiveDir, ".phase-archive.json"), "utf-8"));
    const finalBetaState = JSON.parse(fs.readFileSync(path.join(betaArchiveDir, ".phase-archive.json"), "utf-8"));
    expect(finalAlphaState.status).toBe("completed");
    expect(finalAlphaState.completedAt).toBeTruthy();
    expect(finalBetaState.status).toBe("completed");
    expect(finalBetaState.completedAt).toBeTruthy();

    const remainingChangeDirs = fs.readdirSync(path.join(root, ".phasedev", "changes"), { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== "archive");
    expect(remainingChangeDirs.length).toBe(0);

    expect(listChanges(root)).toEqual([]);

    const withArchived = listChanges(root, true);
    expect(withArchived.length).toBe(2);
    expect(withArchived.every(entry => entry.type === "archived" && entry.archiveStatus === "completed")).toBe(true);
    expect(withArchived.some(entry => entry.name.endsWith("-alpha"))).toBe(true);
    expect(withArchived.some(entry => entry.name.endsWith("-beta"))).toBe(true);
  });
});

// ── E2E: Quick flow, create-change --quick to archive completed ─────

describe("quick flow e2e", () => {
  let root: string;

  beforeEach(() => {
    root = createTempWorkspace("quick-flow-e2e");
  });

  afterEach(() => {
    cleanupTempWorkspace(root);
  });

  test("create-change --quick advances quick_plan -> quick_implementation -> quick_validation -> quick_spec_revision -> archive -> finished", () => {
    // 1. Create the quick change and confirm it starts at quick_plan.
    const created = createChange(root, "qc", undefined, true);
    expect(created.ok).toBe(true);
    expect(loadFlowState(root, "qc")?.activePhase).toBe("quick_plan");
    expect(loadFlowState(root, "qc")?.flowMode).toBe("quick");

    // Disable the implementation commit gate for hermetic advancement (no
    // real git repo/commit involved), matching how other e2e tests keep the
    // commit gate out of scope when it is not the behavior under test.
    const config: Config = { ...loadConfig(), requireIterationCommit: false };

    // 2. Fill worklog.md so the quick_plan gate is satisfied, then advance.
    const changeDir = path.join(root, ".phasedev", "changes", "qc");
    const worklogPath = path.join(changeDir, "worklog.md");
    writeFile(worklogPath, "# Worklog\n\n## Task\nAdd a quick one-off fix.\n");

    const toImplementation = advanceFlow(root, config, "qc");
    expect(toImplementation.ok).toBe(true);
    expect(toImplementation.newState?.activePhase).toBe("quick_implementation");

    // 3. quick_implementation -> quick_validation (commit gate disabled).
    const toValidation = advanceFlow(root, config, "qc");
    expect(toValidation.ok).toBe(true);
    expect(toValidation.newState?.activePhase).toBe("quick_validation");

    // 4. quick_validation -> quick_spec_revision (no gate).
    const toSpecRevision = advanceFlow(root, config, "qc");
    expect(toSpecRevision.ok).toBe(true);
    expect(toSpecRevision.newState?.activePhase).toBe("quick_spec_revision");

    // 5. quick_spec_revision -> archive: mutates the change dir into archive/
    // and preserves flowMode: "quick" on the archived state.json.
    const toArchive = advanceFlow(root, config, "qc");
    expect(toArchive.ok).toBe(true);
    expect(toArchive.newState?.activePhase).toBe("archive");
    expect(fs.existsSync(changeDir)).toBe(false);

    const archiveDir = archiveDirFor(root, "qc");
    const archiveState = JSON.parse(fs.readFileSync(path.join(archiveDir, ".phase-archive.json"), "utf-8"));
    expect(archiveState.status).toBe("in_progress");

    const archivedFlowState = JSON.parse(fs.readFileSync(path.join(archiveDir, "state.json"), "utf-8"));
    expect(archivedFlowState.activePhase).toBe("archive");
    expect(archivedFlowState.flowMode).toBe("quick");

    // 6. Mark the archive completed, then advance to finish the flow.
    completeArchive(archiveDir);
    const finished = advanceFlow(root, config, "qc");
    expect(finished.ok).toBe(true);
    expect(finished.finished).toBe(true);

    const finalArchiveState = JSON.parse(fs.readFileSync(path.join(archiveDir, ".phase-archive.json"), "utf-8"));
    expect(finalArchiveState.status).toBe("completed");
    expect(finalArchiveState.completedAt).toBeTruthy();
  });
});
