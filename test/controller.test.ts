import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getInitPrompt } from "../src/features/phase-control";
import { getRoutePrompt } from "../src/features/phase-control/get-route-prompt";
import { createArchiveState, findCompletedArchiveState } from "../src/entities/change/archive-state";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { resolveRoute } from "../src/features/phase-control/flow-route";
import { loadFlowState } from "../src/entities/change/flow-state";
import { validatePhase, validatePhaseExit } from "../src/features/phase-control/phase-validators";
import { buildChangePaths } from "../src/entities/change/paths";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";
import { reopenPhase, ReopenablePhase } from "../src/features/phase-control/reopen-phase";
import { syncState } from "../src/features/phase-control/sync-state";
import { checkPhase } from "../src/features/phase-control/check-flow";
import { addFinding } from "../src/features/artifact-ops/manage-findings";

let testTmpDir: string;

function setupTestDir() {
  testTmpDir = createTempWorkspace("flow-controller");
}

function cleanupTestDir() {
  cleanupTempWorkspace(testTmpDir);
}

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (approved) {
    fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(filePath, `---\napproved: false\n---\n${body}`, "utf-8");
  }
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

  test("init prompt blocks ambiguous active change state without throwing", () => {
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "first-change"), { recursive: true });
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "second-change"), { recursive: true });

    const result = getInitPrompt(testTmpDir);

    expect(result.command).toBe("init");
    expect(result.phase).toBe("init");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Ambiguous flow state");
    expect(result.prompt).toContain("Multiple changes exist: first-change, second-change. Pass --change <name>.");
    expect(result.prompt).toContain("phasedev init performed no filesystem changes");
    expect(result.prompt).toContain("Tip: Use `phasedev list` to see all changes and their status.");
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
    expect(result.prompt).toContain("Skill compliance: one entry per environment-selected skill.");
    expect(result.prompt).toContain("When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`");
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
    expect(result.prompt).toContain("Skill compliance: one entry per environment-selected skill.");
    expect(result.prompt).toContain("When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`");
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

  test("iteration_validation contract instructs the agent to commit after a passing verdict", () => {
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
    expect(result.prompt).toContain("commit the iteration");
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

  test("recommended threshold routes an open RECOMMENDED finding to finding_repair", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Naming is inconsistent. | Rename for clarity. |\n")
    });

    expect(resolveRoute(testTmpDir, undefined, "recommended").kind).toBe("finding_repair");
  });

  test("must_fix (default) does not route an open RECOMMENDED finding to finding_repair", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Naming is inconsistent. | Rename for clarity. |\n")
    });

    expect(resolveRoute(testTmpDir).kind).not.toBe("finding_repair");
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

  test("repaired verdict with null activeIteration picks finding's iteration, not first not_started", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      // Findings with "repaired" verdict, no open MUST-FIX, but an open non-blocking
      // finding that points to iteration 1.  The route should re-validate iteration 1
      // (from the open finding's iteration field), not skip to iteration 2.
      findings: validationFindings("repaired", "iteration", "| F1 | open | RECOMMENDED | implementation | 1 | Non-blocking note. | Review. |\n")
    });
    // Override state.json: activePhase=finding_repair, activeIteration=null
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "finding_repair", activeIteration: null, repairCycleCount: 1 }, null, 2) + "\n",
      "utf-8"
    );

    const route = resolveRoute(testTmpDir);

    // Should route to iteration_validation for iteration 1 (from open finding),
    // not iteration 2 (first not_started)
    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.activeIteration.id).toBe(1);
      expect(route.phase).toBe("iteration_validation");
    }
  });

  test("repaired verdict with all rows resolved and 'Iteration N' phase text re-validates the repaired iteration, not the next not_started one", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: Accounts [x]
- [x] 1.1 Implement account endpoint

## Iteration 2: Billing [x]
- [x] 2.1 Implement billing endpoint

## Iteration 3: Payments [x]
- [x] 3.1 Implement charge endpoint

## Iteration 4: Refunds [ ]
- [ ] 4.1 Implement refund endpoint
`, {
      findings: validationFindings("repaired", "iteration", "| F1 | resolved | MUST-FIX | implementation | Iteration 3 | Charge endpoint omitted idempotency key. | Add idempotency key handling. |\n")
    });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "finding_repair", activeIteration: null, repairCycleCount: 1 }, null, 2) + "\n",
      "utf-8"
    );

    const route = resolveRoute(testTmpDir);

    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.activeIteration.id).toBe(3);
      expect(route.phase).toBe("iteration_validation");
    }
  });

  test("repaired verdict with all rows resolved and bare-number phase text ('3') re-validates the repaired iteration", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: Accounts [x]
- [x] 1.1 Implement account endpoint

## Iteration 2: Billing [x]
- [x] 2.1 Implement billing endpoint

## Iteration 3: Payments [x]
- [x] 3.1 Implement charge endpoint

## Iteration 4: Refunds [ ]
- [ ] 4.1 Implement refund endpoint
`, {
      findings: validationFindings("repaired", "iteration", "| F1 | resolved | MUST-FIX | implementation | 3 | Charge endpoint omitted idempotency key. | Add idempotency key handling. |\n")
    });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "finding_repair", activeIteration: null, repairCycleCount: 1 }, null, 2) + "\n",
      "utf-8"
    );

    const route = resolveRoute(testTmpDir);

    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.activeIteration.id).toBe(3);
      expect(route.phase).toBe("iteration_validation");
    }
  });

  test("advancing from iteration_validation into finding_repair preserves the active iteration in state.json", () => {
    const changeDir = setupChange(`
## Iteration 1: Payments [~]
- [x] 1.1 Implement charge endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | Iteration 1 | Charge endpoint omitted idempotency key. | Add idempotency key handling. |\n")
    });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("finding_repair");
    expect(result.newState?.activeIteration).toBe(1);
  });

  test("repaired verdict with no state iteration and no findings iteration reference routes the not_started fallback through implementation", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("repaired", "iteration")
    });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "finding_repair", activeIteration: null, repairCycleCount: 1 }, null, 2) + "\n",
      "utf-8"
    );

    const route = resolveRoute(testTmpDir);

    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.activeIteration.id).toBe(2);
      expect(route.phase).toBe("implementation");
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

  test("validatePhase iteration_validation exits a clean iteration with only earlier-iteration resolved rows", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    const paths = buildChangePaths(changeDir);
    fs.writeFileSync(paths.findingsPath, validationFindings("ready", "iteration", "| F1 | resolved | MUST-FIX | implementation | 1 | Earlier iteration finding. | n/a |\n"), "utf-8");

    // Active iteration 2 is clean (no rows reference it) but the registry is non-empty.
    const result = validatePhase(testTmpDir, "iteration_validation", paths, 2);

    expect(result.ok).toBe(true);
  });

  test("validatePhase iteration_validation passes when a row references the active iteration", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    const paths = buildChangePaths(changeDir);
    fs.writeFileSync(paths.findingsPath, validationFindings("ready", "iteration", "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Matches active iteration. | n/a |\n"), "utf-8");

    const result = validatePhase(testTmpDir, "iteration_validation", paths, 1);

    expect(result.ok).toBe(true);
  });

  test("recommended threshold: finding_repair exit is blocked while an open RECOMMENDED remains", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Concern. | Fix it. |\n")
    });
    const paths = buildChangePaths(changeDir);

    const gate = validatePhaseExit(testTmpDir, "finding_repair", paths, 1, "recommended");

    expect(gate.ok).toBe(false);
    expect(gate.issues.join("\n")).toContain("blocking finding(s) still open");
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

  // ── repairCycleCount ─────────────────────────────────

  test("loadFlowState defaults repairCycleCount to 0 when not in state.json", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "change_intake", activeIteration: null }, null, 2) + "\n",
      "utf-8"
    );

    const state = loadFlowState(testTmpDir);
    expect(state).not.toBeNull();
    expect(state!.repairCycleCount).toBe(0);
  });

  test("loadFlowState reads repairCycleCount from state.json", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 2 }, null, 2) + "\n",
      "utf-8"
    );

    const state = loadFlowState(testTmpDir);
    expect(state).not.toBeNull();
    expect(state!.repairCycleCount).toBe(2);
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

  test("orphaned source identical to the archive copy is auto-removed, archive resumes", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, { findings: validationFindings("ready", "final") });

    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    // Fabricate an EXDEV mid-crash: both dirs present, byte-identical, both in_progress.
    createArchiveState("sample-change", archiveDir, new Date(), changeDir); // marker into source
    fs.cpSync(changeDir, archiveDir, { recursive: true });

    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(true);

    const result = startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);

    expect(result.phase).toBe("archive");
    expect(result.blocked).toBeFalsy();
    expect(fs.existsSync(changeDir)).toBe(false);      // orphan cleaned
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  test("orphaned source that diverged from the archive copy blocks, deletes nothing", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, { findings: validationFindings("ready", "final") });

    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    createArchiveState("sample-change", archiveDir, new Date(), changeDir);
    fs.cpSync(changeDir, archiveDir, { recursive: true });
    // Diverge the source after the "crash".
    fs.writeFileSync(path.join(changeDir, "divergent.txt"), "edited after crash", "utf-8");

    const result = startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);

    expect(result.blocked).toBe(true);
    expect(fs.existsSync(changeDir)).toBe(true);        // nothing deleted
    expect(fs.existsSync(archiveDir)).toBe(true);
  });

  test("advanceFlow recovers from pre-move crash: activePhase=archive with .phase-archive.json in active dir", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const today = new Date().toISOString().split("T")[0];
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    // Simulate a crash after startArchiveStage wrote both markers but before the directory move.
    createArchiveState("sample-change", archiveDir, new Date(), changeDir);
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "archive", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    // Verify pre-condition: change dir still active, no archive dir yet.
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.advanced).toBe(true);
    expect(result.message).toContain("recovered from pre-move crash");
    expect(result.newState?.activePhase).toBe("archive");

    // Directory should have been moved to archive.
    expect(fs.existsSync(changeDir)).toBe(false);
    expect(fs.existsSync(archiveDir)).toBe(true);

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
    expect(result.message).toContain("Design Approval Required");
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
    expect(result.message).toContain("phasedev sync-state");
    expect(result.message).not.toContain("reset state.json");
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
    expect(result.message).toContain("phasedev sync-state");
    expect(result.message).not.toContain("reset-change");
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
    expect(result.prompt).toContain("phasedev sync-state");
    expect(result.prompt).not.toContain("reset-change");
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

  // ── Repair cycle count ─────────────────────────────

  test("repairCycleCount increments when advance flows to finding_repair", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n")
    });
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("finding_repair");
    expect(result.newState?.repairCycleCount).toBe(1);
  });

  test("repairCycleCount preserved when advancing from finding_repair to iteration_validation", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repaired", "iteration")
    });
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify({ activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 2 }, null, 2) + "\n",
      "utf-8"
    );

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.newState?.activePhase).toBe("iteration_validation");
    expect(result.newState?.repairCycleCount).toBe(2);
  });

  test("repair cycle accumulates through repair↔validation loop and blocks after 3 attempts", () => {
    // This test verifies the full cycle works end-to-end: the counter
    // increments through repair, stays preserved when returning to validation,
    // and blocks the 4th repair attempt (3rd re-entry).
    const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n")
    });
    const statePath = path.join(changeDir, "state.json");

    // Helper: write state and run advance. Each repair round uses a fresh
    // finding ID and rows accumulate (never deleted): the append-only baseline
    // gate rejects both a resolved finding going back to open and a row
    // disappearing, so reopening the same ID or dropping prior rows across
    // cycles is not a realistic simulation.
    const resolvedRows: string[] = [];
    function advanceFrom(phase: string, iter: number | null, count: number, findingsVerdict: string, findingId = "F1"): ReturnType<typeof advanceFlow> {
      fs.writeFileSync(
        statePath,
        JSON.stringify({ activePhase: phase, activeIteration: iter, repairCycleCount: count }, null, 2) + "\n",
        "utf-8"
      );
      const findingsPath = path.join(changeDir, "validation_findings.md");
      if (findingsVerdict === "repair_required") {
        const openRow = `| ${findingId} | open | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n`;
        fs.writeFileSync(findingsPath, validationFindings("repair_required", "iteration", resolvedRows.join("") + openRow), "utf-8");
      } else {
        resolvedRows.push(`| ${findingId} | resolved | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n`);
        fs.writeFileSync(findingsPath, validationFindings("repaired", "iteration", resolvedRows.join("")), "utf-8");
      }
      return advanceFlow(testTmpDir, DEFAULT_CONFIG);
    }

    // Cycle 1: validation → repair (count 0→1)
    let r = advanceFrom("iteration_validation", 1, 0, "repair_required", "F1");
    expect(r.ok).toBe(true);
    expect(r.newState?.activePhase).toBe("finding_repair");
    expect(r.newState?.repairCycleCount).toBe(1);

    // Cycle 1: repair → validation (count stays 1)
    r = advanceFrom("finding_repair", 1, 1, "repaired", "F1");
    expect(r.ok).toBe(true);
    expect(r.newState?.activePhase).toBe("iteration_validation");
    expect(r.newState?.repairCycleCount).toBe(1);

    // Cycle 2: validation → repair (count 1→2), new finding surfaces
    r = advanceFrom("iteration_validation", 1, 1, "repair_required", "F2");
    expect(r.ok).toBe(true);
    expect(r.newState?.activePhase).toBe("finding_repair");
    expect(r.newState?.repairCycleCount).toBe(2);

    // Cycle 2: repair → validation (count stays 2)
    r = advanceFrom("finding_repair", 1, 2, "repaired", "F2");
    expect(r.ok).toBe(true);
    expect(r.newState?.activePhase).toBe("iteration_validation");
    expect(r.newState?.repairCycleCount).toBe(2);

    // Cycle 3: validation → repair (count 2→3), new finding surfaces
    r = advanceFrom("iteration_validation", 1, 2, "repair_required", "F3");
    expect(r.ok).toBe(true);
    expect(r.newState?.activePhase).toBe("finding_repair");
    expect(r.newState?.repairCycleCount).toBe(3);

    // 4th repair attempt blocked: count is 3 which is >= MAX_REPAIR_CYCLES
    r = advanceFrom("iteration_validation", 1, 3, "repair_required", "F3");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Repair cycle limit reached");
    expect(r.message).toContain("3");
  });

  test("repair cycle limit reached — advance refuses after 3 repair attempts", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n")
    });
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 3 }, null, 2) + "\n",
      "utf-8"
    );

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Repair cycle limit reached");
    expect(result.message).toContain("3");
  });

  test("repair cycle limit honors configured maxRepairCycles", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n")
    });
    const statePath = path.join(changeDir, "state.json");
    fs.writeFileSync(
      statePath,
      JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 1 }, null, 2) + "\n",
      "utf-8"
    );

    const result = advanceFlow(testTmpDir, { ...DEFAULT_CONFIG, maxRepairCycles: 1 });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Repair cycle limit reached");
    expect(result.message).toContain("maxRepairCycles");
  });

  test("advanceFlow returns 'Archive complete. Flow finished.' with finished:true and ok:true", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-07-06-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });

    // Write state.json for the completed archive
    fs.writeFileSync(
      path.join(archiveDir, "state.json"),
      JSON.stringify({ activePhase: "archive", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    // Write completed .phase-archive.json
    fs.writeFileSync(
      path.join(archiveDir, ".phase-archive.json"),
      JSON.stringify({
        status: "completed",
        changeName: "sample-change",
        archivePath: archiveDir,
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T01:00:00.000Z"
      }, null, 2) + "\n",
      "utf-8"
    );

    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.advanced).toBe(false);
    expect(result.newState).toBeNull();
    expect(result.message).toBe("Archive complete. Flow finished.");
  });

  test("advanceFlow returns 'No active change' when no archive exists and no change is active", () => {
    const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

    expect(result.ok).toBe(false);
    expect(result.finished).toBe(false);
    expect(result.message).toBe("No active change. Run: phasedev create-change <name>.");
  });

  test("findCompletedArchiveState finds a completed archive even when an unrelated active change exists", () => {
    // Create an active change
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

    // Create a completed archive directory alongside
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-07-06-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(
      path.join(archiveDir, ".phase-archive.json"),
      JSON.stringify({
        status: "completed",
        changeName: "sample-change",
        archivePath: archiveDir,
        startedAt: "2026-07-06T00:00:00.000Z",
        completedAt: "2026-07-06T01:00:00.000Z"
      }, null, 2) + "\n",
      "utf-8"
    );

    // findCompletedArchiveState is name-scoped now; it no longer special-cases
    // the presence of an unrelated active change (see change-errors task 1).
    const result = findCompletedArchiveState(testTmpDir);
    expect(result).toBe(archiveDir);
  });

  describe("findings baseline snapshot lifecycle", () => {
    test("advance into iteration_validation writes findings baseline with empty rows when no findings file exists yet", () => {
      const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`);
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "implementation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("iteration_validation");

      const baselinePath = path.join(changeDir, ".findings-baseline.json");
      expect(fs.existsSync(baselinePath)).toBe(true);
      const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
      expect(baseline.rows).toEqual([]);
    });

    test("advance into finding_repair writes the findings baseline with the current findings table", () => {
      const findingsRow = "| F1 | open | MUST-FIX | implementation | 1 | API response has an error. | Fix it. |\n";
      const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("repair_required", "iteration", findingsRow)
      });
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      const baselinePath = path.join(changeDir, ".findings-baseline.json");
      // Do not pre-write a baseline; let advanceFlow create it

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("finding_repair");

      const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
      expect(baseline.rows).toHaveLength(1);
      expect(baseline.rows[0].id).toBe("F1");
    });

    test("advance from archive_ready to archive removes the findings baseline before the archive move", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("ready", "final")
      });
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );
      fs.writeFileSync(path.join(changeDir, ".findings-baseline.json"), JSON.stringify({ rows: [] }, null, 2), "utf-8");

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("archive");

      const today = new Date().toISOString().split("T")[0];
      const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);
      expect(fs.existsSync(archiveDir)).toBe(true);
      expect(fs.existsSync(path.join(archiveDir, ".findings-baseline.json"))).toBe(false);
    });

    test("reopenPhase(plan) removes an existing findings baseline", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { planApproved: true });
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "implementation", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );
      const baselinePath = path.join(changeDir, ".findings-baseline.json");
      fs.writeFileSync(baselinePath, JSON.stringify({ rows: [] }, null, 2), "utf-8");

      const result = reopenPhase(testTmpDir, "plan");

      expect(result.ok).toBe(true);
      expect(fs.existsSync(baselinePath)).toBe(false);
    });

    test("checkValidationCompletion returns ok:false when a row is deleted after baseline is written", () => {
      const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("ready", "iteration", "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Row to delete. | n/a |\n")
      });

      const paths = buildChangePaths(changeDir);

      // First, write the baseline
      fs.writeFileSync(
        paths.findingsBaselinePath,
        JSON.stringify({
          rows: [
            { id: "F1", status: "resolved", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Row to delete.", requiredFix: "n/a" }
          ]
        }, null, 2),
        "utf-8"
      );

      // Now delete the row from findings
      fs.writeFileSync(
        paths.findingsPath,
        validationFindings("ready", "iteration", ""),
        "utf-8"
      );

      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      const checkFlowModule = require("../src/features/phase-control/check-flow");
      const result = checkFlowModule.checkValidationCompletion(testTmpDir, { scope: "iteration", iterationId: 1 });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("append-only");
    });

    test("advanceFlow refuses from iteration_validation when a row is deleted after baseline", () => {
      const findingsRow = "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Row to delete. | n/a |\n";
      const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("ready", "iteration", findingsRow)
      });

      const paths = buildChangePaths(changeDir);

      // Write the baseline
      fs.writeFileSync(
        paths.findingsBaselinePath,
        JSON.stringify({
          rows: [
            { id: "F1", status: "resolved", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Row to delete.", requiredFix: "n/a" }
          ]
        }, null, 2),
        "utf-8"
      );

      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      // Delete the row
      fs.writeFileSync(paths.findingsPath, validationFindings("ready", "iteration", ""), "utf-8");

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(false);
      expect(result.message).toContain("append-only");
    });

    test("advanceFlow refuses from finding_repair when a row is deleted after baseline", () => {
      const changeDir = setupChange(`
## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
        // The row was deleted instead of resolved: verdict claims repaired,
        // but the append-only baseline check must still catch the deletion.
        findings: validationFindings("repaired", "iteration", "")
      });

      const paths = buildChangePaths(changeDir);

      fs.writeFileSync(
        paths.findingsBaselinePath,
        JSON.stringify({
          rows: [
            { id: "F1", status: "resolved", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Row to delete.", requiredFix: "n/a" }
          ]
        }, null, 2),
        "utf-8"
      );

      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "finding_repair", activeIteration: 1, repairCycleCount: 1 }, null, 2) + "\n",
        "utf-8"
      );

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(false);
      expect(result.message).toContain("append-only");
    });

    test("checkValidationCompletion passes when no baseline file exists and findings are valid", () => {
      const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("ready", "iteration", "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | A finding. | Fix it. |\n")
      });

      // No baseline file is written, so behavior should be unchanged

      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      const checkFlowModule = require("../src/features/phase-control/check-flow");
      const result = checkFlowModule.checkValidationCompletion(testTmpDir, { scope: "iteration", iterationId: 1 });

      expect(result.ok).toBe(true);
    });
  });

  describe("findings type auto-promotion into final_validation", () => {
    test("advance from iteration_validation to final_validation promotes type: iteration to type: final", () => {
      const changeDir = setupChange(`
## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("ready", "iteration")
      });
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "iteration_validation", activeIteration: 1, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("final_validation");

      const paths = buildChangePaths(changeDir);
      const findingsContent = fs.readFileSync(paths.findingsPath, "utf-8");
      expect(findingsContent).toContain("type: final");
      expect(findingsContent).not.toContain("type: iteration");
    });

    test("a MUST-FIX finding added in final_validation routes to finding_repair instead of a type deadlock", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("ready", "final")
      });
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );

      const paths = buildChangePaths(changeDir);
      const addResult = addFinding(paths.findingsPath, null, "New defect found in final validation", "MUST-FIX", "Fix the defect", "validation", "Final");
      expect(addResult.ok).toBe(true);

      const result = advanceFlow(testTmpDir, DEFAULT_CONFIG);

      expect(result.ok).toBe(true);
      expect(result.newState?.activePhase).toBe("finding_repair");
      expect(result.message).not.toContain("type` must be `final`");
    });
  });

  describe("reopen phase", () => {
    function writeState(changeDir: string, phase: string, iteration: number | null = null) {
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: phase, activeIteration: iteration, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );
    }

    test("reopen design resets approved: false and phase to technical_design", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { designApproved: true });
      writeState(changeDir, "implementation");

      const result = reopenPhase(testTmpDir, "design");

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Reopened design");
      expect(result.message).toContain("technical_design");

      const state = loadFlowState(testTmpDir);
      expect(state).not.toBeNull();
      expect(state!.activePhase).toBe("technical_design");

      const designContent = fs.readFileSync(path.join(changeDir, "architecture", "design.md"), "utf-8");
      expect(designContent).toMatch(/approved:\s*false/);
      expect(designContent).not.toMatch(/approved:\s*true/);
    });

    test("reopen plan resets approved: false and phase to iteration_planning", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { planApproved: true });
      writeState(changeDir, "implementation");

      const result = reopenPhase(testTmpDir, "plan");

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Reopened plan");
      expect(result.message).toContain("iteration_planning");

      const state = loadFlowState(testTmpDir);
      expect(state).not.toBeNull();
      expect(state!.activePhase).toBe("iteration_planning");

      const planContent = fs.readFileSync(path.join(changeDir, "iteration_plan.md"), "utf-8");
      expect(planContent).toMatch(/approved:\s*false/);
      expect(planContent).not.toMatch(/approved:\s*true/);
    });

    test("reject invalid phase argument", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
      writeState(changeDir, "implementation");
      // TypeScript prevents invalid phases at compile time; test with a cast
      const result = reopenPhase(testTmpDir, "invalid" as ReopenablePhase);

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Invalid phase");
      expect(result.message).toContain('"invalid"');
    });

    test("reject when no active change exists", () => {
      // Clean temp dir without any .phasedev structure
      const result = reopenPhase(testTmpDir, "design");

      expect(result.ok).toBe(false);
      expect(result.message).toContain("No active change");
    });

    test("reject when artifact is not approved", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { designApproved: false });
      writeState(changeDir, "implementation");

      const result = reopenPhase(testTmpDir, "design");

      expect(result.ok).toBe(false);
      expect(result.message).toContain("not approved");
    });
  });

  describe("sync state", () => {
    function writeState(changeDir: string, phase: string, iteration: number | null = null) {
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: phase, activeIteration: iteration, repairCycleCount: 2 }, null, 2) + "\n",
        "utf-8"
      );
    }

    test("syncState rolls state.json back to the artifact-derived phase", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
      fs.rmSync(path.join(changeDir, "architecture", "design.md"));
      writeState(changeDir, "implementation", 1);
      fs.writeFileSync(path.join(changeDir, ".findings-baseline.json"), "{}", "utf-8");

      const result = syncState(testTmpDir);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.fromPhase).toBe("implementation");
      expect(result.toPhase).toBe("technical_design");
      expect(result.message).toContain("implementation -> technical_design");

      const state = loadFlowState(testTmpDir);
      expect(state!.activePhase).toBe("technical_design");
      expect(state!.activeIteration).toBeNull();
      expect(state!.repairCycleCount).toBe(0);
      expect(fs.existsSync(path.join(changeDir, ".findings-baseline.json"))).toBe(false);
    });

    test("syncState is a no-op when state and route agree", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { designApproved: true, planApproved: true });
      writeState(changeDir, "implementation", 1);
      const before = fs.readFileSync(path.join(changeDir, "state.json"), "utf-8");

      const result = syncState(testTmpDir);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).toContain("already consistent");
      expect(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8")).toBe(before);
    });

    test("syncState reports no active change", () => {
      const result = syncState(testTmpDir);
      expect(result.ok).toBe(false);
      expect(result.message).toContain("No active change");
    });

    test("syncState does not modify any artifact files", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
      fs.rmSync(path.join(changeDir, "architecture", "design.md"));
      writeState(changeDir, "implementation", 1);
      const prdBefore = fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8");

      syncState(testTmpDir);

      expect(fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8")).toBe(prdBefore);
    });

    test("syncState reports forward drift instead of a misleading no-op", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
      writeState(changeDir, "change_intake");
      const before = fs.readFileSync(path.join(changeDir, "state.json"), "utf-8");

      const result = syncState(testTmpDir);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).not.toContain("Nothing to sync");
      expect(result.message).toContain("advance");
      expect(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8")).toBe(before);
    });

    test("syncState reports same-rank drift (finding_repair vs final_validation lock) instead of a misleading no-op", () => {
      setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |\n")
      });
      const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
      writeState(changeDir, "final_validation");
      const before = fs.readFileSync(path.join(changeDir, "state.json"), "utf-8");

      const result = syncState(testTmpDir);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.message).not.toContain("Nothing to sync");
      expect(result.message).toContain("advance");
      expect(fs.readFileSync(path.join(changeDir, "state.json"), "utf-8")).toBe(before);
    });
  });

  describe("checkPhase grades the artifact-derived route, not the stale lock", () => {
    function writeState(changeDir: string, phase: string, iteration: number | null = null) {
      fs.writeFileSync(
        path.join(changeDir, "state.json"),
        JSON.stringify({ activePhase: phase, activeIteration: iteration, repairCycleCount: 0 }, null, 2) + "\n",
        "utf-8"
      );
    }

    test("forward drift: lock=change_intake but artifacts resolve further, checkPhase grades the route phase", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
      fs.rmSync(path.join(changeDir, "architecture", "design.md"));
      writeState(changeDir, "change_intake");

      const result = checkPhase(testTmpDir);

      expect(result.phase).toBe("technical_design");
      expect(result.message).toContain("state.json is locked at change_intake");
      expect(result.message).toContain("artifacts resolve to technical_design");
      expect(result.message).toContain("phasedev advance");
    });

    test("same-rank drift: lock=final_validation but route=finding_repair, checkPhase grades finding_repair", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |\n")
      });
      writeState(changeDir, "final_validation");

      const result = checkPhase(testTmpDir);

      expect(result.phase).toBe("finding_repair");
      expect(result.message).toContain("state.json is locked at final_validation");
      expect(result.message).toContain("artifacts resolve to finding_repair");
      expect(result.message).toContain("phasedev advance");
    });

    test("no drift: lock matches route, message carries no divergence notice", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { designApproved: true, planApproved: true });
      writeState(changeDir, "implementation", 1);

      const result = checkPhase(testTmpDir);

      expect(result.phase).toBe("implementation");
      expect(result.message).not.toContain("is locked at");
    });

    test("--phase override still grades the requested phase, ignoring route drift", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`);
      fs.rmSync(path.join(changeDir, "architecture", "design.md"));
      writeState(changeDir, "change_intake");

      const result = checkPhase(testTmpDir, "change_intake");

      expect(result.phase).toBe("change_intake");
      expect(result.message).not.toContain("is locked at");
    });

    test("recommended threshold: check reports finding_repair for an open RECOMMENDED", () => {
      const changeDir = setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
        findings: validationFindings("repair_required", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Concern. | Fix it. |\n")
      });
      writeState(changeDir, "iteration_validation", 1);

      const result = checkPhase(testTmpDir, undefined, undefined, "recommended");

      expect(result.phase).toBe("finding_repair");
      expect(result.ok).toBe(true);
    });
  });
});
