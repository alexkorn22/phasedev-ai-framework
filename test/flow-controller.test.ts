import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getInitPrompt, getNextPrompt } from "../src/features/flow-control";

const testTmpDir = path.resolve(__dirname, "..", "test-controller-temp");

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved ? "true" : "false"}\n---\n${body}`, "utf-8");
}

function validPrdBody(): string {
  return `# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep flow routing grounded in approved requirements. |
| Generation target | Exercise the flow controller stage prompt. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | Test fixture only; no production risk. |

## Approval Summary

Approve this test fixture change.

## Requirements

- R1: Route the flow according to approved artifacts.

## Scope Boundaries

- In scope: test fixture flow state.
- Out of scope: unrelated behavior.

## Success Criteria

- SC1: The expected stage prompt is rendered.

## Accepted Assumptions

None.

## Deferred Decisions

None.
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
Trace details here.

## Requirements & Success Criteria Trace

| ID | Status | Evidence | Gaps/Blockers |
|---|---|---|---|
| R1 | confirmed | Fixture research traces routing requirement. | none |
| SC1 | confirmed | Fixture research traces expected stage prompt criterion. | none |

## Source Facts
- \`src/index.ts:42\` -- verified fact.

## Research Gaps & Blockers
No blockers.
`;
}

function validDesignBody(): string {
  return `# Design

## Executive Summary
Summary details.

## Traceability Mapping
Trace details.

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point and approval summary for this design package. | approval summary, package map, top-level diagram/table | high |

## Key Design Decisions
Decisions.

## Database Schemas & API Contracts
Schemas.

## Risks & Open Questions
None.
`;
}

function setupChange(planContent: string, options: { findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
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
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("init prompt reports init stage", () => {
    const result = getInitPrompt(testTmpDir);

    expect(result.command).toBe("init");
    expect(result.stage).toBe("init");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("## Current Flow State");
    expect(result.prompt).toContain("- Stage: `setup`");
    expect(result.prompt).toContain("- Active change: none");
  });

  test("next prompt blocks approved PRD that does not satisfy Intent Card contract", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n\n## Intent Card\n");
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("setup");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("[FLOW CONTROLLER] BLOCKED: Invalid prd.md");
    expect(result.prompt).toContain("Intent Card field `Change type` must be present and non-empty.");
  });

  test("init prompt reports active change and current flow stage without running next", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint
`);

    const result = getInitPrompt(testTmpDir);

    expect(result.stage).toBe("init");
    expect(result.prompt).toContain("- Stage: `implementation`");
    expect(result.prompt).toContain(`- Active change: file://${changeDir}`);
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
    const archiveDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);

    const result = getInitPrompt(testTmpDir);

    expect(result.prompt).toContain("- Stage: `archive`");
    expect(result.prompt).toContain(`- Active change: file://${changeDir}`);
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(archiveDir)).toBe(false);
  });

  test("missing active change routes to setup stage", () => {
    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("setup");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Этап 0. AI Layer Setup.");
    expect(result.prompt).toContain("prd.md template");
    expect(result.prompt).toContain("## Intent Card");
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
    expect(result.prompt).toContain("Этап 4. Implementation.");
    expect(result.prompt).toContain("Check Evidence");
  });

  test("completed multi-phase phase routes to phase validation stage", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const result = getNextPrompt(testTmpDir);

    expect(result.stage).toBe("phase_validation");
    expect(result.prompt).toContain("Этап 5A. Phase Validation.");
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
    expect(result.prompt).toContain("Этап 5A. Phase Validation.");
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
    expect(result.prompt).toContain("Этап 4. Implementation.");
    expect(result.prompt).not.toContain("Этап 5A. Phase Validation.");
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
    expect(result.prompt).toContain("Этап 4. Implementation.");
    expect(result.prompt).not.toContain("Этап 5A. Phase Validation.");
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
    expect(result.prompt).toContain("Этап 5B. Final Validation.");
    expect(result.prompt).toContain("Generation Bundle");
    expect(result.prompt).toContain("Intent Card");
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
    expect(result.prompt).toContain("Этап 5R. Repair Loop.");
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
    const archiveDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);
    const statePath = path.join(archiveDir, ".flow-archive.json");

    expect(result.stage).toBe("archive");
    expect(result.prompt).toContain("Этап 6. Archive.");
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
    expect(second.prompt).toContain("openspec/changes/archive");
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
