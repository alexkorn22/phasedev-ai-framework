import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";

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

function simulateAgent(file: string, body: string, approved = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (approved) {
    fs.writeFileSync(file, `---\napproved: true\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(file, `---\napproved: false\n---\n${body}`, "utf-8");
  }
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
    expect(result.out).toContain("No active change");
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
    // Helper: write a file with plain content (no frontmatter)
    // -----------------------------------------------------------------------
    function writeFile(file: string, content: string): void {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content, "utf-8");
    }

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

    const prdBody = `\
# PRD

## Intent

| Field | Value |
|---|---|
| Change type | feature |
| Why | Verify the full flow without re-approvals |
| Target state | Flow completes from start to archive |
| Risk boundaries | None beyond normal project risk |

## Requirements

| ID | Requirement |
|---|---|
| R1 | The system must pass through all phases without re-approvals |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Full flow completes in one pass | full |
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

    const prdPath = path.join(cdir, "prd.md");
    const ecPath = path.join(cdir, "execution_contract.md");

    simulateAgent(prdPath, prdBody, true);
    simulateAgent(ecPath, ecBody, true);

    // check should pass
    expect(run(["check"]).code).toBe(0);

    // advance should work — goes to code_research
    const adv1 = run(["advance"]);
    expect(adv1.code).toBe(0);
    expect(adv1.out).toContain("code_research");
    st = state();
    expect(st?.activePhase).toBe("code_research");

    // -----------------------------------------------------------------------
    // 3. Phase 2: code_research — research_facts.md
    // -----------------------------------------------------------------------
    const researchBody = `\
# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | feature | not_applicable | prd-only | n/a |
| Why | Verify the full flow without re-approvals | not_applicable | prd-only | n/a |
| Target state | Flow completes from start to archive | confirmed | F1 | n/a |
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
    const researchPath = path.join(cdir, "research_facts.md");
    writeFile(researchPath, researchBody);

    expect(run(["check"]).code).toBe(0);

    const adv2 = run(["advance"]);
    expect(adv2.code).toBe(0);
    expect(adv2.out).toContain("technical_design");
    st = state();
    expect(st?.activePhase).toBe("technical_design");

    // -----------------------------------------------------------------------
    // 4. Phase 3: technical_design — architecture/design.md
    // -----------------------------------------------------------------------
    const designBody = `\
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
    const designPath = path.join(cdir, "architecture", "design.md");
    // Write without approval in frontmatter; approve via CLI below
    writeFile(designPath, designBody);

    // Approve via CLI
    const approveDesign = run(["approve", designPath]);
    expect(approveDesign.code).toBe(0);

    expect(run(["check"]).code).toBe(0);

    const adv3 = run(["advance"]);
    expect(adv3.code).toBe(0);
    expect(adv3.out).toContain("iteration_planning");
    st = state();
    expect(st?.activePhase).toBe("iteration_planning");

    // -----------------------------------------------------------------------
    // 5. Phase 4: iteration_planning — iteration_plan.md
    // -----------------------------------------------------------------------
    const planBody = `\
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
    const planPath = path.join(cdir, "iteration_plan.md");
    writeFile(planPath, planBody);

    // Approve plan via CLI
    const approvePlan = run(["approve", planPath]);
    expect(approvePlan.code).toBe(0);

    expect(run(["check"]).code).toBe(0);

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
    let planContent = fs.readFileSync(planPath, "utf-8");
    planContent = planContent.replace("- [ ] 1.1 Execute full flow", "- [x] 1.1 Execute full flow");
    planContent = planContent.replace(
      "| unit | `echo unit` | pending |  |  |",
      "| unit | `echo unit` | passed | All tasks completed |  |",
    );
    writeFile(planPath, planContent);

    // Re-approve the plan (hash changed after body edits)
    const reapprovePlan = run(["approve", planPath]);
    expect(reapprovePlan.code).toBe(0);

    expect(run(["check"]).code).toBe(0);

    const adv5 = run(["advance"]);
    expect(adv5.code).toBe(0);
    expect(adv5.out).toContain("iteration_validation");
    st = state();
    expect(st?.activePhase).toBe("iteration_validation");
    expect(st?.activeIteration).toBe(1);

    // -----------------------------------------------------------------------
    // 7. Phase 6a: iteration_validation — validation_findings.md
    // -----------------------------------------------------------------------
    const ivFindingsBody = `\
---\n\
verdict: ready\n\
type: iteration\n\
date: 2026-07-06\n\
---\n
| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n\
|---|---|---|---|---|---|---|---|\n\
`;
    const findingsPath = path.join(cdir, "validation_findings.md");
    writeFile(findingsPath, ivFindingsBody);

    // Mark iteration 1 as [x] (completed) so resolveRoute can move past it
    const setIterStatus = run(["set-iteration-status", "1", "x"]);
    expect(setIterStatus.code).toBe(0);

    expect(run(["check"]).code).toBe(0);

    const adv6 = run(["advance"]);
    expect(adv6.code).toBe(0);
    expect(adv6.out).toContain("final_validation");
    st = state();
    expect(st?.activePhase).toBe("final_validation");

    // -----------------------------------------------------------------------
    // 8. Phase 6b: final_validation — update validation_findings.md
    // -----------------------------------------------------------------------
    const fvFindingsBody = `\
---\n\
verdict: ready\n\
type: final\n\
date: 2026-07-06\n\
---\n
| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n\
|---|---|---|---|---|---|---|---|\n\
`;
    writeFile(findingsPath, fvFindingsBody);

    expect(run(["check"]).code).toBe(0);

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
