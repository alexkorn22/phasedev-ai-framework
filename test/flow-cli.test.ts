import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { renderTemplate } from "../src/shared/templates/render-template";

const testTmpDir = path.resolve(__dirname, "..", "test-cli-temp");
const cliPath = path.resolve(__dirname, "..", "src", "flow-cli.ts");

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: ${approved ? "true" : "false"}\n---\n${body}`, "utf-8");
}

function writeApproved(filePath: string, body: string) {
  writeArtifact(filePath, body, true);
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

function writeConfig(body: string): string {
  const configPath = path.join(testTmpDir, "flow-config.yaml");
  fs.mkdirSync(testTmpDir, { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

function writeProjectConfig(body: string): string {
  const configPath = path.join(testTmpDir, "openspec", "config.yaml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

function validationFindings(verdict: "ready" | "ready_with_risks" | "repair_required" | "repaired", type: "phase" | "final", rows = ""): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-28
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
| Approval scope | Exercise the flow CLI fixture path. |
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

function setupChange(planContent: string, options: { rules?: string; findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
  writeApproved(path.join(changeDir, "rules.md"), options.rules ?? `
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

function runNext(args: string[] = []): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "next", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

function runInit(args: string[] = []): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "init", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

function runCheck(args: string[] = []): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "check", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
}

describe("flow-cli state machine", () => {
  beforeEach(() => cleanupTestDir());
  afterEach(() => cleanupTestDir());

  test("init output contains base prompt without stage skill router", () => {
    const output = runInit();

    expect(output).toContain("Remember the Agentic Engineering Flow model for this session.");
    expect(output).toContain("## Current Flow State");
    expect(output).toContain("- Stage: `setup`");
    expect(output).toContain("- Active change: none");
    expect(output).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt from `config.yaml`.");
    expect(output).not.toContain("## Mandatory Skill Selection Router");
    expect(output).not.toContain("## Configured Skill Policy");
  });

  test("init accepts project openspec config but keeps output policy-free", () => {
    writeProjectConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - project-only-skill
`);

    const output = runInit();

    expect(output).toContain("Remember the Agentic Engineering Flow model for this session.");
    expect(output).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt from `config.yaml`.");
    expect(output).not.toContain("## Configured Skill Policy");
    expect(output).not.toContain("project-only-skill");
  });

  test("implementation prompt uses config skills without requiring a router", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - dev-core
          - test-driven-development
        additional:
          - api-and-interface-design
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("## Configured Skill Policy");
    expect(output).toContain("Use only configured main skills or configured additional skills.");
    expect(output).toContain("Priority 1 - routers (mandatory only when configured):\n- none configured");
    expect(output).toContain("Priority 2 - main skills");
    expect(output).toContain("- `dev-core`");
    expect(output).toContain("- `test-driven-development`");
    expect(output).toContain("Priority 3 - additional skills");
    expect(output).toContain("- `api-and-interface-design`");
    expect(output).toContain("Authorized external skills are limited to configured main skills and configured additional skills.");
    expect(output).toContain("If no main or additional skill fits the stage need, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(output).not.toContain("router-selected");
    expect(output).toContain("Check Evidence");
  });

  test("implementation prompt uses project openspec config without --config", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    writeProjectConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - project-only-skill
`);

    const output = runNext();

    expect(output).toContain("## Configured Skill Policy");
    expect(output).toContain("- `project-only-skill`");
  });

  test("implementation prompt authorizes router-selected skills before main and additional skills", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    implementation:
      skills:
        routers:
          - using-zuvo
        main:
          - dev-core
        additional:
          - security-and-hardening
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("Priority 1 - routers (read every configured router first, mandatory only when configured):\n- `using-zuvo`");
    expect(output).toContain("Priority 2 - router-selected skills (highest priority method skills when a configured router selects a matching skill from its own content or routing table):");
    expect(output).toContain("Apply router instructions to the current stage evidence. If a router selects a matching skill from its own content or routing table, load and use that router-selected skill before considering main or additional skills.");
    expect(output).toContain("Authorized external skills are limited to configured routers, router-selected skills explicitly named by router content, configured main skills, and configured additional skills.");
    expect(output).toContain("Priority 3 - main skills (use only when routers are not configured or no router-selected skill fits the stage evidence):");
    expect(output).toContain("Priority 4 - additional skills (secondary allowed pool; load only when router-selected and main skills are insufficient or a listed additional skill is clearly better):");
  });

  test("implementation prompt disables external skills when stage skills are empty", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    implementation:
      model: gpt-5.4
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("No external skills are configured for this stage in `config.yaml`.");
    expect(output).toContain("Do not use external skills for this stage unless the user updates `config.yaml` or explicitly approves an exception.");
    expect(output).not.toContain("Priority 1 - routers");
  });

  test("plan prompt includes PRD intent input for downstream planning", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeApproved(path.join(changeDir, "architecture", "design.md"), validDesignBody());

    const output = runNext();

    expect(output).toContain("Stage 3. Plan.");
    expect(output).toContain("PRD requirements and ADLC-style Intent Card");
    expect(output).toContain("prd.md");
    expect(output).toContain("Generation target");
    expect(output).toContain("Resolution signal");
    expect(output).toContain("Risk envelope");
  });

  test("artifact stage prompts include immediate self-check routes", () => {
    let output = runNext();
    expect(output).toContain("Artifact self-check");
    expect(output).toContain("flow-cli.ts\" check --project-path");
    expect(output).toContain("--expect-route setup_approval");

    cleanupTestDir();
    let changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);

    output = runNext();
    expect(output).toContain("Stage 1. Research.");
    expect(output).toContain("Artifact self-check");
    expect(output).toContain("--expect-route design");

    cleanupTestDir();
    changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");

    output = runNext();
    expect(output).toContain("Stage 2. Design.");
    expect(output).toContain("immediately validate the new design artifact");
    expect(output).toContain("--expect-route design_approval");

    writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), true);

    output = runNext();
    expect(output).toContain("Stage 3. Plan.");
    expect(output).toContain("Artifact self-check");
    expect(output).toContain("--expect-route plan_approval");
  });

  test("check reports invalid fresh PRD without rendering the next prompt", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n\n## Intent Card\n", false);
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`, false);

    const result = runCheck(["--expect-route", "setup_approval"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[FLOW CHECK] FAILED: invalid_prd");
    expect(result.output).toContain("Intent Card field `Change type` must be present and non-empty.");
    expect(result.output).not.toContain("[FLOW CONTROLLER] BLOCKED");
  });

  test("check passes valid setup artifacts only at setup approval route", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`, false);

    const pass = runCheck(["--expect-route", "setup_approval"]);
    const fail = runCheck(["--expect-route", "research"]);

    expect(pass.exitCode).toBe(0);
    expect(pass.output).toContain("[FLOW CHECK] OK: current route is setup_approval");
    expect(fail.exitCode).toBe(1);
    expect(fail.output).toContain("expected route research, got setup_approval");
  });

  test("check does not load stage config", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`, false);
    const configPath = writeConfig("codex: [");

    const result = runCheck(["--expect-route", "setup_approval", "--config", configPath]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[FLOW CHECK] OK: current route is setup_approval");
  });

  test("check reports invalid design before approval", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeArtifact(path.join(changeDir, "architecture", "design.md"), "# Design\n\n## Executive Summary\n", false);

    const result = runCheck(["--expect-route", "design_approval"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[FLOW CHECK] FAILED: invalid_design");
  });

  test("check passes valid design at design approval route", () => {
    const changeDir = path.join(testTmpDir, "openspec", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`bun test full\`
`);
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), false);

    const result = runCheck(["--expect-route", "design_approval"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[FLOW CHECK] OK: current route is design_approval");
  });

  test("check reports archive readiness without moving the active change", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);

    const result = runCheck(["--expect-route", "archive_ready"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Archive is ready; no files were moved by check.");
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(archivedDir)).toBe(false);
  });

  test("check fails when archive state is malformed", () => {
    const archiveDir = path.join(testTmpDir, "openspec", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), "{ malformed json", "utf-8");

    const result = runCheck();

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[FLOW CHECK] FAILED: invalid_archive_state (stage: archive)");
    expect(result.output).toContain(".flow-archive.json is not valid JSON");
  });

  test("multi-phase plan sends completed in-progress phase to phase validation", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Stage 5A. Phase Validation.");
    expect(output).toContain("Current phase:\nPhase 1: API");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("Check Evidence");
    expect(output).toContain("do not rerun tests or additional checks");
    expect(output).not.toContain("run project test suite");
  });

  test("blocks when more than one phase is in progress", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [~]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Only one phase may have [~] status at a time; active phases: Phase 1: API, Phase 2: UI.");
    expect(output).toContain("Phase 1: API");
    expect(output).toContain("Phase 2: UI");
    expect(output).not.toContain("Stage 4. Implementation.");
    expect(output).not.toContain("Stage 5A. Phase Validation.");
  });

  test("blocks approved plan with no recognized phases before final validation", () => {
    setupChange(`
# Plan

No phase headings yet.
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("implementation_plan.md must contain at least one phase heading.");
    expect(output).not.toContain("Stage 5B. Final Validation.");
  });

  test("blocks phase without tasks before implementation", () => {
    setupChange(`
# Plan

## Phase 1: Empty Phase [ ]
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase 1: Empty Phase must contain at least one task checkbox.");
    expect(output).not.toContain("Stage 4. Implementation.");
  });

  test("blocks duplicate and non-sequential phase numbers", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

## Phase 1: UI [ ]
- [ ] 2.1 Build page

## Phase 3: Docs [ ]
- [ ] 3.1 Update docs
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase numbers must be unique; duplicate phase id(s): 1.");
    expect(output).toContain("Phase numbers must be sequential starting at 1.");
    expect(output).not.toContain("Stage 4. Implementation.");
  });

  test("blocks completed phase that still contains incomplete tasks", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
- [ ] 1.2 Add tests
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("Phase 1: API is [x] but contains incomplete tasks.");
    expect(output).not.toContain("Stage 5B. Final Validation.");
  });

  test("single-phase plan sends completed in-progress phase to phase validation", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [~]
- [x] 1.1 Implement change
`);

    const output = runNext();

    expect(output).toContain("Stage 5A. Phase Validation.");
    expect(output).toContain("Current phase:\nPhase 1: Complete Change");
    expect(output).not.toContain("Stage 5B. Final Validation.");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("do not rerun tests or additional checks");
  });

  test("single-phase plan sends validated phase to final validation", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [x]
- [x] 1.1 Implement change
`, {
      findings: validationFindings("ready", "phase")
    });

    const output = runNext();

    expect(output).toContain("Stage 5B. Final Validation.");
    expect(output).not.toContain("Stage 5A. Phase Validation.");
    expect(output).not.toContain("bun test full");
    expect(output).toContain("do not rerun `unit`, `phase`, `full`, or additional checks");
    expect(output).toContain("Intent Card");
    expect(output).toContain("Requirements");
    expect(output).toContain("Success Criteria");
  });

  test("repaired phase validation repeats phase validation for current in-progress phase", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("repaired", "phase", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("Stage 5A. Phase Validation.");
    expect(output).toContain("Current phase:\nPhase 1: API");
  });

  test("repaired final validation repeats final validation", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint

## Phase 2: UI [x]
- [x] 2.1 Build page
`, {
      findings: validationFindings("repaired", "final", "| F1 | resolved | MUST-FIX | implementation | Final | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("Stage 5B. Final Validation.");
    expect(output).not.toContain("Stage 5A. Phase Validation.");
  });

  test("repair prompt includes compact queue instead of full findings registry", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "phase", [
        "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |",
        "| F2 | open | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |"
      ].join("\n"))
    });

    const output = runNext();

    expect(output).toContain("Stage 5R. Repair Loop.");
    expect(output).toContain("## Current Repair Queue");
    expect(output).toContain("| F2 | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |");
    expect(output).toContain("Full findings registry:");
    expect(output).not.toContain("| F1 | MUST-FIX | implementation | Phase 1 | API response omits required error handling. |");
  });

  test("broken validation findings blocks instead of rendering an empty repair queue", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: `---
verdict: repair_required
type: phase
date: 2026-05-28
---

No markdown finding table here.
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid validation_findings.md");
    expect(output).toContain("validation_findings.md must contain exactly one markdown table");
    expect(output).not.toContain("Stage 5R. Repair Loop.");
  });

  test("successful final validation routes to archive stage", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint

## Phase 2: UI [x]
- [x] 2.1 Build page
`, {
      findings: validationFindings("ready", "final")
    });

    const output = runNext();
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Stage 6. Archive.");
    expect(output).toContain(`${archivedDir}/specs/<capability>/spec.md`);
    expect(output).toContain(".flow-archive.json");
    expect(output).toContain(`archive path: \`${archivedDir}\``);
    expect(fs.existsSync(path.join(archivedDir, ".flow-archive.json"))).toBe(true);
    expect(fs.existsSync(path.join(testTmpDir, "openspec", "changes", "sample-change"))).toBe(false);
    expect(output).not.toContain("src/archive-change.ts");
    expect(output).not.toContain("[FLOW CONTROLLER] SUCCESS!");
    expect(output).not.toContain("Stage 6. System Evolution.");
  });

  test("pending archive state repeats archive prompt without active change", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const first = runNext();
    const second = runNext();

    expect(first).toContain("Stage 6. Archive.");
    expect(second).toContain("Stage 6. Archive.");
    expect(second).toContain(".flow-archive.json");
    expect(second).not.toContain("Stage 0. AI Layer Setup.");
  });

  test("final ready_with_risks without blocking findings routes to archive stage", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "final", "| F1 | open | RECOMMENDED | implementation | Final | Minor follow-up. | Track as follow-up. |\n")
    });

    const output = runNext();
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, "openspec", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Stage 6. Archive.");
    expect(output).toContain("Do not use `validation_findings.md` as a source of requirements");
    expect(fs.existsSync(path.join(archivedDir, ".flow-archive.json"))).toBe(true);
  });

  test("final ready blocks archive if any phase is not completed", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(output).toContain("implementation_plan.md");
    expect(output).not.toContain("Stage 6. Archive.");
    expect(output).not.toContain("Stage 5B. Final Validation.");
  });

  test("final ready_with_risks with open blocking findings routes to repair instead of archive", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "final", "| F1 | open | MUST-FIX | implementation | Final | Broken final check. | Repair the final check. |\n")
    });

    const output = runNext();

    expect(output).toContain("Stage 5R. Repair Loop.");
    expect(output).toContain("| F1 | MUST-FIX | implementation | Final | Broken final check. | Repair the final check. |");
    expect(output).not.toContain("Stage 6. Archive.");
  });

  test("invalid rules with missing unit command blocks before rendering implementation prompts", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`, {
      rules: `
# Rules

## Test Commands
- phase: \`bun test phase\`
- full: \`bun test full\`
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid rules.md");
    expect(output).toContain("unit");
    expect(output).toContain("Test Commands must contain exactly these command rows in order");
    expect(output).not.toContain("run unit tests");
  });

  test("invalid rules with missing phase command blocks before phase validation prompt", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`, {
      rules: `
# Rules

## Test Commands
- unit: \`bun test unit\`
- full: \`bun test full\`
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid rules.md");
    expect(output).toContain("phase");
    expect(output).not.toContain("Stage 5A. Phase Validation.");
  });

  test("invalid rules with missing full command blocks before final validation prompt", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      rules: `
# Rules

## Test Commands
- unit: \`bun test unit\`
- phase: \`bun test phase\`
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid rules.md");
    expect(output).toContain("full");
    expect(output).not.toContain("Stage 5B. Final Validation.");
  });

  test("invalid plan blocks before plan approval prompt", () => {
    const changeDir = setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint
`, {
      planApproved: false
    });
    fs.appendFileSync(path.join(changeDir, "implementation_plan.md"), "\n\n## Notes\nNot allowed before approval.\n", "utf-8");

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid implementation plan");
    expect(output).toContain("implementation_plan.md contains unexpected section `## Notes`.");
    expect(output).not.toContain("[FLOW CONTROLLER] BLOCKED: Plan requires review");
  });

  test("approval gates block after repair resets an approved artifact", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      designApproved: false,
      findings: validationFindings("repaired", "phase", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Design requires review");
    expect(output).toContain("architecture/design.md");
    expect(output).not.toContain("Stage 5A. Phase Validation.");
  });

  test("implementation prompt does not instruct agent to mark phase header completed", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);

    const output = runNext();

    expect(output).toContain("Stage 4. Implementation.");
    expect(output).toContain("bun test unit");
    expect(output).toContain("do not finish Implementation with failed tests/checks");
    expect(output).not.toContain("change the phase status in the plan heading from `[~]`");
    expect(output).not.toContain("run unit tests");
  });

  test("implementation prompt includes additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`
- Browser smoke for login flow

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Stage 4. Implementation.");
    expect(output).toContain("Current phase from approved plan:");
    expect(output).toContain("Additional checks:");
    expect(output).toContain("bun test:e2e auth");
    expect(output).toContain("Browser smoke for login flow");
  });

  test("implementation prompt includes the full current phase excerpt", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

Checks:
- Endpoint handles not found responses.

Additional checks:
- \`bun test:e2e auth\`

Implementation note:
- Keep API contract unchanged.

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Current phase from approved plan:");
    expect(output).toContain("Checks:");
    expect(output).toContain("Endpoint handles not found responses.");
    expect(output).toContain("Implementation note:");
    expect(output).toContain("Keep API contract unchanged.");
    expect(output).not.toContain("## Phase 2: UI");
  });

  test("implementation prompt uses refreshed phase excerpt after marking phase in progress", () => {
    setupChange(`
# Plan

## Phase 1: API [ ]
- [ ] 1.1 Implement endpoint

Checks:
- Endpoint handles not found responses.
`);

    const output = runNext();

    expect(output).toContain("Stage 4. Implementation.");
    expect(output).toContain("## Phase 1: API [~]");
    expect(output).not.toContain("## Phase 1: API [ ]");
  });

  test("phase validation prompt does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Stage 5A. Phase Validation.");
    expect(output).not.toContain("Additional checks for the current phase from the plan:");
    expect(output).not.toContain("bun test:e2e auth");
    expect(output).not.toContain("additional checks are executed");
  });

  test("final validation does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Phase 1: Complete Change [x]
- [x] 1.1 Implement change

Additional checks:
- \`bun test:e2e checkout\`
`);

    const output = runNext();

    expect(output).toContain("Stage 5B. Final Validation.");
    expect(output).not.toContain("Additional checks for the current single-phase phase");
    expect(output).not.toContain("bun test:e2e checkout");
    expect(output).not.toContain("applicable additional checks");
  });
});

describe("flow templates", () => {
  const templateNames = [
    "step0_setup.md",
    "step1_research.md",
    "step2_design.md",
    "step3_plan.md",
    "step4_impl.md",
    "step5a_val.md",
    "step5b_val.md",
    "step5r_repair.md",
    "step6_archive.md"
  ];

  function readTemplate(name: string): string {
    return fs.readFileSync(path.resolve(__dirname, "..", "templates", name), "utf-8");
  }

  test("stage templates receive generated config skill policy", () => {
    for (const templateName of templateNames) {
      const template = readTemplate(templateName);

      expect(template).toContain("{{skill_policy}}");
      expect(template.indexOf("{{skill_policy}}")).toBeLessThan(template.indexOf("Input"));
      expect(template).not.toContain("The agent may use any available relevant skills");
      expect(template).not.toContain("session routers and tools for the current stage");
    }
  });

  test("validation skill policy forbids execution gates but allows read-only review methods", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    final_validation:
      skills:
        additional:
          - playwright
          - performance-audit
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("- `playwright`");
    expect(output).toContain("Validation stages are review-only");
    expect(output).toContain("Do not rerun tests, builds, browsers, deployments, migrations, or other execution gates as validation gates.");
    expect(output).toContain("Read-only review, audit, and static-inspection methods selected by the configured skill policy are allowed");
    expect(output).toContain("do not inline prose, sections, evidence blocks, or extra tables into `validation_findings.md`");
    expect(output).toContain("put non-registry explanation only in the final response");
    expect(output.indexOf("## Configured Skill Policy")).toBeLessThan(output.indexOf("Input artifacts"));
  });

  test("stage templates preserve explicit artifact allowlists", () => {
    const expectations: Array<[string, string[]]> = [
      ["step0_setup.md", ["Allowed persistent artifacts for this stage", "`prd.md`", "`rules.md`", "change folder"]],
      ["step1_research.md", ["Allowed persistent artifacts for this stage", "`research_facts.md`"]],
      ["step2_design.md", ["Allowed persistent artifacts for this stage", "`architecture/design.md`", "linked files inside `architecture/`"]],
      ["step3_plan.md", ["Allowed persistent artifacts for this stage", "`implementation_plan.md`"]],
      ["step4_impl.md", ["Allowed persistent artifacts for this stage", "production/test code", "task checkboxes and `Check Evidence` rows in `implementation_plan.md`"]],
      ["step5a_val.md", ["Allowed persistent artifacts for this stage", "`validation_findings.md`", "phase status in `implementation_plan.md`"]],
      ["step5b_val.md", ["Allowed persistent artifacts for this stage", "`validation_findings.md`"]],
      ["step5r_repair.md", ["Allowed persistent artifacts for this stage", "affected production/test code", "affected approved flow artifacts", "`validation_findings.md`"]],
      ["step6_archive.md", ["Allowed persistent artifacts for this stage", "OpenSpec delta specs", "`openspec/specs`"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("downstream stage templates consume PRD Intent Card fields", () => {
    const expectations: Array<[string, string[]]> = [
      ["step1_research.md", ["ADLC-style Intent Card", "Resolution signal", "Risk envelope", "PRD Intent Trace", "Accepted Assumptions", "Deferred Decisions", "`R#`", "`SC#`"]],
      ["step2_design.md", ["ADLC-style Intent Card", "user/business intent", "generation target", "resolution signal", "risk envelope", "Accepted Assumptions", "Deferred Decisions", "`R#`", "`SC#`"]],
      ["step3_plan.md", ["PRD requirements and ADLC-style Intent Card", "Generation target", "Resolution signal", "Risk envelope", "Accepted Assumptions", "Deferred Decisions", "`R#`", "`SC#`"]],
      ["step4_impl.md", ["PRD requirements and ADLC-style Intent Card", "Resolution signal", "Generation target", "accepted assumptions", "deferred decisions", "`R#`", "`SC#`", "`In scope:`"]],
      ["step5a_val.md", ["PRD requirements and ADLC-style Intent Card", "Risk envelope", "Resolution signal", "accepted assumptions", "deferred decisions", "`R#`", "`SC#`"]],
      ["step5b_val.md", ["ADLC-style Intent Card", "Generation target", "Resolution signal", "Risk envelope", "Accepted Assumptions", "Deferred Decisions", "every `R#`", "every `SC#`"]],
      ["step5r_repair.md", ["ADLC-style Intent Card", "Risk envelope", "Generation target", "Resolution signal", "Accepted Assumptions", "Deferred Decisions", "`R#`", "`SC#`"]],
      ["step6_archive.md", ["ADLC-style Intent Card", "business intent", "resolution signal", "Accepted Assumptions", "Deferred Decisions", "`R#` requirements"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("PRD template defines strict section contract", () => {
    const prdTemplate = readTemplate("artifacts/prd.md");
    const expectedOrder = [
      "## Intent Card",
      "## Approval Summary",
      "## Requirements",
      "## Scope Boundaries",
      "## Success Criteria",
      "## Accepted Assumptions",
      "## Deferred Decisions"
    ];

    expect(prdTemplate).toContain("The final prd.md may contain only the # PRD title and the seven ## sections shown below, in this exact order.");
    expect(prdTemplate).toContain("Do not add other ## sections such as Risks, Notes, Open Questions, Validation, Non-goals, or Security.");
    expect(prdTemplate).toContain("Do not add ### or deeper headings.");
    expect(prdTemplate).toContain("- R1:");
    expect(prdTemplate).toContain("- SC1:");
    expect(prdTemplate).toContain("- In scope:");
    expect(prdTemplate).toContain("- Out of scope:");
    expect(prdTemplate).toContain("The Intent Card table must contain only the rows shown below, in the same order.");

    let previousIndex = -1;
    for (const section of expectedOrder) {
      const currentIndex = prdTemplate.indexOf(section);
      expect(currentIndex).toBeGreaterThan(previousIndex);
      previousIndex = currentIndex;
    }
  });

  test("setup prompt forbids extra PRD sections and placeholders", () => {
    const setupTemplate = readTemplate("step0_setup.md");

    expect(setupTemplate).toContain("must follow the template contract exactly");
    expect(setupTemplate).toContain("fixed visible sections");
    expect(setupTemplate).toContain("no extra headings");
    expect(setupTemplate).toContain("no empty required fields");
    expect(setupTemplate).toContain("`TBD`, `TODO`, `unknown`, `clarify later`, or `to be decided`");
  });

  test("downstream prompts require trace by PRD requirement and success criterion ids", () => {
    const expectations: Array<[string, string[]]> = [
      ["step1_research.md", ["trace for each `R#` and `SC#`"]],
      ["step2_design.md", ["design decisions cover each `R#` requirement and each `SC#` success criterion"]],
      ["step3_plan.md", ["connect phases, tasks, checks, and `Check Evidence` to concrete `R#` and `SC#`"]],
      ["step4_impl.md", ["only the `R#` and `SC#` tied to the current phase"]],
      ["step5a_val.md", ["against the concrete `R#` and `SC#`"]],
      ["step5r_repair.md", ["reference the concrete `R#` or `SC#`"]],
      ["step6_archive.md", ["Use `R#` requirements from `prd.md` as the primary source of requirement-level content"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("research prompts allow unresolved gaps without allowing unknown placeholders", () => {
    const researchTemplate = readTemplate("step1_research.md");
    const researchArtifactTemplate = readTemplate("artifacts/research_facts.md");

    expect(researchTemplate).toContain("unresolved gaps or disputed facts");
    expect(researchTemplate).not.toContain("marked unknown");
    expect(researchTemplate).not.toContain("ordinary unknowns");
    expect(researchArtifactTemplate).toContain("remaining unresolved gaps or disputed facts");
    expect(researchArtifactTemplate).not.toContain("remaining unknowns");
  });

  test("final validation prompt checks every PRD requirement and success criterion", () => {
    const finalTemplate = readTemplate("step5b_val.md");

    expect(finalTemplate).toContain("every `R#` is implemented by the actual change set or has a finding");
    expect(finalTemplate).toContain("every `SC#` is demonstrably met or has a finding");
    expect(finalTemplate).toContain("`In scope:` is covered and `Out of scope:` was not implemented without approval");
    expect(finalTemplate).toContain("change-set inventory gate");
    expect(finalTemplate).toContain("inspect every changed production/source/config/test file outside `openspec/**`");
    expect(finalTemplate).toContain("final requirements conformance pass");
    expect(finalTemplate).toContain("initial change requirements from PRD, approved design, and implementation plan artifacts");
    expect(finalTemplate).toContain("final code review pass");
    expect(finalTemplate).toContain("perform a full read-only code review");
    expect(finalTemplate).toContain("final security review pass");
    expect(finalTemplate).toContain("perform a read-only security review");
    expect(finalTemplate).toContain("UI layout/responsive overflow and interaction states");
    expect(finalTemplate).toContain("data mapping/normalization behavior");
    expect(finalTemplate).toContain("architecture/layer boundaries");
    expect(finalTemplate).toContain("public API/export surface");
    expect(finalTemplate).toContain("output encoding/XSS");
    expect(finalTemplate).toContain("authorization/data isolation");
    expect(finalTemplate).toContain("Readiness decision rule");
    expect(finalTemplate).toContain("confirmed correctly solved");
    expect(finalTemplate).toContain("do not treat passing or declared Implementation checks as a substitute for changed-file review coverage");
    expect(finalTemplate).toContain("using the configured skill policy");
    expect(finalTemplate).toContain("Class = code_review");
    expect(finalTemplate).toContain("Class = security");
    expect(finalTemplate).not.toContain("using-ecc");
  });

  test("downstream prompts treat PRD gaps as blockers instead of silent assumptions", () => {
    const researchTemplate = readTemplate("step1_research.md");
    const designTemplate = readTemplate("step2_design.md");
    const planTemplate = readTemplate("step3_plan.md");
    const implementationTemplate = readTemplate("step4_impl.md");
    const validationTemplate = readTemplate("step5b_val.md");

    expect(researchTemplate).toContain("do not turn that into a design assumption");
    expect(researchTemplate).toContain("Stop, report a PRD blocker");
    expect(designTemplate).toContain("If design requires that kind of change, stop");
    expect(planTemplate).toContain("do not plan work based on silent assumptions");
    expect(planTemplate).toContain("stop and ask the user to realign the PRD/design");
    expect(implementationTemplate).toContain("do not resolve deferred decisions from the PRD yourself");
    expect(validationTemplate).toContain("if implementation resolved a deferred decision without approval");
  });

  test("stage templates avoid method-prescriptive implementation and validation wording", () => {
    const bannedPhrases = [
      "grep_search",
      "list_dir",
      "view_file",
      "CQ checklist",
      "E2E tests",
      "browser check",
      "manual testing",
      "Implement the minimum",
      "Read existing code",
      "Add new automated tests",
      "hardcoded",
      "Make the solution maximally extensible",
      "testing strategy",
      "research independently"
    ];

    for (const templateName of templateNames) {
      const template = readTemplate(templateName);

      for (const phrase of bannedPhrases) {
        expect(template).not.toContain(phrase);
      }
    }
  });

  test("design prompt treats architecture design as an entrypoint for linked subdocuments", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("`architecture/design.md` is the required design-stage entry point");
    expect(template).toContain("Additional architecture files inside `architecture/` are allowed");
    expect(template).toContain("considered part of the approved design");
    expect(template).toContain("The controller checks approval only on `architecture/design.md`");
  });

  test("design prompt requires visual-first architecture package decomposition", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("architecture package entrypoint/index");
    expect(template).toContain("Architecture Package Map");
    expect(template).toContain("target size: up to 120 lines");
    expect(template).toContain("do not bloat it beyond 180 lines");
    expect(template).toContain("4+ material areas");
    expect(template).toContain("individual section becomes longer than 40 lines");
    expect(template).toContain("linked subdocument");
  });

  test("design prompt requires diagrams for non-trivial human review", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("Visual-first policy");
    expect(template).toContain("at least one Mermaid diagram");
    expect(template).toContain("```mermaid");
    expect(template).toContain("flowchart");
    expect(template).toContain("sequenceDiagram");
    expect(template).toContain("classDiagram");
    expect(template).toContain("erDiagram");
    expect(template).toContain("stateDiagram");
  });

  test("design prompt still allows small single-file designs", () => {
    const template = readTemplate("step2_design.md");

    expect(template).toContain("Small/single-file design");
    expect(template).toContain("If the change is small");
    expect(template).toContain("it may stay entirely in `architecture/design.md`");
  });

  test("setup prompt requires task description and task-specific rules before artifacts", () => {
    const template = readTemplate("step0_setup.md");

    expect(template).toContain("First, ask the user for the task/change description");
    expect(template).toContain("Then, in a separate request, ask for task-specific rules and constraints");
    expect(template).toContain("Do not create `prd.md` or `rules.md` until both items are available");
    expect(template).toContain("Run a material-question gate before creating files");
    expect(template).toContain("inspect the repository, artifact templates, config, tests, and project instructions before asking");
    expect(template).toContain("ask only questions whose answer can change");
    expect(template).toContain("ask in batches of 1-3 short questions");
    expect(template).toContain("name the artifact field or section each question can change");
    expect(template).toContain("do not ask obvious questions or questions answerable from repository evidence");
    expect(template).toContain("Before creating artifacts, summarize your final interpretation");
    expect(template).toContain("Do not guess missing ADLC/PRD fields");
    expect(template).toContain("For `feature` and `experiment` changes");
    expect(template).toContain("For `fix`, `refactor`, and `infra` changes");
  });

  test("repair prompt requires approval reset for changed approved artifacts", () => {
    const template = readTemplate("step5r_repair.md");

    expect(template).toContain("Human reapproval");
    expect(template).toContain("approved: true");
    expect(template).toContain("approved: false");
    expect(template).toContain("for a pure `implementation` repair, do not change approval statuses");
  });

  test("validation prompts define ready_with_risks and blocking findings consistently", () => {
    const findingsContract = readTemplate("artifacts/validation_findings.md");

    expect(findingsContract).toContain("repair_required: use when at least one open/reopened MUST-FIX finding exists.");
    expect(findingsContract).toContain("ready_with_risks: use only when open/reopened findings are limited to RECOMMENDED or NIT.");
    expect(findingsContract).toContain("implementation, test, plan, design, requirements, validation, security, code_review");
  });

  test("validation and repair prompts require a strict single findings registry", () => {
    const phaseTemplate = readTemplate("step5a_val.md");
    const finalTemplate = readTemplate("step5b_val.md");
    const repairTemplate = readTemplate("step5r_repair.md");

    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).toContain("Validation mode: review-only stage");
      expect(template).toContain("is not a test execution gate");
      expect(template).toContain("[validation_findings.md template]({{validation_findings_template_path}})");
      expect(template).toContain("the final file must strictly follow the artifact template");
      expect(template).toContain("`validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table");
      expect(template).toContain("do not add prose, headings, evidence blocks, summaries, visual markers, or extra tables to `validation_findings.md`");
      expect(template).not.toContain("| ID | Status | Class | Blocks PR? | Phase | Description |");
      expect(template).not.toContain("Blocks PR?");
      expect(template).toContain("add a new finding as a new row at the top of the table");
      expect(template).toContain("update the existing row with the same `ID`");
      expect(template).toContain("without new concrete evidence from working code outside `openspec/**`");
      expect(template).toContain("completely ignore `openspec/**`");
      expect(template).toContain("do not diff, review, or report any files under `openspec/**`");
      expect(template).toContain("changed-file review coverage");
      expect(template).toContain("requirements conformance pass");
      expect(template).toContain("security review pass");
      expect(template).toContain("Readiness decision rule");
      expect(template).toContain("Validation coverage:");
      expect(template).toContain("Files inspected:");
      expect(template).toContain("Code review pass: completed / incomplete");
      expect(template).toContain("Security review pass: completed / incomplete");
      expect(template).toContain("Check Evidence review: sufficient / insufficient");
      expect(template).toContain("Evidence gaps: none / <short reason>");
      expect(template).toContain("ordinary final response to the user");
      expect(template).toContain("not a flow artifact");
      expect(template).toContain("do not write it to `validation_findings.md`");
      expect(template).toContain("do not create a new file for it");
      expect(template).toContain("do not expand `implementation_plan.md` with it");
      expect(template).toContain("Check Evidence is sufficient only when it records a concrete command or method, a result, concise evidence");
      expect(template).toContain("Declarative Check Evidence such as `passed` without these details is insufficient");
      expect(template).toContain("If the coverage block would report an incomplete code review pass, incomplete security review pass, insufficient Check Evidence review, or non-empty evidence gaps");
    }

    expect(phaseTemplate).toContain("PRD/design are used as approved constraints and traceability context, not as full PRD completeness validation");
    expect(phaseTemplate).not.toContain("every `R#` is implemented by the actual change set or has a finding");
    expect(phaseTemplate).not.toContain("every `SC#` is demonstrably met or has a finding");
    expect(repairTemplate).toContain("[validation_findings.md template]({{validation_findings_template_path}})");
    expect(repairTemplate).toContain("preserve `type` in YAML frontmatter as the scope of the latest validation");
    expect(repairTemplate).toContain("record a fixed finding by changing the existing row `Status` to `resolved`");
    expect(repairTemplate).toContain("do not delete finding rows");
  });

  test("approval prompts require flexible human-review formatting without rigid placeholder sections", () => {
    const initTemplate = readTemplate("init.md");
    const setupTemplate = readTemplate("step0_setup.md");
    const approvalTemplates = [
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).not.toContain("Human Review Formatting Policy");
    expect(initTemplate).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt");
    expect(setupTemplate).toContain("Human Review Formatting Policy");
    expect(setupTemplate).toContain("For `prd.md`, do not choose structure based on content");
    expect(setupTemplate).toContain("Use only the strict PRD contract");

    for (const template of approvalTemplates) {
      expect(template).toContain("Human Review Formatting Policy");
      expect(template).toContain("YAML frontmatter remains first");
      expect(template).toContain("Do not create empty, decorative, or artificial sections");
      expect(template).toContain("Choose structure based on the concrete change content");
      expect(template).toContain("preserve all machine-readable");
    }
  });

  test("approval prompts require a compact visual review surface instead of plain markdown only", () => {
    const initTemplate = readTemplate("init.md");
    const setupTemplate = readTemplate("step0_setup.md");
    const approvalTemplates = [
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).not.toContain("compact visual review surface");
    expect(initTemplate).toContain("Stage-specific skill policy is supplied by the current `flow next` prompt");
    expect(setupTemplate).toContain("A compact visual review surface for `prd.md` is allowed only");
    expect(setupTemplate).toContain("semantic emoji markers");
    expect(setupTemplate).toContain("Do not leave an approval artifact as an ordinary wall");
    expect(setupTemplate).toContain("Use one primary human language");

    for (const template of approvalTemplates) {
      expect(template).toContain("compact visual review surface");
      expect(template).toContain("2-5");
      expect(template).toContain("semantic emoji markers");
      expect(template).toContain("📌");
      expect(template).toContain("🚫");
      expect(template).toContain("✅");
      expect(template).toContain("⚠️");
      expect(template).toContain("Do not leave an approval artifact as an ordinary wall");
      expect(template).toContain("Use one primary human language");
    }
  });

  test("approval prompts ask blocking questions before writing artifacts and group long lists", () => {
    const initTemplate = readTemplate("init.md");
    const setupTemplate = readTemplate("step0_setup.md");
    const approvalTemplates = [
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md")
    ];

    expect(initTemplate).not.toContain("If a question affects the approval artifact");
    expect(initTemplate).toContain("Use subagents only when");
    expect(setupTemplate).toContain("If a question affects the approval artifact");
    expect(setupTemplate).toContain("ask the user and stop until the answer");
    expect(setupTemplate).toContain("Do not write pending open questions");
    expect(setupTemplate).toContain("Separate accepted assumptions and deferred design-stage decisions");
    expect(setupTemplate).toContain("If a list grows beyond 7 items");
    expect(setupTemplate).toContain("For `prd.md`, use only the allowed sections");

    for (const template of approvalTemplates) {
      expect(template).toContain("If a question affects the approval artifact");
      expect(template).toContain("ask the user and stop until the answer");
      expect(template).toContain("Do not write pending open questions");
      expect(template).toContain("Separate accepted assumptions and deferred design-stage decisions");
      expect(template).toContain("If a list grows beyond 7 items");
      expect(template).toContain("Use callouts");
    }
  });

  test("visual formatting policy allows semantic emojis while protecting machine-readable flow grammar", () => {
    const visualTemplates = [
      readTemplate("step0_setup.md"),
      readTemplate("step2_design.md"),
      readTemplate("step3_plan.md"),
      readTemplate("step6_archive.md")
    ];

    for (const template of visualTemplates) {
      expect(template).toContain("emoji");
      expect(template).toContain("semantic visual markers");
      expect(template).toContain("Do not use emoji in YAML frontmatter");
      expect(template).toContain("Do not use emoji in commands, file paths, code blocks");
    }

    const planTemplate = readTemplate("step3_plan.md");
    expect(planTemplate).toContain("Do not use emoji in machine-parsed phase headings `## Phase N: <Phase name> [<status>]`");
  });

  test("validation prompts forbid visual markers in the machine-readable findings registry", () => {
    const phaseTemplate = readTemplate("step5a_val.md");
    const finalTemplate = readTemplate("step5b_val.md");

    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).not.toContain("Validation Visual Markers");
      expect(template).not.toContain("🟢");
      expect(template).not.toContain("🟡");
      expect(template).not.toContain("🔴");
      expect(template).not.toContain("Validation Visual Markers");
      expect(template).toContain("[validation_findings.md template]({{validation_findings_template_path}})");
    }
    expect(phaseTemplate).toContain("must have `type: phase`");
    expect(finalTemplate).toContain("must have `type: final`");
    expect(finalTemplate).toContain("do not leave the template default `type: phase`");
  });

  test("artifact templates define plan and findings contracts", () => {
    const prdTemplate = readTemplate("artifacts/prd.md");
    const planContract = readTemplate("artifacts/implementation_plan.md");
    const findingsContract = readTemplate("artifacts/validation_findings.md");

    expect(prdTemplate).toContain("Instantiate this template into the change directory as prd.md");
    expect(prdTemplate).toContain("Remove every HTML comment from the final prd.md");
    expect(prdTemplate).toContain("Before writing prd.md, run an ADLC-style user intake through the question tool when available.");
    expect(prdTemplate).toContain("Continue asking 1-3 focused questions per round until all material ambiguity is closed.");
    expect(prdTemplate).toContain("ADLC-style intake coverage:");
    expect(prdTemplate).toContain("Accepted Assumptions must be explicit user-accepted assumptions, not silent agent guesses.");
    expect(prdTemplate).toContain("Change type: use exactly one of these values: feature, fix, refactor, infra, experiment.");
    expect(prdTemplate).toContain("Section contract:");
    expect(prdTemplate).toContain("Blocking question rule:");
    expect(prdTemplate).toContain("| Change type |  |");
    expect(prdTemplate).toContain("## Intent Card");
    expect(prdTemplate).not.toContain("<change name>");
    expect(prdTemplate).not.toContain("<why");
    expect(prdTemplate).not.toContain("<what");
    expect(planContract).toContain("Remove every HTML comment from the final implementation_plan.md");
    expect(planContract).toContain("Phase status contract:");
    expect(planContract).toContain("Use [ ] for not started.");
    expect(planContract).toContain("Generation Bundle contract:");
    expect(planContract).toContain("Required values must be exactly one of: yes, no, not_applicable.");
    expect(planContract).toContain("Check Evidence contract:");
    expect(planContract).toContain("Result values must be exactly one of: pending, passed, failed, blocked, not_applicable.");
    expect(planContract).toContain("Task IDs are phase-scoped: 1.1, 1.2, 2.1");
    expect(planContract).toContain("Do not add a generic Definition of Done section");
    expect(planContract).toContain("Additional checks:");
    expect(planContract).not.toContain("<change name>");
    expect(planContract).not.toContain("<goal>");
    expect(planContract).not.toContain("<atomic");
    expect(planContract).not.toContain("yes/no/not_applicable");
    expect(findingsContract).toContain("| ID | Status | Severity | Class | Phase | Finding | Required Fix |");
    expect(findingsContract).toContain("Remove every HTML comment from the final validation_findings.md");
    expect(findingsContract).toContain("Verdict contract:");
    expect(findingsContract).toContain("Table value contract:");
    expect(findingsContract).toContain("MUST-FIX");
    expect(findingsContract).toContain("RECOMMENDED");
    expect(findingsContract).toContain("NIT");
    expect(findingsContract).not.toContain("Example row");
    expect(findingsContract).not.toContain("Concrete self-contained finding");
  });

  test("archive prompt keeps OpenSpec requirement text strict and non-decorative", () => {
    const archiveTemplate = readTemplate("step6_archive.md");

    expect(archiveTemplate).toContain("valid strict registry");
    expect(archiveTemplate).toContain("contains no open/reopened blocking findings");
    expect(archiveTemplate).toContain("In the final report, visual formatting");
    expect(archiveTemplate).toContain("Do not use emoji, decorative callouts, or rich formatting in OpenSpec requirement text");
    expect(archiveTemplate).toContain("OpenSpec specs remain normative");
  });

  test("template renderer rejects unresolved placeholders", () => {
    expect(() => renderTemplate("step6_evolution", {})).toThrow("unresolved placeholder(s): incident, change_scope, test_scope");
  });

  test("init and plan prompts document phase validation before final validation", () => {
    const initTemplate = readTemplate("init.md");
    const planTemplate = readTemplate("step3_plan.md");
    const planContract = readTemplate("artifacts/implementation_plan.md");

    expect(initTemplate).toContain("After successful Phase Validation for all phases, the flow proceeds to `Final Validation`");
    expect(initTemplate).not.toContain("Phase Validation does not run separately");
    expect(planTemplate).toContain("every phase, including the only phase, goes through `Implementation -> Phase Validation`");
    expect(planTemplate).not.toContain("Implementation -> Final Validation` without separate Phase Validation");
    expect(planContract).toContain("Additional checks:");
  });

  test("archive prompt documents delta-first specs and artifact scope", () => {
    const initTemplate = readTemplate("init.md");
    const archiveTemplate = readTemplate("step6_archive.md");

    expect(initTemplate).toContain("6. Archive");
    expect(initTemplate).toContain("After successful Final Validation, the next `flow next` starts Archive");
    expect(archiveTemplate).toContain("[prd.md]({{prd_path}})");
    expect(archiveTemplate).toContain("[rules.md]({{rules_path}})");
    expect(archiveTemplate).toContain("[research_facts.md]({{research_path}})");
    expect(archiveTemplate).toContain("[design.md]({{design_path}})");
    expect(archiveTemplate).toContain("[implementation_plan.md]({{plan_path}})");
    expect(archiveTemplate).toContain("Do not use `validation_findings.md` as a source of requirements");
    expect(archiveTemplate).toContain("{{archive_path}}/specs/<capability>/spec.md");
    expect(archiveTemplate).toContain("One spec file = one functional area.");
    expect(archiveTemplate).toContain("Do not create one large catch-all spec");
    expect(archiveTemplate).toContain("## ADDED Requirements");
    expect(archiveTemplate).toContain("{{archive_state_path}}");
    expect(archiveTemplate).toContain("status: \"completed\"");
    expect(archiveTemplate).not.toContain("{{archive_command}}");
    expect(archiveTemplate).not.toContain("Blocks PR?");
  });

  test("default config defines stage skill routers instead of a separate skill router template", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "..", "config.yaml"), "utf-8");

    expect(fs.existsSync(path.resolve(__dirname, "..", "templates", "skill_router.md"))).toBe(false);
    expect(config).toContain("implementation:");
    expect(config).toContain("skills:");
    expect(config).toContain("- using-ecc");
    expect(config).toContain("- dev-core");
    expect(config).toContain("phase_validation:");
    expect(config).toContain("final_validation:");
    expect(config).toContain("archive:");
  });
});
