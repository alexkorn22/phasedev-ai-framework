import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createTempWorkspace, cleanupTempWorkspace } from "./helpers/temp-workspace";
import { resolveChangeDir } from "../src/entities/change/active-change";
import { AmbiguousChangeError, UnknownChangeError } from "../src/entities/change/change-errors";
import { findPendingArchiveState, findCompletedArchiveState, findArchiveStateForChange } from "../src/entities/change/archive-state";
import { loadFlowState, saveFlowState } from "../src/entities/change/flow-state";
import { resolveRoute } from "../src/features/phase-control/flow-route";
import { createChange } from "../src/features/phase-control/create-change";
import { listChanges, renderChanges } from "../src/features/flow-status/list-changes";
import { checkPhase } from "../src/features/phase-control/check-flow";
import { getFlowStatus } from "../src/features/flow-status/get-status";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { loadConfig } from "../src/entities/config/config";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";

function mkChange(root: string, name: string): string {
  const dir = path.join(root, ".phasedev", "changes", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 }));
  return dir;
}

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
| F1 | code | \`src/features/phase-control/flow-route.ts:94\` | Missing research routes to the research stage. | R1 |
| F2 | code | \`test/multi-change.test.ts:1\` | Fixture asserts design follows valid research. | SC1 |

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
| Approval scope | Exercise the flow controller fixture path. |
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
      nextSection += "\n\n### Check Evidence\n\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | `bun test unit` | pending |  |  |";
    }
    return nextSection;
  });
}

function mkImplementationReadyChange(root: string, name: string): string {
  const changeDir = path.join(root, ".phasedev", "changes", name);
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
  writeArtifact(path.join(changeDir, "iteration_plan.md"), withImplementationPlanContract(`
## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`));
  fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({ activePhase: "implementation", activeIteration: null, repairCycleCount: 0 }));
  return changeDir;
}

function mkArchived(root: string, name: string, status: "in_progress" | "completed"): string {
  const dir = path.join(root, ".phasedev", "changes", "archive", `2026-07-08-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".phase-archive.json"), JSON.stringify({
    status, changeName: name, archivePath: dir, startedAt: "2026-07-08T00:00:00.000Z",
    ...(status === "completed" ? { completedAt: "2026-07-08T01:00:00.000Z" } : {})
  }));
  return dir;
}

describe("resolveChangeDir", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("resolve"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("returns null when no changes exist", () => {
    expect(resolveChangeDir(root)).toBeNull();
  });

  test("returns the single change when name omitted", () => {
    const dir = mkChange(root, "alpha");
    expect(resolveChangeDir(root)).toBe(dir);
  });

  test("throws AmbiguousChangeError when several changes and no name", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    expect(() => resolveChangeDir(root)).toThrow(AmbiguousChangeError);
    expect(() => resolveChangeDir(root)).toThrow("Multiple changes exist: alpha, beta. Pass --change <name>.");
  });

  test("resolves a named change among several", () => {
    mkChange(root, "alpha");
    const beta = mkChange(root, "beta");
    expect(resolveChangeDir(root, "beta")).toBe(beta);
  });

  test("throws UnknownChangeError for a missing name, listing available", () => {
    mkChange(root, "alpha");
    expect(() => resolveChangeDir(root, "nope")).toThrow(UnknownChangeError);
    expect(() => resolveChangeDir(root, "nope")).toThrow('Unknown change "nope". Available changes: alpha.');
  });

  test("returns null (not throw) when the name matches a pending or completed archive", () => {
    mkArchived(root, "old-pending", "in_progress");
    mkArchived(root, "old-done", "completed");
    expect(resolveChangeDir(root, "old-pending")).toBeNull();
    expect(resolveChangeDir(root, "old-done")).toBeNull();
  });
});

describe("name-scoped archive state", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("arch"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("findPendingArchiveState picks the pending archive by changeName", () => {
    mkArchived(root, "one", "in_progress");
    mkArchived(root, "two", "in_progress");
    expect(findPendingArchiveState(root, "two")?.changeName).toBe("two");
    expect(findPendingArchiveState(root, "missing")).toBeNull();
  });

  test("findPendingArchiveState without name throws on two pending archives", () => {
    mkArchived(root, "one", "in_progress");
    mkArchived(root, "two", "in_progress");
    expect(() => findPendingArchiveState(root)).toThrow(AmbiguousChangeError);
  });

  test("findCompletedArchiveState matches by name even when an active change exists", () => {
    mkChange(root, "alpha");
    const done = mkArchived(root, "old-done", "completed");
    expect(findCompletedArchiveState(root, "old-done")).toBe(done);
    expect(findCompletedArchiveState(root, "alpha")).toBeNull();
  });

  test("findArchiveStateForChange finds any-status archive by changeName", () => {
    mkArchived(root, "old-done", "completed");
    expect(findArchiveStateForChange(root, "old-done")?.status).toBe("completed");
    expect(findArchiveStateForChange(root, "missing")).toBeNull();
  });
});

describe("flow state with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("state"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("loads and saves the named change's state independently", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    saveFlowState(root, { activePhase: "code_research", activeIteration: null, repairCycleCount: 0 }, "beta");
    expect(loadFlowState(root, "beta")?.activePhase).toBe("code_research");
    expect(loadFlowState(root, "alpha")?.activePhase).toBe("change_intake");
  });

  test("loads a pending-archive change's state by name", () => {
    mkChange(root, "alpha");
    const dir = mkArchived(root, "old-pending", "in_progress");
    fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify({ activePhase: "archive", activeIteration: null, repairCycleCount: 0 }));
    expect(loadFlowState(root, "old-pending")?.activePhase).toBe("archive");
  });

  test("returns null for a completed archived change", () => {
    mkArchived(root, "old-done", "completed");
    expect(loadFlowState(root, "old-done")).toBeNull();
  });
});

describe("resolveRoute with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("route"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("routes each named change independently", () => {
    const alpha = mkChange(root, "alpha");
    mkChange(root, "beta");
    const routeAlpha = resolveRoute(root, "alpha");
    expect(routeAlpha.kind).toBe("change_intake");
    expect(routeAlpha.activeChangePath).toBe(alpha);
    expect(resolveRoute(root, "beta").kind).toBe("change_intake");
  });

  test("a pending archive of another change does not hijack the named route", () => {
    mkArchived(root, "old-pending", "in_progress");
    const alpha = mkChange(root, "alpha");
    const route = resolveRoute(root, "alpha");
    expect(route.kind).toBe("change_intake");
    expect(route.activeChangePath).toBe(alpha);
  });
});

describe("createChange with multiple changes", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("create"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("creates a second change while another is unfinished", () => {
    mkChange(root, "alpha");
    const result = createChange(root, "beta");
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(root, ".phasedev", "changes", "beta", "state.json"))).toBe(true);
  });

  test("a pending archive of another change does not block creation", () => {
    mkArchived(root, "old-pending", "in_progress");
    expect(createChange(root, "beta").ok).toBe(true);
  });

  test("refuses a name that has a pending archive", () => {
    mkArchived(root, "old-pending", "in_progress");
    const result = createChange(root, "old-pending");
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Archive of "old-pending" is still in progress');
  });

  test("refuses a name colliding with an existing change", () => {
    mkChange(root, "alpha");
    const result = createChange(root, "alpha");
    expect(result.ok).toBe(false);
    expect(result.message).toContain('already exists');
  });

  test("a broken archive of another name does not block creation, but blocks its own name", () => {
    const brokenDir = path.join(root, ".phasedev", "changes", "archive", "2026-07-08-broken-x");
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, ".phase-archive.json"), "{broken");

    expect(createChange(root, "beta").ok).toBe(true);

    const result = createChange(root, "broken-x");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Archive state is invalid");
  });
});

describe("listChanges multi-change", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("list"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("reports each change's own phase and task summary", () => {
    const alpha = mkChange(root, "alpha");
    fs.writeFileSync(path.join(alpha, "intake_task.md"), "# Fix login flow\ndetails...\n");
    const beta = mkChange(root, "beta");
    fs.writeFileSync(path.join(beta, "state.json"), JSON.stringify({ activePhase: "implementation", activeIteration: 2, repairCycleCount: 0 }));

    const entries = listChanges(root);
    const a = entries.find(e => e.name === "alpha");
    const b = entries.find(e => e.name === "beta");
    expect(a?.phase).toBe("change_intake");
    expect(a?.taskSummary).toBe("Fix login flow");
    expect(b?.phase).toBe("implementation");
    expect(b?.activeIteration).toBe(2);
  });

  test("default list ignores the archive folder entirely, including pending archives", () => {
    mkArchived(root, "old-pending", "in_progress");
    mkArchived(root, "old-done", "completed");

    const entries = listChanges(root);
    expect(entries.find(e => e.name === "old-pending")).toBeUndefined();
    expect(entries.find(e => e.name?.includes("old-done"))).toBeUndefined();
  });

  test("--archived lists pending archives by their original slug and completed archives", () => {
    mkArchived(root, "old-pending", "in_progress");
    mkArchived(root, "old-done", "completed");

    const all = listChanges(root, true);
    const pending = all.find(e => e.name === "old-pending");
    expect(pending?.type).toBe("archived");
    expect(pending?.archiveStatus).toBe("in_progress");
    expect(all.some(e => e.type === "archived" && e.archiveStatus === "completed")).toBe(true);
  });

  test("--archived surfaces a broken .phase-archive.json with an error marker, absent by default", () => {
    const brokenDir = path.join(root, ".phasedev", "changes", "archive", "2026-07-08-broken-x");
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, ".phase-archive.json"), "{broken");

    expect(listChanges(root)).toEqual([]);

    const all = listChanges(root, true);
    const broken = all.find(e => e.name === "2026-07-08-broken-x");
    expect(broken?.type).toBe("archived");
    expect(broken?.error).toContain(".phase-archive.json");
  });

  test("a broken state.json becomes an error marker, not a crash", () => {
    const alpha = mkChange(root, "alpha");
    fs.writeFileSync(path.join(alpha, "state.json"), "{broken");
    const entry = listChanges(root).find(e => e.name === "alpha");
    expect(entry?.error).toContain("state.json");
  });

  test("renderChanges prints the empty-state hint", () => {
    expect(renderChanges([])).toBe("No changes. Run: phasedev create-change <name>.");
  });
});

describe("read-side features with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("read"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("checkPhase validates the named change among several", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    const result = checkPhase(root, undefined, "beta");
    expect(result.phase).toBe("change_intake");
  });

  test("getFlowStatus reports the named change", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    expect(getFlowStatus(root, "beta").activeChange).toBe("beta");
  });
});

describe("mutating features with changeName", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("mut"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("advanceFlow on the named change refuses without touching the other change", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    const result = advanceFlow(root, loadConfig(), "beta");
    expect(result.ok).toBe(false); // change_intake artifacts are missing — refusal is correct
    expect(loadFlowState(root, "alpha")?.activePhase).toBe("change_intake");
  });

  test("advanceFlow --change on a completed archive reports finished", () => {
    mkArchived(root, "old-done", "completed");
    mkChange(root, "alpha");
    const result = advanceFlow(root, loadConfig(), "old-done");
    expect(result.finished).toBe(true);
  });

  test("startArchiveStage archives change B even while change A has a pending archive", () => {
    mkArchived(root, "stuck", "in_progress");
    const beta = mkChange(root, "beta");
    const prompt = startArchiveStage(root, beta, new Date("2026-07-08T12:00:00Z"));
    expect(prompt.blocked ?? false).toBe(false);
    expect(fs.existsSync(beta)).toBe(false); // moved into archive
    expect(findPendingArchiveState(root, "beta")?.status).toBe("in_progress");
  });
});

describe("rendered self-check commands carry --change for multi-change projects", () => {
  let root: string;
  beforeEach(() => { root = createTempWorkspace("cmd"); });
  afterEach(() => cleanupTempWorkspace(root));

  test("getPhasePrompt for a named change among several renders the self-check with --change", () => {
    mkChange(root, "alpha");
    mkChange(root, "beta");
    const result = getPhasePrompt(root, loadConfig(), "beta");
    expect(result.prompt).toContain("phasedev check");
    expect(result.prompt).toMatch(/phasedev check --project-path "[^"]*" --change "beta"/);
  });

  test("getPhasePrompt on a single-change project renders the self-check without --change", () => {
    mkChange(root, "alpha");
    const result = getPhasePrompt(root, loadConfig());
    expect(result.prompt).toContain("phasedev check");
    expect(result.prompt).not.toContain("--change");
  });

  test("missingActiveIterationBlocker for a named change among several carries --change in the advance recovery command", () => {
    mkChange(root, "alpha");
    mkImplementationReadyChange(root, "beta");

    const result = getPhasePrompt(root, loadConfig(), "beta");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("state.json is missing activeIteration");
    expect(result.prompt).toMatch(/phasedev advance --change "beta"/);
  });
});
