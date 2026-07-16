import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { runArchive } from "../src/features/phase-control/archive-command";
import { createArchiveState } from "../src/entities/change/archive-state";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { UnknownChangeError } from "../src/entities/change/change-errors";
import { readFindingsBaseline } from "../src/entities/change/flow-state";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("archive-command");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

function writeArtifact(filePath: string, body: string, approved = true): void {
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
| Target state | Exercise the archive command fixture path. |
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
| Target state | Exercise the archive command fixture path. | confirmed | F1 | Code fixture confirms routing. |
| Risk boundaries | Test fixture only; no production risk. | confirmed | F2 | Existing fixture tests cover the boundary. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | none | none |
| SC1 | confirmed | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/features/phase-control/flow-route.ts:94\` | Missing research routes to the research stage. | R1 |
| F2 | code | \`test/archive-command.test.ts:1\` | Fixture asserts design follows valid research. | SC1 |

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

function withImplementationPlanContract(planContent: string): string {
  const normalizedPlanContent = planContent.trim().replace(/^#\s+.*\n+/, "").trim();
  const withBundle = `
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Exercise the archive command fixture path. |
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

${normalizedPlanContent}`;

  return withBundle.replace(/^## Iteration \d+:.*(?:\n(?!## Iteration \d+:).*)*/gm, section => {
    let nextSection = section;
    if (!/^###\s+Goal\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Goal\n\nComplete the fixture phase. Satisfies R1 and SC1.";
    }
    if (!/^###\s+Expected Change Surface\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Expected Change Surface\n\n| Area / Path Pattern | Change Type | Ownership | Trace |\n|---|---|---|---|\n| `src/**` | update | Fixture implementation area | R1, SC1, D1 |";
    }
    if (!/^###\s+Tasks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Tasks\n";
    }
    if (!/^###\s+Checks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Checks\n\n- unit: `bun test unit`";
    }
    if (!/^###\s+Check Evidence\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Check Evidence\n\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | `bun test unit` | passed | passed unit tests |  |";
    }
    return nextSection;
  });
}

function validationFindings(
  verdict: "ready" | "ready_with_risks" | "repair_required" | "repaired",
  type: "iteration" | "final",
  rows = ""
): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-29
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}

/** A change with all Standard-mode artifacts approved and at final `ready` verdict — routes to `archive_ready`. */
function setupArchiveReadyChange(name = "sample-change"): string {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", name);
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
  writeArtifact(
    path.join(changeDir, "iteration_plan.md"),
    withImplementationPlanContract(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`)
  );
  fs.writeFileSync(path.join(changeDir, "validation_findings.md"), validationFindings("ready", "final"), "utf-8");
  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8"
  );

  return changeDir;
}

function archiveDirFor(name: string): string {
  const today = new Date().toISOString().split("T")[0];
  return path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-${name}`);
}

function mkChange(name: string, activePhase: string, extra: Record<string, unknown> = {}): string {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", name);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase, activeIteration: null, repairCycleCount: 0, ...extra }, null, 2) + "\n",
    "utf-8"
  );
  return changeDir;
}

function mkArchived(name: string, status: "in_progress" | "completed"): string {
  const dir = archiveDirFor(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".phase-archive.json"),
    JSON.stringify({
      status,
      changeName: name,
      archivePath: dir,
      startedAt: "2026-05-29T00:00:00.000Z",
      movedAt: "2026-05-29T00:00:00.000Z",
      ...(status === "completed" ? { completedAt: "2026-05-29T01:00:00.000Z" } : {})
    }, null, 2) + "\n",
    "utf-8"
  );
  fs.writeFileSync(
    path.join(dir, "state.json"),
    JSON.stringify({ activePhase: "archive", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8"
  );
  return dir;
}

describe("runArchive: archive_ready mutation", () => {
  test("moves the change directory and marks archive in_progress with state.json locked to archive", () => {
    const changeDir = setupArchiveReadyChange();
    const archiveDir = archiveDirFor("sample-change");

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(result.ok).toBe(true);
    expect(result.started).toBe(true);
    expect(result.done).toBe(false);
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(archiveDir)).toBe(true);

    const archiveState = JSON.parse(fs.readFileSync(path.join(archiveDir, ".phase-archive.json"), "utf-8"));
    expect(archiveState.status).toBe("in_progress");
    expect(archiveState.changeName).toBe("sample-change");

    const flowState = JSON.parse(fs.readFileSync(path.join(archiveDir, "state.json"), "utf-8"));
    expect(flowState.activePhase).toBe("archive");
  });

  test("removes the findings baseline as part of the archive_ready transition", () => {
    const changeDir = setupArchiveReadyChange();
    const statePath = path.join(changeDir, "state.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    state.findingsBaseline = { rows: [] };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");

    runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    const archiveDir = archiveDirFor("sample-change");
    expect(readFindingsBaseline(path.join(archiveDir, "state.json"))).toBeNull();
  });
});

describe("runArchive: archive_readiness_blocked", () => {
  test("refuses when not every iteration is completed", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
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
    writeArtifact(
      path.join(changeDir, "iteration_plan.md"),
      withImplementationPlanContract(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [x]
- [x] 2.1 Build page

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | pending |  |  |
`)
    );
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), validationFindings("ready", "final"), "utf-8");
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(fs.existsSync(changeDir)).toBe(true);
  });
});

describe("runArchive: pending_archive resume", () => {
  test("reports in-progress while the archive contract is unfinished, then done once it completes", () => {
    const archiveDir = mkArchived("sample-change", "in_progress");

    const first = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(first.ok).toBe(true);
    expect(first.started).toBe(true);
    expect(first.done).toBe(false);
    expect(first.message).toContain("Archive in progress");
    expect(first.message).toContain("phasedev phase --change sample-change");

    const state = JSON.parse(fs.readFileSync(path.join(archiveDir, ".phase-archive.json"), "utf-8"));
    fs.writeFileSync(
      path.join(archiveDir, ".phase-archive.json"),
      JSON.stringify({ ...state, status: "completed", completedAt: "2026-05-29T02:00:00.000Z" }, null, 2) + "\n",
      "utf-8"
    );

    const second = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(second.ok).toBe(true);
    expect(second.done).toBe(true);
    expect(second.started).toBe(false);
    expect(second.message).toBe("Archive complete for sample-change. Flow finished.");
  });
});

describe("runArchive: pre-move crash recovery", () => {
  test("recovers a change with an in-progress archive marker still in the active directory", () => {
    const changeDir = setupArchiveReadyChange();
    const archiveDir = archiveDirFor("sample-change");

    // Simulate a crash after startArchiveStage wrote the archive marker (and locked
    // state.json to archive) but before the directory move.
    createArchiveState("sample-change", archiveDir, new Date(), changeDir);
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "archive", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(result.ok).toBe(true);
    expect(result.started).toBe(true);
    expect(result.message).toContain("recovered from pre-move crash");
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(archiveDir)).toBe(true);
  });
});

describe("runArchive: not-at-boundary refusal", () => {
  test("refuses a Standard change that has not reached final validation", () => {
    mkChange("sample-change", "implementation");

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("has not reached final validation");
    expect(result.message).toContain("current route:");
  });
});

describe("runArchive: unknown change", () => {
  test("throws UnknownChangeError for a change name that does not exist", () => {
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes"), { recursive: true });

    expect(() => runArchive(testTmpDir, DEFAULT_CONFIG, "no-such-change")).toThrow(UnknownChangeError);
  });
});

describe("runArchive: already-completed archive", () => {
  test("a fresh call against a change whose archive is already completed reports done, with no in-between started step", () => {
    mkArchived("sample-change", "completed");

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "sample-change");

    expect(result.ok).toBe(true);
    expect(result.done).toBe(true);
    expect(result.started).toBe(false);
    expect(result.message).toBe("Archive complete for sample-change. Flow finished.");
  });
});

describe("runArchive: Quick mode", () => {
  test("quick_spec_revision moves the change directory and preserves flowMode: quick", () => {
    const changeDir = mkChange("quick-change", "quick_spec_revision", { flowMode: "quick" });
    const archiveDir = archiveDirFor("quick-change");

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "quick-change");

    expect(result.ok).toBe(true);
    expect(result.started).toBe(true);
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(archiveDir)).toBe(true);

    const flowState = JSON.parse(fs.readFileSync(path.join(archiveDir, "state.json"), "utf-8"));
    expect(flowState.activePhase).toBe("archive");
    expect(flowState.flowMode).toBe("quick");
  });

  test("an earlier quick phase refuses with a not-yet-final message", () => {
    mkChange("quick-change", "quick_implementation", { flowMode: "quick" });

    const result = runArchive(testTmpDir, DEFAULT_CONFIG, "quick-change");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("has not reached the final quick phase (quick_spec_revision)");
  });
});
