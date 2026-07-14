import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { syncState } from "../src/features/phase-control/sync-state";
import { buildChangePaths } from "../src/entities/change/paths";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";
import { ActivePhase } from "../src/entities/change/flow-state";

// ---------------------------------------------------------------------------
// Fixture plumbing (mirrors test/controller.test.ts's setupChange helpers).
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempWorkspace(tempDirs.pop());
  }
});

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved}\n---\n${body}`, "utf-8");
}

function validPrdBody(): string {
  return `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep flow routing grounded in approved requirements. |
| Target state | Exercise the flow controller stage prompt. |
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
| Target state | Exercise the flow controller stage prompt. | confirmed | F1 | Code fixture confirms routing. |
| Risk boundaries | Test fixture only; no production risk. | confirmed | F2 | Existing fixture tests cover the boundary. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | none | none |
| SC1 | confirmed | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/features/phase-control/flow-route.ts:94\` | Missing research routes to the research phase. | R1 |
| F2 | code | \`test/anti-wedge-lattice.test.ts:1\` | Lattice fixture asserts design follows valid research. | SC1 |

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

/** One plan iteration, with independent control over the heading checkbox
 *  (drives the completeness dimension) and the task checkbox (drives
 *  readiness-for-validation via iterationValidationBlockers). */
function iterationSection(id: number, name: string, headingMark: "x" | "~" | " ", taskDone: boolean): string {
  const taskMark = taskDone ? "x" : " ";
  const resultStatus = taskDone ? "passed" : "pending";
  const evidenceStr = taskDone ? "passed unit tests" : "";
  return `
## Iteration ${id}: ${name} [${headingMark}]

### Goal

Complete iteration ${id}. Satisfies R1 and SC1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | Fixture implementation area | R1, SC1, D1 |

### Tasks

- [${taskMark}] ${id}.1 Implement work item ${id}

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | ${resultStatus} | ${evidenceStr} |  |
`;
}

function planArtifact(sections: string[]): string {
  return `
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Exercise the lattice fixture path. |
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
${sections.map((_, i) => `| Iteration ${i + 1} | Complete iteration ${i + 1}. | ${i + 1}.1 | unit |`).join("\n")}
${sections.join("\n")}`;
}

type Verdict = "pending" | "ready" | "ready_with_risks" | "repair_required" | "repaired";
type Type = "iteration" | "final";

interface FindingsRow {
  id: string;
  status: "open" | "reopened" | "resolved";
  severity: "MUST-FIX" | "NIT";
  iteration: number;
  resolution?: string;
}

function findingsArtifact(verdict: Verdict, type: Type, rows: FindingsRow[]): string {
  const rowLines = rows
    .map(r => `| ${r.id} | ${r.status} | ${r.severity} | implementation | Iteration ${r.iteration} | Fixture finding ${r.id}. | Fix finding ${r.id}. | ${r.resolution ?? ""} |`)
    .join("\n");
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-29
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |
|---|---|---|---|---|---|---|---|
${rowLines}`;
}

interface StateSpec {
  activePhase: ActivePhase;
  activeIteration: number | null;
  repairCycleCount?: number;
}

function buildState(planSections: string[], findings: string | null, state: StateSpec): { root: string; changeDir: string } {
  const root = createTempWorkspace("anti-wedge-lattice");
  tempDirs.push(root);

  const changeDir = path.join(root, ".phasedev", "changes", "sample-change");
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
  writeArtifact(path.join(changeDir, "iteration_plan.md"), planArtifact(planSections));

  if (findings !== null) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), findings, "utf-8");
  }

  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: state.activePhase, activeIteration: state.activeIteration, repairCycleCount: state.repairCycleCount ?? 0 }, null, 2) + "\n",
    "utf-8"
  );

  return { root, changeDir };
}

interface Snapshot {
  stateJson: string;
  findings: string | null;
  archiveMarkerExists: boolean;
}

function snapshot(changeDir: string): Snapshot {
  const paths = buildChangePaths(changeDir);
  return {
    stateJson: fs.existsSync(path.join(changeDir, "state.json")) ? fs.readFileSync(path.join(changeDir, "state.json"), "utf-8") : "",
    findings: fs.existsSync(paths.findingsPath) ? fs.readFileSync(paths.findingsPath, "utf-8") : null,
    archiveMarkerExists: fs.existsSync(path.join(changeDir, ".phase-archive.json"))
  };
}

// ---------------------------------------------------------------------------
// Defect classifier.
//
// Narrowed against the real refusal messages produced by this suite (see
// task-7-report.md for the full before/after transcript). Anchored on
// concrete phrases naming a specific artifact defect and the fix for it.
// Deliberately EXCLUDES bare "type" / "must be" / "verdict" / generic
// "Iteration" as standalone triggers: the raw phase-validators.ts message
// "YAML field `type` must be `iteration` for iteration validation." matches
// those loosely, but that exact defect is auto-healed by
// normalizeValidationState (Invariant T) before this gate ever runs in a
// normal advance/sync-state flow, so treating it as an acceptable "actionable
// defect" would let the pre-fix stale-type wedge pass as if it were a
// legitimate, permanently-manual-only refusal.
const CONCRETE_DEFECT = new RegExp(
  [
    "does not exist",
    "top-level tasks are not all completed",
    "re-validation pending",
    "repair not finished",
    "still open or reopened",
    "requires at least one open or reopened",
    "is not allowed while open or reopened",
    "no open blocking findings",
    "mark the iteration \\[x\\]",
    "set `verdict: repaired`"
  ].join("|"),
  "i"
);

function namesConcreteDefect(advanceMessage: string, syncMessage: string | undefined): boolean {
  return CONCRETE_DEFECT.test(advanceMessage) || CONCRETE_DEFECT.test(syncMessage ?? "");
}

function isCircularAdvice(advanceMessage: string, syncMessage: string | undefined): boolean {
  const syncPointsToAdvance = /run `?phasedev advance`?/i.test(syncMessage ?? "");
  const advancePointsToSync = /run `?phasedev sync-state`?/i.test(advanceMessage);
  return syncPointsToAdvance && advancePointsToSync;
}

/** The specific historical wedge from the brief: sync-state tells the agent to
 *  "run advance" while advance refuses because the stale findings `type` is
 *  not `iteration`/`final`, so the agent is bounced between the two commands
 *  forever. Narrower than isCircularAdvice's generic pair (which requires
 *  advance to *also* point back at sync-state) -- this tripwire fires on the
 *  exact wording pair even if advance's refusal never mentions sync-state. */
function hasStaleTypeCircularAdvice(advanceMessage: string, syncMessage: string | undefined): boolean {
  const syncSaysRunAdvance = /run `?phasedev advance`?/i.test(syncMessage ?? "");
  const advanceDemandsType = /must be `(iteration|final)`/i.test(advanceMessage);
  return syncSaysRunAdvance && advanceDemandsType;
}

// ---------------------------------------------------------------------------
// Lattice cases.
//
// Dimensions: verdict x type x completeness (all-complete | one-incomplete)
// x activePhase (implementation | iteration_validation | final_validation |
// finding_repair). Pruned cells are dropped with an inline comment naming
// why the CLI/flow cannot legally reach them; illegal-but-writable combos
// (structural row-count violations) are hand-authored and asserted to
// produce an invalid_findings-style diagnosis instead of being dropped.
// ---------------------------------------------------------------------------

const READY_ONE_ITER = [iterationSection(1, "Solo", "x", true)];
const IN_PROGRESS_ONE_ITER_NOT_READY = [iterationSection(1, "Solo", "~", false)];
const IN_PROGRESS_ONE_ITER_READY = [iterationSection(1, "Solo", "~", true)];
const TWO_ITER_FIRST_DONE = [iterationSection(1, "First", "x", true), iterationSection(2, "Second", " ", false)];

type CaseResult = "progress" | "refuse";

interface LatticeCase {
  name: string;
  plan: string[];
  findings: string | null;
  state: StateSpec;
  expected: CaseResult;
  /** Optional destination assertion beyond the generic progress/refuse check
   *  (see case 23 for why this is sometimes required: some buggy mis-routes
   *  satisfy the generic `progressed` check too). */
  assertAfter?: (after: Snapshot) => void;
}

const LATTICE: LatticeCase[] = [
  // --- activePhase: implementation ---------------------------------------
  {
    name: "implementation: one-incomplete, tasks unfinished -> refuse (top-level tasks)",
    plan: IN_PROGRESS_ONE_ITER_NOT_READY,
    findings: null,
    state: { activePhase: "implementation", activeIteration: 1 },
    expected: "refuse"
  },
  {
    name: "implementation: all-complete, state stale-locked below artifacts -> progress forward",
    plan: READY_ONE_ITER,
    findings: null,
    state: { activePhase: "implementation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "implementation: leftover repair_required/final findings from a prior iteration is routing-inert -> still refuse (top-level tasks)",
    // implementation's exit gate (phase-validators.ts "implementation" case) never reads
    // validation_findings.md, and resolveRoute's incompleteIteration branch runs before
    // any findings-based branch, so verdict/type variation is pruned to this one
    // representative case rather than crossed with the full 5x2 grid.
    plan: IN_PROGRESS_ONE_ITER_NOT_READY,
    findings: findingsArtifact("repair_required", "final", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 0 }]),
    state: { activePhase: "implementation", activeIteration: 1 },
    expected: "refuse"
  },

  // --- activePhase: iteration_validation ----------------------------------
  {
    name: "iteration_validation: no findings file, one-incomplete -> refuse (does not exist)",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: null,
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "refuse"
  },
  {
    name: "iteration_validation: verdict pending, type iteration, one-incomplete heading -> refuse (mark the iteration [x])",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("pending", "iteration", []),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "refuse"
  },
  {
    name: "iteration_validation: verdict ready, type FINAL (stale), heading already [x], all-complete -> progress (flagship RED case)",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("ready", "final", []),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict ready, type iteration (correct), heading [x], all-complete -> progress to final_validation (Seam A sets type: final)",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("ready", "iteration", []),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict ready, type iteration, heading [x], one-incomplete (next iteration pending) -> progress to iteration 2",
    plan: TWO_ITER_FIRST_DONE,
    findings: findingsArtifact("ready", "iteration", []),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict ready, type FINAL (stale), heading [x], one-incomplete -> progress (normalize then route forward)",
    plan: TWO_ITER_FIRST_DONE,
    findings: findingsArtifact("ready", "final", []),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict ready_with_risks, type iteration, one open NIT (non-blocking), one-incomplete -> progress",
    plan: TWO_ITER_FIRST_DONE,
    findings: findingsArtifact("ready_with_risks", "iteration", [{ id: "F1", status: "open", severity: "NIT", iteration: 1 }]),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict repair_required, type iteration, one open MUST-FIX -> progress to finding_repair",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repair_required", "iteration", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 1 }]),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict repair_required, type FINAL (stale), one open MUST-FIX -> progress (normalize + route to finding_repair)",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repair_required", "final", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 1 }]),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: verdict repaired, type iteration (correct), zero open blocking -> refuse (re-validation pending)",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repaired", "iteration", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed and verified." }]),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "refuse"
  },
  {
    name: "iteration_validation: verdict repaired, type FINAL (stale), zero open blocking -> progress (normalize mutates findings even though re-validation is still pending)",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repaired", "final", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed and verified." }]),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "progress"
  },
  {
    name: "iteration_validation: HAND-AUTHORED illegal combo, verdict repair_required with zero open blocking rows -> refuse (invalid_findings: requires at least one open)",
    // The CLI writers cannot legally produce this: setFindingsVerdict/manage-findings
    // only accepts repair_required alongside >=1 open MUST-FIX row. Hand-authored
    // directly on disk to exercise the invalid_findings diagnosis path.
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repair_required", "iteration", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed." }]),
    state: { activePhase: "iteration_validation", activeIteration: 1 },
    expected: "refuse"
  },

  // --- activePhase: final_validation ---------------------------------------
  {
    name: "final_validation: no findings file, all-complete -> refuse (does not exist)",
    plan: READY_ONE_ITER,
    findings: null,
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "refuse"
  },
  {
    name: "final_validation: verdict ready, type ITERATION (stale), all-complete -> progress to archive (flagship RED case, final variant)",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("ready", "iteration", []),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "progress"
  },
  {
    name: "final_validation: verdict ready, type final (correct), all-complete -> progress to archive",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("ready", "final", []),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "progress"
  },
  {
    name: "final_validation: verdict ready_with_risks, type final, one open NIT (non-blocking), all-complete -> progress to archive",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("ready_with_risks", "final", [{ id: "F1", status: "open", severity: "NIT", iteration: 1 }]),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "progress"
  },
  {
    name: "final_validation: verdict repair_required, type final, one open MUST-FIX -> progress to finding_repair",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("repair_required", "final", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 1 }]),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "progress"
  },
  {
    name: "final_validation: verdict repaired, type final (correct), zero open blocking -> refuse (re-validation pending)",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("repaired", "final", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed and verified." }]),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "refuse"
  },
  {
    name: "final_validation: verdict repaired, type ITERATION (stale), zero open blocking -> progress (normalize mutates findings)",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("repaired", "iteration", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed and verified." }]),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "progress"
  },
  {
    name: "final_validation: verdict ready, type final, ONE-INCOMPLETE iteration (scope changed after final passed) -> progress (Rule a resets to pending, routes back)",
    // Guard for bug #1: a stale `ready`/`final` verdict must never be read as
    // license to archive while an iteration is still incomplete. Generic
    // `progressed` is not enough here -- the buggy mis-route-to-archive
    // behavior also flips state.json/moves the change dir, so it satisfies
    // `progressed` too. The destination assertions below (asserted inline in
    // the runner via c.assertAfter) pin the actual fixed-tree after-state:
    // no archive marker, verdict reset to pending, and state routed back to
    // implementation on the incomplete iteration -- each of which the
    // mis-route-to-archive hypothesis would fail.
    plan: TWO_ITER_FIRST_DONE,
    findings: findingsArtifact("ready", "final", []),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "progress",
    assertAfter: after => {
      expect(after.archiveMarkerExists).toBe(false);
      const state = JSON.parse(after.stateJson) as { activePhase: string; activeIteration: number | null };
      expect(state.activePhase).toBe("implementation");
      expect(state.activeIteration).toBe(2);
      expect(after.findings ?? "").toContain("verdict: pending");
    }
  },
  {
    name: "final_validation: HAND-AUTHORED illegal combo, verdict ready_with_risks with an open MUST-FIX row -> refuse (invalid_findings: not allowed while open)",
    // ready_with_risks structurally requires zero open BLOCKING rows; the CLI
    // writers refuse to set this verdict while a MUST-FIX row is open. Hand-authored
    // to exercise the invalid_findings diagnosis path.
    plan: READY_ONE_ITER,
    findings: findingsArtifact("ready_with_risks", "final", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 1 }]),
    state: { activePhase: "final_validation", activeIteration: null },
    expected: "refuse"
  },

  // --- activePhase: finding_repair ------------------------------------------
  // Pruned: "no findings file, locked at finding_repair" is dropped -- resolveRoute
  // only ever routes to finding_repair when validation_findings.md already exists
  // with >=1 open blocking row (or is structurally invalid), so a CLI-driven flow
  // can never lock finding_repair without a findings file. The equivalent
  // "does not exist" refusal is already covered by the iteration_validation and
  // final_validation cases above.
  {
    name: "finding_repair: HAND-AUTHORED stale lock, verdict ready while locked at finding_repair -> refuse (no open blocking findings ... set verdict: repaired)",
    // Reachable only via an out-of-band artifact edit (agent set verdict: ready
    // without realizing state.json was still locked mid-repair); not something
    // resolveRoute would route you into, so hand-authored directly.
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("ready", "iteration", []),
    state: { activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 1 },
    expected: "refuse"
  },
  {
    name: "finding_repair: verdict repair_required, type iteration, one open MUST-FIX (repair ongoing) -> refuse (repair not finished)",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repair_required", "iteration", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 1 }]),
    state: { activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 1 },
    expected: "refuse"
  },
  {
    name: "finding_repair: verdict repair_required, type final (leftover, untouched by design), one open MUST-FIX -> refuse (repair not finished)",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("repair_required", "final", [{ id: "F1", status: "open", severity: "MUST-FIX", iteration: 1 }]),
    state: { activePhase: "finding_repair", activeIteration: null, repairCycleCount: 1 },
    expected: "refuse"
  },
  {
    name: "finding_repair: verdict repaired, type iteration, zero open blocking -> progress to iteration_validation",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repaired", "iteration", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed and verified." }]),
    state: { activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 1 },
    expected: "progress"
  },
  {
    name: "finding_repair: verdict repaired, type final, zero open blocking -> progress to final_validation",
    plan: READY_ONE_ITER,
    findings: findingsArtifact("repaired", "final", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed and verified." }]),
    state: { activePhase: "finding_repair", activeIteration: null, repairCycleCount: 1 },
    expected: "progress"
  },
  {
    name: "finding_repair: HAND-AUTHORED illegal combo, verdict repair_required with zero open blocking rows -> refuse (invalid_findings: requires at least one open)",
    plan: IN_PROGRESS_ONE_ITER_READY,
    findings: findingsArtifact("repair_required", "iteration", [{ id: "F1", status: "resolved", severity: "MUST-FIX", iteration: 1, resolution: "Fixed." }]),
    state: { activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 1 },
    expected: "refuse"
  }
];

describe("anti-wedge lattice: no reachable validation state wedges", () => {
  test.each(LATTICE.map(c => [c.name, c] as const))("%s", (_name, c) => {
    const { root, changeDir } = buildState(c.plan, c.findings, c.state);
    const before = snapshot(changeDir);

    const advance = advanceFlow(root, DEFAULT_CONFIG);
    const sync = advance.ok ? undefined : syncState(root);
    const after = snapshot(changeDir);

    const progressed =
      after.stateJson !== before.stateJson ||
      after.findings !== before.findings ||
      (after.archiveMarkerExists && !before.archiveMarkerExists);

    const concreteDefect = namesConcreteDefect(advance.message, sync?.message);
    const circular = isCircularAdvice(advance.message, sync?.message);
    const staleTypeCircular = hasStaleTypeCircularAdvice(advance.message, sync?.message);

    expect(circular).toBe(false);
    // Flagship-specific tripwire (see hasStaleTypeCircularAdvice): guards the
    // exact "sync says run advance" x "advance demands type iteration/final"
    // wedge named in the brief, independent of the broader isCircularAdvice pair.
    expect(staleTypeCircular).toBe(false);
    expect(progressed || concreteDefect).toBe(true);

    if (c.expected === "progress") {
      expect(progressed).toBe(true);
    } else {
      expect(concreteDefect).toBe(true);
    }

    c.assertAfter?.(after);
  });
});
