import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getInitPrompt, getNextPrompt } from "../src/features/stage-control";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

function setupTestDir() {
  testTmpDir = createTempWorkspace("flow-controller");
}

function cleanupTestDir() {
  cleanupTempWorkspace(testTmpDir);
}

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved ? "true" : "false"}\n---\n${body}`, "utf-8");
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

function validationFindings(verdict: "ready" | "ready_with_risks" | "repair_required" | "repaired", type: "phase" | "final", rows = ""): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-29
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}

function withImplementationPlanContract(planContent: string): string {
  const normalizedPlanContent = planContent.trim().replace(/^#\s+.*\n+/, "").trim();
  const withBundle = normalizedPlanContent.includes("## Generation Bundle") ? normalizedPlanContent : `
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
| Tests | yes | Use fixture commands from rules.md. |
| Docs/specs | not_applicable | No documentation behavior is part of this fixture. |
| Migrations | not_applicable | No persistence changes are part of this fixture. |
| Feature flags/rollout | not_applicable | No rollout controls are part of this fixture. |
| Observability | not_applicable | No observability changes are part of this fixture. |
| Rollback path | not_applicable | Revert the fixture change if needed. |

## Phase Overview

| Phase | Goal | Main work items | Required checks |
|---|---|---|---|
| Phase 1 | Complete fixture phase. | 1.1 | unit |

${normalizedPlanContent}`;

  return withBundle.replace(/^## Phase \d+:.*(?:\n(?!## Phase \d+:).*)*/gm, section => {
    let nextSection = section;
    const hasIncompleteTask = /^-\s*\[\s*(?: |~|\/)\s*\]/im.test(section);
    const resultStatus = hasIncompleteTask ? "pending" : "passed";
    const evidenceStr = hasIncompleteTask ? "" : "passed unit tests";

    if (!/^###\s+Goal\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Goal\n\nComplete the fixture phase. Satisfies R1 and SC1.";
    } else {
      // If Goal exists, append requirement mapping to it
      nextSection = nextSection.replace(/(###\s+Goal\s*)/i, "$1\nSatisfies R1 and SC1.\n");
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
      nextSection += `\n\n### Check Evidence\n\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | \`bun test unit\` | ${resultStatus} | ${evidenceStr} |  |`;
    }
    return nextSection;
  });
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
| F1 | code | \`src/features/stage-control/flow-route.ts:94\` | Missing research routes to the research stage. | R1 |
| F2 | code | \`test/controller.test.ts:275\` | Controller fixture asserts design follows valid research. | SC1 |

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

function setupChange(planContent: string, options: { findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), options.designApproved ?? true);
  writeArtifact(path.join(changeDir, "implementation_plan.md"), withImplementationPlanContract(planContent), options.planApproved ?? true);

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  return changeDir;
}

describe("flow controller typed stages", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("init prompt reports init stage", () => {
    const result = getInitPrompt(testTmpDir);

    expect(result.command).toBe("init");
    expect(result.stage).toBe("init");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("## Init State");
    expect(result.prompt).toContain("command: init");
    expect(result.prompt).toContain("current_stage: setup");
    expect(result.prompt).toContain("route_kind: setup");
    expect(result.prompt).toContain("active_change: none");
    expect(result.prompt).toContain("may_modify_files: false");
    expect(result.prompt).toContain("Allowed persistent artifacts: none");
    expect(result.prompt).not.toContain("Stage-specific skill policy");
    expect(result.prompt).not.toContain("Do not infer allowed skills from this init prompt.");
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev", "changes"))).toBe(false);
  });

  test("next prompt blocks approved PRD that does not satisfy Intent contract", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n\n## Intent\n");
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("setup");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Invalid prd.md");
    expect(result.prompt).toContain("Intent field `Change type` must be present and non-empty.");
  });

  test("init prompt reports active change and current flow stage without running next", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint
`);

    const result = getInitPrompt(testTmpDir);

    expect(result.stage).toBe("init");
    expect(result.prompt).toContain("current_stage: implementation");
    expect(result.prompt).toContain("route_kind: phase");
    expect(result.prompt).toContain(`active_change: file://${changeDir}`);
    expect(fs.existsSync(changeDir)).toBe(true);
  });

  test("init prompt reports archive-ready state without moving active change", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    const result = getInitPrompt(testTmpDir);

    expect(result.prompt).toContain("current_stage: archive");
    expect(result.prompt).toContain("route_kind: archive_ready");
    expect(result.prompt).toContain(`active_change: file://${changeDir}`);
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
  });

  test("init prompt blocks invalid active change state without throwing", () => {
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "first-change"), { recursive: true });
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "second-change"), { recursive: true });

    const result = getInitPrompt(testTmpDir);

    expect(result.command).toBe("init");
    expect(result.stage).toBe("init");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Invalid flow state");
    expect(result.prompt).toContain("Multiple active changes found in .phasedev/changes");
    expect(result.prompt).toContain("phasedev init performed no filesystem changes");
    expect(result.prompt).toContain("Fix the flow state before running `phasedev next`.");
  });

  test("missing active change routes to setup stage", () => {
    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("setup");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Stage 0. AI Layer Setup.");
    expect(result.prompt).toContain(`current project repository at \`${testTmpDir}\``);
    expect(result.prompt).toContain("this absolute path is the only target repository for repository inspection and artifact writes");
    expect(result.prompt).toContain("Artifact Build Contract: prd.md");
    expect(result.prompt).toContain("Artifact Build Contract: rules.md");
    expect(result.prompt).toContain(`Output path: \`${path.join(testTmpDir, ".phasedev", "changes", "<derive-slug-from-final-task>", "prd.md")}\``);
    expect(result.prompt).toContain("Before creating the change folder, prevent slug collisions");
    expect(result.prompt).toContain("derive the next non-conflicting slug by appending `-2`, then `-3`");
    expect(result.prompt).toContain("do not overwrite or reuse it");
    expect(result.prompt).toContain("Retrieval order: project instructions first, then package/test metadata, then only files or directories directly relevant to the requested change");
    expect(result.prompt).toContain("Context budget: at most one broad file listing, plus one focused package/workspace listing when needed for nested or monorepo package discovery");
    expect(result.prompt).toContain("Stop condition: stop reading once you can fill `Intent`, `R#`, `SC#`, risk boundaries, and `rules.md` gates without material assumptions");
    expect(result.prompt).toContain("embedded template is the only artifact structure");
    expect(result.prompt.match(/Canonical fill rules:/g) ?? []).toHaveLength(2);
    expect(result.prompt).not.toContain("Strict fill rules:");
    expect(result.prompt).toContain("Proceed without a separate confirmation stop when the current context already supplies enough acceptance, evidence, and risk data");
    expect(result.prompt).toContain("manual: <named method supported by user/repo evidence>");
    expect(result.prompt).toContain("only when the repository is clearly new/minimal: no package/test metadata, no project commands, and no existing file or user answer identifies a better method");
    expect(result.prompt).toContain("first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route setup_approval` subcommand");
    expect(result.prompt).toContain("Final response must use this compact template and include no extra sections");
    expect(result.prompt).toContain("Change slug: <slug>");
    expect(result.prompt).toContain("Skill compliance: <configured/router skills used; skipped/unavailable skills>");
    expect(result.prompt).toContain("Self-check: <exact command> -> <result>");
    expect(result.prompt.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(result.prompt).toContain("## Intent");
    expect(result.prompt).toContain("# Rules");
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev"))).toBe(false);
  });

  test("design prompt includes inline artifact contract for architecture design", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("design");
    expect(result.prompt).toContain("Artifact Build Contract: architecture/design.md");
    expect(result.prompt).toContain(`Output path: \`${path.join(changeDir, "architecture", "design.md")}\``);
    expect(result.prompt).toContain("embedded template is the only artifact structure");
    expect(result.prompt).toContain("# Design");
    expect(result.prompt).toContain("## Architecture Package Map");
    expect(result.prompt).toContain("Use this bounded retrieval order before designing");
    expect(result.prompt).toContain("Stop retrieval when every `R#` and `SC#` can be mapped to valid research evidence");
    expect(result.prompt).toContain("Preserve the six-section structure from the embedded artifact template exactly");
    expect(result.prompt).toContain("Use `## Executive Summary` as the compact visual review surface");
    expect(result.prompt).toContain("If evidence is incomplete but the missing detail does not change approval scope");
    expect(result.prompt).toContain("`## Risks & Open Questions` is for bounded review notes that do not block approval");
    expect(result.prompt).toContain("Final response must be compact and include");
    expect(result.prompt).toContain("configured/router skills used, skipped, or unavailable");
    expect(result.prompt).toContain("--expect-route design_approval");
  });

  test("research prompt constrains repository evidence to target project root", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("research");
    expect(result.prompt).toContain(`Target project root for repository evidence: \`${testTmpDir}\``);
    expect(result.prompt).toContain(`Run all code, config, test, and runtime evidence searches under \`${testTmpDir}\` unless an explicit input artifact path in this prompt points elsewhere.`);
    expect(result.prompt).toContain("Context budget: use 2-4 broad file listings/searches total as a soft cap, at most one per target area");
    expect(result.prompt).not.toContain("Context budget: use a small bounded number of broad file listings/searches");
    expect(result.prompt).not.toContain("Context budget: use at most one broad file listing/search to map candidate areas");
    expect(result.prompt).toContain("If the `phasedev` executable name is unavailable, first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route design` subcommand");
    expect(result.prompt).toContain("repository-confirmed `npm exec -- phasedev check --project-path ... --expect-route design` or `bunx phasedev check --project-path ... --expect-route design` form");
  });

  test("implementation route reports implementation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("implementation");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Stage 4. Implementation.");
    expect(result.prompt).toContain("Check Evidence");
    expect(result.prompt).toContain(`phasedev check --project-path "${testTmpDir}" --expect-route phase_validation`);
  });

  test("completed multi-phase phase with passed evidence routes to phase validation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | unit tests passed for API endpoint | none |

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("phase_validation");
    expect(result.prompt).toContain("Stage 5A. Phase Validation.");
    expect(result.prompt).toContain("Artifact Build Contract: validation_findings.md");
    expect(result.prompt).toContain("Check Evidence");
  });

  test("completed single-phase route reports phase validation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("phase_validation");
    expect(result.prompt).toContain("Stage 5A. Phase Validation.");
    expect(result.prompt).toContain("Check Evidence");
  });

  test("completed tasks with pending check evidence stay in implementation", () => {
    setupChange(`
# Plan

## Phase 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | pending |  |  |
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("implementation");
    expect(result.prompt).toContain("Stage 4. Implementation.");
    expect(result.prompt).not.toContain("Stage 5A. Phase Validation.");
  });

  test("completed tasks with failed check evidence stay in implementation", () => {
    setupChange(`
# Plan

## Phase 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | failed | unit test failed | rerun after fix |
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("implementation");
    expect(result.prompt).toContain("Stage 4. Implementation.");
    expect(result.prompt).not.toContain("Stage 5A. Phase Validation.");
  });

  test("validated single-phase route reports final validation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "phase")
    });

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("final_validation");
    expect(result.prompt).toContain("Stage 5B. Final Validation.");
    expect(result.prompt).toContain("Artifact Build Contract: validation_findings.md");
    expect(result.prompt).toContain(`phasedev check-validation --project-path "${testTmpDir}"`);
    expect(result.prompt).toContain("--scope final");
    expect(result.prompt).toContain("## Controller Observed Changed Files");
    expect(result.prompt).toContain("Generation Bundle");
    expect(result.prompt).toContain("Intent");
  });

  test("repair route reports repair stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "phase", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |\n")
    });

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("repair");
    expect(result.prompt).toContain("Stage 5R. Repair Loop.");
  });

  test("archive route reports archive stage and moves active change to pending archive", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const result = getNextPrompt(testTmpDir);
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);
    const statePath = path.join(archiveDir, ".flow-archive.json");

    expect(result.stage).toBe("archive");
    expect(result.prompt).toContain("Stage 6. Archive.");
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
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const first = getNextPrompt(testTmpDir);
    const second = getNextPrompt(testTmpDir);

    expect(first.stage).toBe("archive");
    expect(second.stage).toBe("archive");
    expect(second.prompt).toContain(".flow-archive.json");
    expect(second.prompt).toContain(".phasedev/changes/archive");
  });

  test("malformed archive state blocks archive routing instead of falling through", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    const statePath = path.join(archiveDir, ".flow-archive.json");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(statePath, "{ malformed json", "utf-8");

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("archive");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(result.prompt).toContain("Invalid archive state.");
    expect(result.prompt).toContain(statePath);
    expect(result.prompt).toContain(".flow-archive.json is not valid JSON");
    expect(result.prompt).not.toContain("Stage 0. AI Layer Setup.");
  });

  test("approval blocker reports blocked gate stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      designApproved: false
    });

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("design");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Design requires review");
  });
});
