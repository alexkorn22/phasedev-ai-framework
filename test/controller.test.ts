import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getInitPrompt } from "../src/features/phase-control";
import { getRoutePrompt } from "../src/features/phase-control/get-route-prompt";
import { createArchiveState } from "../src/entities/change/archive-state";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { resolveRoute } from "../src/features/phase-control/flow-route";
import { loadFlowState } from "../src/entities/change/flow-state";
import { validatePhase } from "../src/features/phase-control/phase-validators";
import { buildChangePaths } from "../src/entities/change/paths";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
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

function validationFindings(verdict: "ready" | "ready_with_risks" | "repair_required" | "repaired", type: "iteration" | "final", rows = ""): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-29
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
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
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), options.designApproved ?? true);
  writeArtifact(path.join(changeDir, "iteration_plan.md"), withImplementationPlanContract(planContent), options.planApproved ?? true);

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
    expect(result.phase).toBe("init");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("## Init State");
    expect(result.prompt).toContain("command: init");
    expect(result.prompt).toContain("current_phase: change_intake");
    expect(result.prompt).toContain("route_kind: change_intake");
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

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("change_intake");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Invalid prd.md");
    expect(result.prompt).toContain("Intent field `Change type` must be present and non-empty.");
  });

  test("init prompt reports active change and current flow stage without running next", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);

    const result = getInitPrompt(testTmpDir);

    expect(result.phase).toBe("init");
    expect(result.prompt).toContain("current_phase: implementation");
    expect(result.prompt).toContain("route_kind: iteration");
    expect(result.prompt).toContain(`active_change: file://${changeDir}`);
    expect(fs.existsSync(changeDir)).toBe(true);
  });

  test("init prompt reports archive-ready state without moving active change", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    const result = getInitPrompt(testTmpDir);

    expect(result.prompt).toContain("current_phase: archive");
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
    expect(result.phase).toBe("init");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Invalid flow state");
    expect(result.prompt).toContain("Multiple active changes found in .phasedev/changes");
    expect(result.prompt).toContain("phasedev init performed no filesystem changes");
    expect(result.prompt).toContain("Fix the flow state before running `phasedev phase` or `phasedev advance`.");
  });

  test("missing active change routes to setup stage", () => {
    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("change_intake");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Phase 1. Change Intake.");
    expect(result.prompt).toContain(`current project repository at \`${testTmpDir}\``);
    expect(result.prompt).toContain("this absolute path is the only target repository for repository inspection and artifact writes");
    expect(result.prompt).toContain("Artifact Build Contract: prd.md");
    expect(result.prompt).toContain("Artifact Build Contract: execution_contract.md");
    expect(result.prompt).toContain(`Output path: \`${path.join(testTmpDir, ".phasedev", "changes", "<derive-slug-from-final-task>", "prd.md")}\``);
    expect(result.prompt).toContain("Before creating the change folder, prevent slug collisions");
    expect(result.prompt).toContain("derive the next non-conflicting slug by appending `-2`, then `-3`");
    expect(result.prompt).toContain("do not overwrite or reuse it");
    expect(result.prompt).toContain("Retrieval order: project instructions first, then package/test metadata, then only files or directories directly relevant to the requested change");
    expect(result.prompt).toContain("Context budget: at most one broad file listing, plus one focused package/workspace listing when needed for nested or monorepo package discovery");
    expect(result.prompt).toContain("Stop condition: stop reading once you can fill `Intent`, `R#`, `SC#`, risk boundaries, and `execution_contract.md` gates without material assumptions");
    expect(result.prompt).toContain("embedded template is the only artifact structure");
    expect(result.prompt.match(/Canonical fill rules:/g) ?? []).toHaveLength(2);
    expect(result.prompt).not.toContain("Strict fill rules:");
    expect(result.prompt).toContain("Proceed without a separate confirmation stop when the current context already supplies enough acceptance, evidence, and risk data");
    expect(result.prompt).toContain("manual: <named method supported by user/repo evidence>");
    expect(result.prompt).toContain("only when the repository is clearly new/minimal: no package/test metadata, no project commands, and no existing file or user answer identifies a better method");
    expect(result.prompt).toContain("If the `phasedev` executable is unavailable, look once for a controller-provided or local equivalent that runs the same `check");
    expect(result.prompt).toContain("Final response must use this compact template and include no extra sections");
    expect(result.prompt).toContain("Change slug: <slug>");
    expect(result.prompt).toContain("Skill compliance: one entry per configured router, configured main, router-selected, and selected additional skill.");
    expect(result.prompt).toContain("Self-check: <exact command> -> <result>");
    expect(result.prompt.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(result.prompt).toContain("## Intent");
    expect(result.prompt).toContain("# Execution Contract");
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev"))).toBe(false);
  });

  test("design prompt includes inline artifact contract for architecture design", () => {
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

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("technical_design");
    expect(result.prompt).toContain("Artifact Build Contract: architecture/design.md");
    expect(result.prompt).toContain(`Output path: \`${path.join(changeDir, "architecture", "design.md")}\``);
    expect(result.prompt).toContain("embedded template is the only artifact structure");
    expect(result.prompt).toContain("# Design");
    expect(result.prompt).toContain("## Architecture Package Map");
    expect(result.prompt).toContain("Use this bounded retrieval order before designing");
    expect(result.prompt).toContain("If a phase input is too large for useful full reading, first extract its headings, tables, and IDs (`Intent`, `R#`, `SC#`, `F#`, `S#`, risk boundaries, test commands)");
    expect(result.prompt).toContain("Stop retrieval when every `R#` and `SC#` can be mapped to valid research evidence");
    expect(result.prompt).toContain("Preserve the six-section structure from the embedded artifact template exactly");
    expect(result.prompt).toContain("do not add headings beyond the required `# Design` title and those six required `##` sections");
    expect(result.prompt).not.toContain("Use headings, short paragraphs, bullets, tables, blockquotes, and bold where they help readability.");
    expect(result.prompt).toContain("`not_applicable: <short reason>`");
    expect(result.prompt).toContain("not_applicable: <reason>` only when there is no material contract surface");
    expect(result.prompt).toContain("Optional Mermaid/callouts/visual markers must never change YAML frontmatter, table headers, required section structure");
    expect(result.prompt).toContain("Each linked subdocument must have a minimal review contract");
    expect(result.prompt).toContain("Use `## Executive Summary` as the compact visual review surface");
    expect(result.prompt).toContain("If evidence is incomplete but the missing detail does not change approval scope");
    expect(result.prompt).toContain("`assumption: ...` or `risk: ...`");
    expect(result.prompt).toContain("Treat material unknowns as blockers before finalizing the artifact");
    expect(result.prompt).toContain("`not_applicable: <reason>` is a valid mapping only when justified by the validated research record");
    expect(result.prompt).toContain("Do not loop on unavailable commands, and do not report the phase ready while the self-check has not passed.");
    expect(result.prompt).toContain("`## Risks & Open Questions` is for bounded review notes that do not block approval");
    expect(result.prompt).toContain("Final response must be compact and include");
    expect(result.prompt).toContain("Skill compliance: one entry per configured router, configured main, router-selected, and selected additional skill.");
    expect(result.prompt).not.toContain("configured/router skills used, skipped, or unavailable");
    expect(result.prompt).toContain("Self-check command:");

    // Self-check no longer uses --expect-route; verify it's the simplified form
    const checkCmdIndex = result.prompt.indexOf("phasedev check");
    const nextNewline = result.prompt.indexOf("\n", checkCmdIndex);
    const checkLine = nextNewline > -1 ? result.prompt.slice(checkCmdIndex, nextNewline) : "";
    expect(checkLine).not.toContain("--expect-route");
  });

  test("research prompt constrains repository evidence to target project root", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
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

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("code_research");
    expect(result.prompt).toContain(`Target project root for repository evidence: \`${testTmpDir}\``);
    expect(result.prompt).toContain("Run repository code, config, test, and runtime evidence searches under the active project root unless an explicit input path in this prompt points elsewhere.");
    expect(result.prompt).toContain("Context budget: use 2-4 broad file listings/searches total as a soft cap, at most one per target area");
    expect(result.prompt).not.toContain("Context budget: use a small bounded number of broad file listings/searches");
    expect(result.prompt).not.toContain("Context budget: use at most one broad file listing/search to map candidate areas");
    expect(result.prompt).toContain("If the `phasedev` executable is unavailable, look once for a controller-provided or local equivalent that runs the same `check");
    expect(result.prompt).not.toContain("--expect-route");
  });

  test("implementation route reports implementation stage", () => {
    setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("implementation");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Phase 5. Implementation.");
    expect(result.prompt).toContain("Check Evidence");
    expect(result.prompt).toContain(`phasedev check --project-path "${testTmpDir}"`);
  });

  test("completed multi-phase phase with passed evidence routes to phase validation stage", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | unit tests passed for API endpoint | none |

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`);

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("iteration_validation");
    expect(result.prompt).toContain("Phase 6A. Iteration Validation.");
    expect(result.prompt).toContain("Artifact Build Contract: validation_findings.md");
    expect(result.prompt).toContain("Check Evidence");
    expect(result.prompt).toContain("type: iteration");
    expect(result.prompt).toContain("verdict must be exactly one of: ready, ready_with_risks, repair_required, repaired.");
    expect(result.prompt).toContain("repaired: use only in Repair Loop");
  });

  test("completed single-phase route reports phase validation stage", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`);

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("iteration_validation");
    expect(result.prompt).toContain("Phase 6A. Iteration Validation.");
    expect(result.prompt).toContain("Check Evidence");
  });

  test("completed tasks with pending check evidence stay in implementation", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]

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

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("Phase 5. Implementation.");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("completed tasks with failed check evidence stay in implementation", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]

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

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("Phase 5. Implementation.");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("completed tasks with blocked check evidence stay in implementation", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | blocked | command unavailable in current sandbox | rerun when environment is available |
`);

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("Phase 5. Implementation.");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("current phase implementation prompt uses required phase check commands", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [ ] 1.1 Implement endpoint

### Checks

- full: \`bun test full\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| full | \`bun test full\` | pending |  |  |
`);

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("- full: `bun test full`");
    expect(result.prompt).not.toContain("- unit: `bun test unit`");
  });

  test("completed tasks with stale required check command evidence stay in implementation", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- phase: \`bun test phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test unit\` | passed | unit passed but phase gate did not run | wrong command |
`);

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("Phase 5. Implementation.");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("validated single-phase route reports final validation stage", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "iteration")
    });

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("final_validation");
    expect(result.prompt).toContain("Phase 6B. Final Validation.");
    expect(result.prompt).toContain("Artifact Build Contract: validation_findings.md");
    expect(result.prompt).toContain(`phasedev check-validation --project-path "${testTmpDir}"`);
    expect(result.prompt).toContain("--scope final");
    expect(result.prompt).toContain("## Controller Observed Changed Files");
    expect(result.prompt).toContain("Generation Bundle");
    expect(result.prompt).toContain("Intent");
    expect(result.prompt).toContain("type: final");
    expect(result.prompt).toContain("verdict must be exactly one of: ready, ready_with_risks, repair_required.");
    expect(result.prompt).not.toContain("type: iteration");
    expect(result.prompt).not.toContain("repaired: use only in Repair Loop");
  });

  test("repair route reports repair stage", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |\n")
    });

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("finding_repair");
    expect(result.prompt).toContain("Phase 6R. Finding Repair.");
  });

  test("verdict-only conflict with still-open blocking findings routes to finding_repair via the typed issue code", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repaired", "iteration", "| F1 | open | MUST-FIX | implementation | Iteration 1 | API response omits required error handling. | Add error mapping. |\n")
    });

    const route = resolveRoute(testTmpDir);

    expect(route.kind).toBe("finding_repair");
  });

  test("repaired verdict routes to the state.json-tracked active iteration, not the first not_started one", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("repaired", "iteration")
    });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "finding_repair", activeIteration: 2 }, null, 2) + "\n",
      "utf-8"
    );

    const route = resolveRoute(testTmpDir);

    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.activeIteration.id).toBe(2);
      expect(route.phase).toBe("iteration_validation");
    }
  });

  test("archive_ready prompt resolution never mutates; startArchiveStage moves active change to pending archive", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const promptResult = getRoutePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(promptResult.phase).toBe("archive");
    expect(promptResult.blocked).toBe(true);
    expect(promptResult.prompt).toContain("phasedev advance");
    expect(fs.existsSync(changeDir)).toBe(true);

    const result = startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);
    const statePath = path.join(archiveDir, ".phase-archive.json");

    expect(result.phase).toBe("archive");
    expect(result.prompt).toContain("Phase 7. Archive.");
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8"))).toMatchObject({
      status: "in_progress",
      changeName: "sample-change",
      archivePath: archiveDir
    });
  });

  test("pending archive state resumes archive prompt for archived change", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const first = startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);
    const second = getRoutePrompt(testTmpDir, DEFAULT_CONFIG);

    expect(first.phase).toBe("archive");
    expect(second.phase).toBe("archive");
    expect(second.prompt).toContain(".phase-archive.json");
    expect(second.prompt).toContain(".phasedev/changes/archive");
  });

  test("malformed archive state blocks archive routing instead of falling through", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    const statePath = path.join(archiveDir, ".phase-archive.json");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(statePath, "{ malformed json", "utf-8");

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("archive");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(result.prompt).toContain("Invalid archive state.");
    expect(result.prompt).toContain(statePath);
    expect(result.prompt).toContain(".phase-archive.json is not valid JSON");
    expect(result.prompt).not.toContain("Phase 1. Change Intake.");
  });

  test("validatePhase iteration-number matching rejects prefix false positives like '10' for iteration 1", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    const paths = buildChangePaths(changeDir);
    fs.writeFileSync(paths.findingsPath, validationFindings("ready", "iteration", "| F1 | resolved | MUST-FIX | implementation | 10 | Unrelated to iteration 1. | n/a |\n"), "utf-8");

    const result = validatePhase(testTmpDir, "iteration_validation", paths, 1);

    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("No findings reference iteration 1");
  });

  test("validatePhase iteration-number matching accepts exact and 'Iteration N' style labels", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    const paths = buildChangePaths(changeDir);
    fs.writeFileSync(paths.findingsPath, validationFindings("ready", "iteration", "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Matches active iteration. | n/a |\n"), "utf-8");

    const result = validatePhase(testTmpDir, "iteration_validation", paths, 1);

    expect(result.ok).toBe(true);
  });

  test("loadFlowState throws a descriptive error on syntactically invalid state.json", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, "state.json"), "{ not valid json", "utf-8");

    expect(() => loadFlowState(testTmpDir)).toThrow("Invalid flow state");
  });

  test("loadFlowState throws on unknown activePhase instead of silently dropping the phase lock", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({ activePhase: "no_such_phase", activeIteration: null }), "utf-8");

    expect(() => loadFlowState(testTmpDir)).toThrow("unknown activePhase");
  });

  test("advanceFlow reports invalid archive state instead of a generic 'cannot locate' message", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), "{ malformed json", "utf-8");
    fs.writeFileSync(path.join(archiveDir, "state.json"), JSON.stringify({ activePhase: "archive", activeIteration: null }, null, 2) + "\n", "utf-8");

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Archive state is invalid");
    expect(result.message).toContain(".phase-archive.json is not valid JSON");
    expect(result.message).not.toContain("Cannot locate change directory");
  });

  test("archive stage resumes after crash between state-write and move (idempotent retry)", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    // Simulate a crash after the archive-state marker was written into the still-active
    // change dir but before the directory was moved (Phase 1 done, Phase 2 not run).
    createArchiveState("sample-change", archiveDir, new Date(), changeDir);
    expect(fs.existsSync(path.join(changeDir, ".phase-archive.json"))).toBe(true);
    expect(fs.existsSync(changeDir)).toBe(true);

    const result = startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);

    expect(result.phase).toBe("archive");
    expect(result.blocked).toBeFalsy();
    expect(fs.existsSync(changeDir)).toBe(false);
    const statePath = path.join(archiveDir, ".phase-archive.json");
    expect(fs.existsSync(statePath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8"))).toMatchObject({
      status: "in_progress",
      changeName: "sample-change",
      archivePath: archiveDir
    });
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8")).movedAt).toBeDefined();
  });

  test("advanceFlow with autoApprove approves the gated artifact and advances", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, {
      designApproved: false
    });
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({ activePhase: "technical_design", activeIteration: null }, null, 2) + "\n", "utf-8");

    const result = advanceFlow(testTmpDir, { ...DEFAULT_CONFIG, autoApprove: true });

    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("implementation");
    const design = fs.readFileSync(path.join(changeDir, "architecture", "design.md"), "utf-8");
    expect(design).toContain("approved: true");
    expect(design).toContain("PhaseDev autoApprove");
  });

  test("advanceFlow without autoApprove still refuses at the approval gate", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, {
      designApproved: false
    });
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({ activePhase: "technical_design", activeIteration: null }, null, 2) + "\n", "utf-8");

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("technical_design_approval");
  });

  test("approval blocker reports blocked gate stage", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      designApproved: false
    });

    const result = getRoutePrompt(testTmpDir);

    expect(result.phase).toBe("technical_design");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Design requires review");
  });

  test("advance refuses and leaves state.json untouched when the required plan flip cannot be applied", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 01: API [ ]
- [ ] 1.1 Implement endpoint
`);
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(statePath, JSON.stringify({ activePhase: "iteration_planning", activeIteration: null }, null, 2) + "\n", "utf-8");

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("iteration_plan.md could not be updated");
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8")).activePhase).toBe("iteration_planning");
  });

  test("advance to archive writes activePhase archive into the state.json that travels with the change", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });
    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);

    const archivedState = JSON.parse(fs.readFileSync(path.join(archiveDir, "state.json"), "utf-8"));
    expect(archivedState.activePhase).toBe("archive");
  });

  test("advance blocks when state.json phase and the artifact-derived route disagree", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
    fs.rmSync(path.join(changeDir, "architecture", "design.md"));
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(statePath, JSON.stringify({ activePhase: "implementation", activeIteration: 1 }, null, 2) + "\n", "utf-8");

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("state.json phase: implementation");
    expect(result.message).toContain("artifact-derived phase: technical_design");
    expect(JSON.parse(fs.readFileSync(statePath, "utf-8")).activePhase).toBe("implementation");
  });

  test("phase prompt blocks when state.json phase and the artifact-derived route disagree", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
    fs.rmSync(path.join(changeDir, "architecture", "design.md"));
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({ activePhase: "implementation", activeIteration: 1 }, null, 2) + "\n", "utf-8");

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);

    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("state.json phase: implementation");
    expect(result.prompt).toContain("artifact-derived phase: technical_design");
  });

  test("phase prompt blocks implementation when state.json is missing activeIteration", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({ activePhase: "implementation" }, null, 2) + "\n", "utf-8");

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);

    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("state.json is missing activeIteration");
  });
});
