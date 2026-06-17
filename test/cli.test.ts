import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { parseConfig } from "../src/features/runner/config";
import { renderSkillPolicy } from "../src/features/stage-control/skill-policy";
import { renderValidationCommonContract } from "../src/features/stage-control/validation-common-contract";
import { renderTemplate } from "../src/shared/templates/render-template";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;
const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

function setupTestDir() {
  testTmpDir = createTempWorkspace("flow-cli");
}

function cleanupTestDir() {
  cleanupTempWorkspace(testTmpDir);
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

function validRulesBody(): string {
  return `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`;
}

function writeConfig(body: string): string {
  const configPath = path.join(testTmpDir, "flow-config.yaml");
  fs.mkdirSync(testTmpDir, { recursive: true });
  fs.writeFileSync(configPath, body, "utf-8");
  return configPath;
}

function writeProjectConfig(body: string): string {
  const configPath = path.join(testTmpDir, ".phasedev", "config.yaml");
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
| F2 | code | \`test/cli.test.ts:422\` | CLI fixture asserts the research prompt renders. | SC1 |

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

function setupChange(planContent: string, options: { rules?: string; findings?: string; designApproved?: boolean; planApproved?: boolean } = {}) {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
  writeApproved(path.join(changeDir, "rules.md"), options.rules ?? validRulesBody());
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

function runCheckWithProject(projectPath: string, args: string[] = []): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "check", "--project-path", projectPath, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
}

function runCheckValidation(args: string[] = []): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "check-validation", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
}

function runCheckArchive(args: string[] = []): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "check-archive", ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
}

function writeCompletedArchive(changeName = "sample-change"): string {
  const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `2026-05-29-${changeName}`);
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), JSON.stringify({
    status: "completed",
    changeName,
    archivePath: archiveDir,
    startedAt: "2026-05-29T10:00:00.000Z",
    completedAt: "2026-05-29T10:10:00.000Z"
  }, null, 2), "utf-8");
  return archiveDir;
}

function writeDeltaSpec(archiveDir: string, capability: string, content: string): string {
  const specPath = path.join(archiveDir, "specs", capability, "spec.md");
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, content, "utf-8");
  return specPath;
}

function expectSubstringsInOrder(content: string, fragments: string[]): void {
  let fromIndex = 0;

  for (const fragment of fragments) {
    const foundIndex = content.indexOf(fragment, fromIndex);
    expect(foundIndex).toBeGreaterThanOrEqual(0);
    fromIndex = foundIndex + fragment.length;
  }
}

describe("flow-cli state machine", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("init output contains base prompt without stage skill router", () => {
    const output = runInit();

    expect(output).toContain("Use this prompt only to acknowledge the current PhaseDev init handshake.");
    expect(output).toContain("## Init State");
    expect(output).toContain("command: init");
    expect(output).toContain("current_stage: setup");
    expect(output).toContain("route_kind: setup");
    expect(output).toContain("active_change: none");
    expect(output).toContain("may_modify_files: false");
    expect(output).toContain("Allowed persistent artifacts: none");
    expect(output).toContain("complete, verbatim controller output printed by `phasedev next`");
    expect(output).toContain("A user paraphrase, manual reconstruction, memory-based summary");
    expect(output).toContain("For incomplete next input, no work is performed");
    expect(output).not.toContain("Stage-specific skill policy");
    expect(output).not.toContain("Do not infer allowed skills from this init prompt.");
    expect(output).not.toContain("## Mandatory Skill Selection Router");
    expect(output).not.toContain("## Configured Skill Policy");
    expect(output).not.toContain("Artifact Build Contract");
    expect(output).not.toContain("Stage 0. AI Layer Setup.");
  });

  test("init accepts project flow config but keeps output policy-free", () => {
    writeProjectConfig(`
codex:
  stages:
    implementation:
      skills:
        main:
          - project-only-skill
`);

    const output = runInit();

    expect(output).toContain("Use this prompt only to acknowledge the current PhaseDev init handshake.");
    expect(output).not.toContain("Stage-specific skill policy");
    expect(output).not.toContain("Do not infer allowed skills from this init prompt.");
    expect(output).not.toContain("## Configured Skill Policy");
    expect(output).not.toContain("project-only-skill");
  });

  test("init ignores invalid project flow config", () => {
    writeProjectConfig(`
codex:
  stages:
    setup:
      reasoningEffort: impossible
`);

    const output = runInit();

    expect(output).toContain("Use this prompt only to acknowledge the current PhaseDev init handshake.");
    expect(output).toContain("command: init");
    expect(output).toContain("route_kind: setup");
    expect(output).not.toContain("Config key");
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
    expect(output).toContain("## Flow Skill Boundary Protocol");
    expect(output).toContain("Authority order: Flow stage contract > linked or embedded artifact contract/template > configured skill policy > selected skill body.");
    expect(output).toContain("Skills are method instructions only; they never control Flow state.");
    expect(output).toContain("This prompt is the stage skill policy compiled from `config.yaml`.");
    expect(output).toContain("Skill names are exact config values; do not replace them with similar, inferred, or remembered skills.");
    expect(output).toContain("Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed stage skill configuration.");
    expect(output).toContain("If a listed skill is unavailable, continue under this Flow stage contract and record it as skipped/unavailable in the final skill compliance note.");
    expect(output).toContain("Stop for an unavailable skill only when this stage cannot be completed under the Flow stage contract without that skill's method.");
    expect(output).not.toContain("If a listed skill is unavailable and is needed or applicable");
    expect(output).toContain("Use a selected skill's method, checklist, algorithm, or review logic when it applies to the stage evidence.");
    expect(output).toContain("Do not skip an applicable selected skill because its native output format differs");
    expect(output).toContain("In the final response, include a short skill compliance note listing router skills used, router-selected skills used, main/additional skills used, and skipped/unavailable listed skills.");
    expect(output).toContain("Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.");
    expect(output).toContain("Allowed skills:");
    expect(output).toContain("Priority 1 - Routers:\n- none configured");
    expect(output).toContain("Priority 2 - Main:");
    expect(output).toContain("- `dev-core`");
    expect(output).toContain("- `test-driven-development`");
    expect(output).toContain("Priority 3 - Additional:");
    expect(output).toContain("- `api-and-interface-design`");
    expect(output).toContain("Allowed external skills: only the main and additional skills listed in this prompt.");
    expect(output).toContain("If no configured or router-selected skill fits the available stage evidence, continue under this Flow stage contract");
    expect(output).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(output).not.toContain("Router-selected:");
    expect(output).toContain("Check Evidence");
  });

  test("implementation prompt uses project flow config without --config", () => {
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

  test("research prompt falls back to framework config when project flow config is absent", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), validRulesBody());

    const output = runNext();

    expect(fs.existsSync(path.join(testTmpDir, ".phasedev", "config.yaml"))).toBe(false);
    expect(output).toContain("Stage 1. Research.");
    expect(output).toContain("Priority 1 - Routers:\n- `using-ecc`");
    expect(output).not.toContain("- `using-zuvo`");
    expect(output).not.toContain("Router-selected:");
    expect(output).toContain("This prompt is the stage skill policy compiled from `config.yaml`.");
    expect(output).toContain("Skill names are exact config values; do not replace them with similar, inferred, or remembered skills.");
    expect(output).toContain("Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed stage skill configuration.");
    expect(output).toContain("Priority 1: read listed router skills first when they are available and help select a relevant research method; if no router is available or applicable, continue under this Flow stage contract.");
    expect(output).toContain("If no configured or router-selected skill fits the available stage evidence, continue under this Flow stage contract");
    expect(output).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
  });

  test("implementation prompt renders compiled skill priorities before main and additional skills", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
codex:
  stages:
    setup:
      skills:
        routers:
          - using-ecc
        main: []
        additional: []
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

    expect(output).toContain("## Flow Skill Boundary Protocol");
    expect(output).toContain("Authority order: Flow stage contract > linked or embedded artifact contract/template > configured skill policy > selected skill body.");
    expect(output).toContain("Priority 1 - Routers:\n- `using-zuvo`");
    expect(output).not.toContain("Router-selected:");
    expect(output).not.toContain("determined after reading routers");
    expect(output).not.toContain("Priority 1: read listed router skills first when they are available and applicable to the stage evidence.");
    expect(output).toContain("Router skills listed as Priority 1 are read first when available because they may select method skills.");
    expect(output).toContain("Main, additional, and router-selected method skills are loaded only when they apply to the available stage evidence.");
    expect(output).toContain("Priority 1: after reading this stage prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select method skills; then load only router-selected, main, or additional method skills that apply to the stage evidence.");
    expect(output).toContain("Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.");
    expect(output).toContain("Priority 2: use listed main skills only when router skills and router-selected skills are insufficient for the stage evidence.");
    expect(output).toContain("Allowed external skills: listed router skills, skills selected by listed router skills, listed main skills, and listed additional skills.");
    expect(output).toContain("Priority 2 - Main:");
    expect(output).toContain("Priority 3 - Additional:");
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

    expect(output).toContain("## Flow Skill Boundary Protocol");
    expect(output).toContain("Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.");
    expect(output).toContain("No external skills are configured for this stage in `config.yaml`.");
    expect(output).toContain("Do not use external skills unless the user updates `config.yaml` or explicitly approves an exception.");
    expect(output).not.toContain("Priority 1 - Routers:");
  });

  test("plan prompt includes PRD intent input for downstream planning", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeApproved(path.join(changeDir, "architecture", "design.md"), validDesignBody());

    const output = runNext();

    expect(output).toContain("Stage 3. Plan.");
    expect(output).toContain("PRD intent, requirements, and success criteria");
    expect(output).toContain("prd.md");
    expect(output).toContain("Target state");
    expect(output).toContain("Risk boundaries");
  });

  test("artifact stage prompts include immediate self-check routes", () => {
    let output = runNext();
    expect(output).toContain("Artifact Build Contract: prd.md");
    expect(output).toContain("Artifact Build Contract: rules.md");
    expect(output).toContain(`current project repository at \`${testTmpDir}\``);
    expect(output).toContain("this absolute path is the only target repository for repository inspection and artifact writes");
    expect(output).toContain(path.join(testTmpDir, ".phasedev", "changes", "<derive-slug-from-final-task>", "prd.md"));
    expect(output).toContain("Before creating the change folder, prevent slug collisions");
    expect(output).toContain("derive the next non-conflicting slug by appending `-2`, then `-3`");
    expect(output).toContain("do not overwrite or reuse it");
    expect(output).not.toContain(["open", "spec", "changes"].join("/"));
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev"))).toBe(false);
    expect(output).toContain("Proceed without a separate confirmation stop when the current context already supplies enough acceptance, evidence, and risk data");
    expect(output).toContain("Retrieval order: project instructions first, then package/test metadata, then only files or directories directly relevant to the requested change");
    expect(output).toContain("Context budget: at most one broad file listing, plus one focused package/workspace listing when needed for nested or monorepo package discovery");
    expect(output).toContain("Stop condition: stop reading once you can fill `Intent`, `R#`, `SC#`, risk boundaries, and `rules.md` gates without material assumptions");
    expect(output).toContain("manual: <named method supported by user/repo evidence>");
    expect(output).toContain("only when the repository is clearly new/minimal: no package/test metadata, no project commands, and no existing file or user answer identifies a better method");
    expect(output).toContain("embedded template is the only artifact structure");
    expect(output).toContain("Artifact Build Contracts above are the canonical source for exact structure, comment removal, placeholder handling, and output paths");
    expect(output.match(/Canonical fill rules:/g) ?? []).toHaveLength(2);
    expect(output).not.toContain("Strict fill rules:");
    expect(output).toContain("# PRD");
    expect(output).toContain("# Rules");
    expect(output).toContain("Artifact self-check");
    expect(output.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(output.match(/Stage 0 is not complete until this command passes/g) ?? []).toHaveLength(0);
    expect(output).toContain("phasedev check --project-path");
    expect(output).toContain("--expect-route setup_approval");
    expect(output).toContain("first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route setup_approval` subcommand");
    expect(output).toContain("Final response must use this compact template and include no extra sections");
    expect(output).toContain("Change slug: <slug>");
    expect(output).toContain("Self-check: <exact command> -> <result>");
    expect(output).toContain("Skill compliance: <configured/router skills used; skipped/unavailable skills>");

    cleanupTestDir();
    let changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), validRulesBody());

    output = runNext();
    expect(output).toContain("Stage 1. Research.");
    expect(output).toContain("Artifact Build Contract: research_facts.md");
    expect(output).toContain("# Research Facts");
    expect(output).toContain(`Existing project specs: [.phasedev/specs](file://${path.join(testTmpDir, ".phasedev", "specs")})`);
    expect(output).toContain(`Target project root for repository evidence: \`${testTmpDir}\``);
    expect(output).toContain(`Run all code, config, test, and runtime evidence searches under \`${testTmpDir}\` unless an explicit input artifact path in this prompt points elsewhere.`);
    expect(output).toContain("Retrieval order: project instructions and package/test metadata, then code/config/tests/runtime wiring directly tied to the PRD targets");
    expect(output).toContain("Context budget: use 2-4 broad file listings/searches total as a soft cap, at most one per target area");
    expect(output).not.toContain("Context budget: use a small bounded number of broad file listings/searches");
    expect(output).not.toContain("Context budget: use at most one broad file listing/search to map candidate areas");
    expect(output).toContain("Stop condition: stop reading once every `Intent` field, `R#`, `SC#`, evidence type, and risk boundary can be recorded");
    expect(output).toContain("Current code lacking the target behavior is usually a `limited` or `blocked` current-state fact");
    expect(output).toContain("Put affected modules, public interfaces, dependencies, existing contracts, constraints, and similar existing solutions in the `Fact` text");
    expect(output).toContain("Every table cell must be non-empty, including Notes.");
    expect(output).toContain("Source Facts Supports must use R#/SC#; do not use none/not_applicable.");
    expect(output).toContain("Replace every embedded template example row and example value with real stage-specific content.");
    expect(output).toContain("The final artifact must not contain these embedded template sample values: `Requested target from PRD.`, `Requested risk boundary from PRD.`, `Current implementation partially supports the requested target; F1 records what exists and what does not yet fully support the target.`, `Current tests or configuration partially cover this boundary; F2 records current enforcement gaps without claiming target completion.`, `src/file.ts:42`, `test/file.test.ts:12`, `.phasedev/specs/foo/spec.md:12`, `Current implementation does X.`, `Tests verify behavior X.`, `Existing spec describes capability Y.`.");
    expect(output).not.toContain("Preserve YAML frontmatter keys exactly; change only allowed values.");
    expect(output).toContain("Artifact self-check");
    expect(output.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(output).toContain("--expect-route design");
    expect(output).toContain("If the `phasedev` executable name is unavailable, first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route design` subcommand");
    expect(output).toContain("repository-confirmed `npm exec -- phasedev check --project-path ... --expect-route design` or `bunx phasedev check --project-path ... --expect-route design` form");
    expect(output).toContain("If no equivalent executable is available after this documented lookup, report the exact command failure as a blocker/unavailable self-check result and do not report research as ready.");
    expect(output).toContain("Report `Research ready` only after this self-check passes.");
    expect(output).toContain("Success final response is allowed only after the self-check passes. It must use this compact template and include no extra sections");
    expect(output).toContain("The only exception is unavailable self-check after the documented command lookup.");
    expect(output).toContain("do not use the `Research ready` template and add no extra sections");
    expect(output).toContain("final response must be exactly one short plain blocker sentence or one compact line such as `Blocked: self-check unavailable (<exact command failure>)`");
    expect(output).toContain("Research ready:");
    expect(output).toContain("Route: design");
    expect(output).toContain("Next: phasedev next");
    expectSubstringsInOrder(output, [
      "Stage 1. Research.",
      "## Configured Skill Policy",
      "Input artifacts:",
      "Output artifact:",
      "## Artifact Build Contract: research_facts.md",
      "Full template content:",
      "Canonical fill rules:",
      "Decision flow:",
      "Research artifact requirements:",
      "## Artifact self-check",
      "## Artifact allowlist",
      "Stage completion:",
      "Success final response is allowed only after the self-check passes",
      "Research ready:",
      "The only exception is unavailable self-check after the documented command lookup"
    ]);

    cleanupTestDir();
    changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");

    output = runNext();
    expect(output).toContain("Stage 2. Design.");
    expect(output).toContain("Artifact Build Contract: architecture/design.md");
    expect(output).toContain("# Design");
    expect(output).toContain("## Architecture Package Map");
    expect(output).toContain("immediately validate the new design artifact");
    expect(output).toContain("--expect-route design_approval");

    writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), true);

    output = runNext();
    expect(output).toContain("Stage 3. Plan.");
    expect(output).toContain("Artifact Build Contract: implementation_plan.md");
    expect(output).toContain("# Implementation Plan");
    expect(output.match(/`- \[ \] <phase>\.<task> Task description`/g) ?? []).toHaveLength(1);
    expect(output).toContain("Artifact self-check");
    expect(output.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(output).toContain("--expect-route plan_approval");
    expect(output).toContain("Use this bounded retrieval order before planning");
    expect(output).toContain("If any required input is missing or unreadable, report `Missing required input artifact: <exact linked path>` and stop without creating or partially writing `implementation_plan.md`.");
    expect(output).toContain("Verify that `prd.md` and `design.md` have `approved: true`");
    expect(output).toContain("Context budget and stop condition:");
    expect(output).toContain("Reading configured skill instructions does not count as repository evidence, but skill-driven repo searches do count.");
    expect(output).toContain("Stop retrieval when every `R#`, `SC#`, Evidence type, relevant `D#`, and risk boundary can be mapped");
    expect(output).toContain("Keep `approved: false`; only the user can approve the plan.");
    expect(output).toContain("Fill `Approval Summary` as the compact review surface");
    expect(output).toContain("Every `R#`, every `SC#`, each `SC#` Evidence type, every risk boundary, and every relevant approved `D#` must appear");
    expect(output).toContain("Use concise tables, grouped lists, and short paragraphs inside existing template sections when they improve review speed");
    expect(output).not.toContain("## Human Review Formatting Policy");
    expect(output).toContain("Stop for user realignment only when bounded planning evidence reveals a material PRD/design contradiction");
    expect(output).toContain("Do not stop for low-level implementation details that do not change approval scope");
    expect(output).toContain("If a detail is missing but does not change approval scope");
    expect(output).toContain("choose the smallest conservative planning assumption");
    expect(output).toContain("Examples of acceptable conservative planning assumptions:");
    expect(output).toContain("Use the test command already listed in `rules.md` for the matching evidence type");
    expect(output).toContain("Examples of required planning blockers:");
    expect(output).toContain("Approved PRD and approved design disagree about a public contract");
    expect(output).toContain("If the missing answer would change what the user is approving");
    expect(output).toContain("Do not use emoji in `implementation_plan.md`");
    expect(output).toContain("If the `phasedev` executable name is unavailable, first look for a controller-provided or local package executable that runs the same `check --project-path ... --expect-route plan_approval` subcommand");
    expect(output).toContain("local CLI invocation like `bun run src/cli.ts check --project-path ... --expect-route plan_approval` when package/source entrypoint evidence supports it");
    expect(output).toContain("Router skills do not expand the repository retrieval budget or authorize extra repo inspection without a concrete planning question.");
    expect(output).toContain("Success final response is allowed only after the self-check passes. It must use this compact template and include no extra sections");
    expect(output).toContain("Plan ready: implementation_plan.md");
    expect(output).toContain("Plan path:");
    expect(output).toContain("Self-check: <exact command> -> <result>");
    expect(output).toContain("Skill compliance: <configured/router skills used; skipped/unavailable skills>");
    expect(output).toContain("Next: review implementation_plan.md, set approved: true and approved_by: \"<your name>\" only if accepted, then run phasedev next.");
    expect(output).toContain("For any blocker stop, do not use the `Plan ready` template and do not add extra sections.");
    expect(output).toContain("Blocked: material PRD/design realignment required (<affected R#/SC#/D# or risk boundary>)");
    expect(output).not.toContain("Immediately after the title/intro, add a compact visual review surface");
    expect(output).not.toContain("Emoji may be used as semantic visual markers");
  });

  test("prompt generator renders plan prompt from isolated generated sandbox", () => {
    const outDir = path.join(testTmpDir, "generated-agent-prompts");
    const scriptPath = path.resolve(__dirname, "..", "scripts", "generate-agent-prompts.ts");
    const result = Bun.spawnSync({
      cmd: ["bun", "run", scriptPath, "--project-path", testTmpDir, "--out-dir", outDir],
      stdout: "pipe",
      stderr: "pipe"
    });

    expect(result.exitCode).toBe(0);
    const planPrompt = fs.readFileSync(path.join(outDir, "prompts", "04-stage-3-plan.md"), "utf-8");
    const implementationPrompt = fs.readFileSync(path.join(outDir, "prompts", "05-stage-4-implementation.md"), "utf-8");
    const phaseValidationPrompt = fs.readFileSync(path.join(outDir, "prompts", "06-stage-5a-phase-validation.md"), "utf-8");
    const finalValidationPrompt = fs.readFileSync(path.join(outDir, "prompts", "07-stage-5b-final-validation.md"), "utf-8");
    const repairPrompt = fs.readFileSync(path.join(outDir, "prompts", "08-stage-5r-repair.md"), "utf-8");
    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf-8")) as Array<{ sourceProjectPath: string; workingProjectPath: string }>;
    const phasePlanLink = phaseValidationPrompt.match(/\[implementation_plan\.md\]\((file:\/\/[^)]+)\)/)?.[1];
    const phaseFindingsLink = phaseValidationPrompt.match(/\[validation_findings\.md\]\((file:\/\/[^)]+)\)/)?.[1];
    const phaseOutputPath = phaseValidationPrompt.match(/- Output path: `([^`]+validation_findings\.md)`/)?.[1];
    const phaseCheckProjectPath = phaseValidationPrompt.match(/phasedev check-validation --project-path "([^"]+)" --scope phase --phase-id 1/)?.[1];
    const finalOutputPath = finalValidationPrompt.match(/- Output path: `([^`]+validation_findings\.md)`/)?.[1];
    const finalCheckProjectPath = finalValidationPrompt.match(/phasedev check-validation --project-path "([^"]+)" --scope final/)?.[1];
    const repairOutputPath = repairPrompt.match(/- Output path: `([^`]+validation_findings\.md)`/)?.[1];
    const repairCheckProjectPath = repairPrompt.match(/phasedev check --project-path "([^"]+)"/)?.[1];

    expect(planPrompt).toContain(path.join(outDir, "artifact-snapshots", "04-stage-3-plan", ".phasedev", "changes", "generated-agent-prompts", "implementation_plan.md"));
    expect(planPrompt).toContain("Router skills do not expand the repository retrieval budget or authorize extra repo inspection without a concrete planning question.");
    expect(planPrompt).toContain("Reading configured skill instructions does not count as repository evidence, but skill-driven repo searches do count.");
    expect(planPrompt).toContain("Examples of acceptable conservative planning assumptions:");
    expect(planPrompt).toContain("Examples of required planning blockers:");
    expect(planPrompt).toContain("Success final response is allowed only after the self-check passes.");
    expect(planPrompt).toContain("For any blocker stop, do not use the `Plan ready` template and do not add extra sections.");
    expect(implementationPrompt).toContain("Ordered workflow:");
    expect(implementationPrompt).toContain("Read this stage prompt, then the linked artifacts in this order");
    expect(implementationPrompt).toContain("Inspect repository files only after the linked artifacts are understood, and only files or narrow searches needed by the current phase `Expected Change Surface`.");
    expect(implementationPrompt).toContain("Context budget and stop condition:");
    expect(implementationPrompt).toContain("Stop retrieval when every current-phase task, related `R#`, related `SC#`, check row, and applicable risk boundary has enough evidence to implement and verify.");
    expect(implementationPrompt).toContain("Read configured Priority 1 router skills first when available because they may select method skills; load main, additional, or router-selected method skills only when they apply to current phase evidence");
    expect(implementationPrompt).toContain("if an approved plan/design gap materially prevents safe current-phase completion or verification for a required `Target state`, `R#`, `SC#`, `Evidence` type, or risk boundary");
    expect(implementationPrompt).toContain("if a plan/design gap does not materially prevent safe completion or verification of the current phase inside the approved surface, record it as a remaining risk instead of blocking");
    expect(implementationPrompt).toContain("do not block on PRD/design coverage gaps outside the current phase boundary");
    expect(implementationPrompt).toContain("use only these `Result` values in `Check Evidence`: `pending`, `passed`, `failed`, `blocked`, `not_applicable`");
    expect(implementationPrompt).toContain("if checks fail and the failure is causally related to the current phase change set, fix only inside the approved current-phase surface and repeat the affected checks");
    expect(implementationPrompt).toContain("if a check failure is unrelated to the current phase, external/environmental, or outside the approved surface, do not repair outside scope");
    expect(implementationPrompt).toContain("if the controller self-check command, binary, or environment is unavailable, record the exact command and error class, keep the phase heading `[~]`");
    expect(implementationPrompt).toContain("do not substitute a different route check");
    expect(implementationPrompt).toContain("--expect-route phase --expect-stage phase_validation");
    expect(implementationPrompt).toContain("Final response is allowed only after the self-check passes or the current phase is honestly recorded as `blocked`.");
    expect(implementationPrompt).toContain("Implementation ready: Phase 1: Prompt Generation");
    expect(implementationPrompt).not.toContain("Artifact Build Contract");
    expect(phaseValidationPrompt).toContain("Retrieval order:");
    expect(phaseValidationPrompt).toContain("If only a generated prompt bundle is being evaluated and its linked sandbox files are unavailable, use the embedded artifact contract and current phase label in this prompt");
    expect(phaseValidationPrompt).toContain("Context budget and stop condition:");
    expect(phaseValidationPrompt).toContain("git diff --name-status -- .");
    expect(phaseValidationPrompt).toContain("Run these read-only repository inventory commands from the project root for this prompt context");
    expect(phaseValidationPrompt).toContain("in generated prompt bundles, the same snapshot root shown by the Artifact Build Contract Output path and `phasedev check-validation --project-path`");
    expect(phaseValidationPrompt).toContain("including, where applicable to changed files, user/input handling");
    expect(phaseValidationPrompt).toContain("ignored or generated expected surfaces can be verified through filesystem reads, generated manifest/output evidence, or other concrete read-only evidence");
    expect(phaseValidationPrompt).toContain("Preserve every existing finding row, including `resolved` rows");
    expect(phaseValidationPrompt).toContain("Allocate new IDs by reading all existing `F<number>` IDs and using the next highest number");
    expect(phaseValidationPrompt).toContain("verdict: <set_after_review>");
    expect(phaseValidationPrompt).not.toContain("verdict: ready\ntype: phase\ndate:");
    expect(phaseOutputPath).toBe(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(phaseCheckProjectPath).toBe(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation"));
    expect(phasePlanLink).toBeTruthy();
    const phasePlanPath = phasePlanLink!.replace(/^file:\/\//, "");
    expect(phasePlanPath).toContain(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation"));
    const phasePlanSnapshot = fs.readFileSync(phasePlanPath, "utf-8");
    expect(phasePlanSnapshot).toContain("## Phase 1: Prompt Generation [~]");
    expect(phasePlanSnapshot).not.toContain("## Phase 1: Prompt Generation [x]");
    expect(phaseFindingsLink).toBeTruthy();
    const phaseFindingsPath = phaseFindingsLink!.replace(/^file:\/\//, "");
    expect(phaseFindingsPath).toContain(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation"));
    if (fs.existsSync(phaseFindingsPath)) {
      expect(fs.readFileSync(phaseFindingsPath, "utf-8")).toContain("type: phase");
      expect(fs.readFileSync(phaseFindingsPath, "utf-8")).not.toContain("type: final");
    }
    expect(phaseValidationPrompt).not.toContain(path.join(outDir, "artifact-snapshots", "07-stage-5b-final-validation"));
    expect(phaseValidationPrompt).not.toContain(`file://${path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "implementation_plan.md")}`);
    expect(phaseValidationPrompt).not.toContain(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalValidationPrompt).toContain("Stage 5B. Final Validation.");
    expect(finalValidationPrompt).toContain("Retrieval order:");
    expect(finalValidationPrompt).toContain("Start from the approved PRD target state, requirements, success criteria, and risk boundaries");
    expect(finalValidationPrompt).toContain("scope = full change");
    expect(finalValidationPrompt).toContain("Read linked flow artifacts in this order: `prd.md`, `architecture/design.md`, `implementation_plan.md` all phases");
    expect(finalValidationPrompt).toContain("Build the validation scope from the full approved PRD `Intent`, every `R#`, every `SC#`");
    expect(finalValidationPrompt).toContain("Inspect every changed production/source/config/test file in the full change set");
    expect(finalValidationPrompt).toContain("Declarative Check Evidence such as `passed` without these details is weak evidence, not an automatic blocker");
    expect(finalValidationPrompt).toContain("do not force `repair_required`");
    expect(finalValidationPrompt).toContain("do not rerun `unit`, `phase`, `full`, or additional checks at this stage");
    expect(finalValidationPrompt).toContain("Final Validation does not mark phases as `[x]`");
    expect(finalValidationPrompt).toContain("type: final");
    expect(finalValidationPrompt).toContain("verdict must be exactly one of: ready, ready_with_risks, repair_required.");
    expect(finalValidationPrompt).not.toContain("verdict must be exactly one of: ready, ready_with_risks, repair_required, repaired.");
    expect(finalValidationPrompt).not.toContain("- repaired: use only in Repair Loop after actual blocking findings are resolved");
    expect(finalValidationPrompt).toContain("phasedev check-validation --project-path");
    expect(finalValidationPrompt).toContain("--scope final");
    expect(finalValidationPrompt).toContain("snapshot Output paths and snapshot self-check project paths are fixture paths for bundle self-check coherence");
    expect(finalValidationPrompt).toContain("during live `phasedev next`, use the active change folder and Output path provided by the live prompt instead");
    expect(finalOutputPath).toBe(path.join(outDir, "artifact-snapshots", "07-stage-5b-final-validation", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalCheckProjectPath).toBe(path.join(outDir, "artifact-snapshots", "07-stage-5b-final-validation"));
    expect(finalOutputPath).toBe(path.join(finalCheckProjectPath!, ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalValidationPrompt).not.toContain(`phasedev check-validation --project-path "${path.join(outDir, "sandbox-project")}" --scope final`);
    expect(finalValidationPrompt).not.toContain(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalValidationPrompt).not.toContain("Read linked flow artifacts in this order: `implementation_plan.md` current phase");
    expect(finalValidationPrompt).not.toContain("Build the validation scope from the current phase `Goal`");
    expect(finalValidationPrompt).not.toContain("Inspect every changed production/source/config/test file tied to the current phase");
    expect(finalValidationPrompt).not.toContain("current-phase artifacts, current-phase changed files");
    expect(repairPrompt).toContain("Stage 5R. Repair Loop.");
    expect(repairPrompt).toContain("Ordered workflow:");
    expect(repairPrompt).toContain("Read the Current Repair Queue, then open the full findings registry only to preserve/update rows");
    expect(repairPrompt).toContain("Context budget and stop condition:");
    expect(repairPrompt).toContain("Stop retrieval when every queued finding ID has a concrete repair target");
    expect(repairPrompt).toContain("preserve all existing registry rows that are not in the current blocking queue");
    expect(repairPrompt).toContain("if a requirements/design detail is ambiguous but does not change approval scope");
    expect(repairPrompt).toContain("Repair class map:");
    expect(repairPrompt).toContain("`implementation`: change affected production/source/config/test files inside the current approved design and plan");
    expect(repairPrompt).toContain("`test`: change the affected tests, test fixtures, or test command evidence");
    expect(repairPrompt).toContain("`plan`: update [implementation_plan.md]");
    expect(repairPrompt).toContain("`design`: update [design.md]");
    expect(repairPrompt).toContain("`requirements`: stop for user discussion before material approval-scope changes");
    expect(repairPrompt).toContain("`validation`: repair validation evidence, registry row accuracy, or Check Evidence consistency");
    expect(repairPrompt).toContain("`security`: change affected source/config/tests needed to remove the security blocker");
    expect(repairPrompt).toContain("`code_review`: change the exact files or active change artifacts identified by the review finding");
    expect(repairPrompt).toContain("do not set `ready` or `ready_with_risks` during the Repair Loop stage");
    expect(repairPrompt).toContain("in generated prompt bundles, snapshot Output paths and snapshot self-check project paths are fixture paths for bundle self-check coherence");
    expect(repairPrompt).toContain("Success final response is allowed only after the self-check passes.");
    expect(repairPrompt).toContain("Resolved findings: <F# list>");
    expect(repairPrompt).toContain("Self-check: <exact command> -> <result>");
    expect(repairOutputPath).toBe(path.join(outDir, "artifact-snapshots", "08-stage-5r-repair", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(repairCheckProjectPath).toBe(path.join(outDir, "artifact-snapshots", "08-stage-5r-repair"));
    expect(repairOutputPath).toBe(path.join(repairCheckProjectPath!, ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(repairPrompt).not.toContain(`phasedev check --project-path "${path.join(outDir, "sandbox-project")}"`);
    expect(repairPrompt).not.toContain(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(planPrompt).not.toContain("demo-sandbox");
    expect(fs.existsSync(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "implementation_plan.md"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"))).toBe(true);
    expect(manifest[0].sourceProjectPath).toBe(testTmpDir);
    expect(manifest[0].workingProjectPath).toBe(path.join(outDir, "sandbox-project"));
  });

  test("check reports invalid fresh PRD without rendering the next prompt", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n\n## Intent\n", false);
    writeArtifact(path.join(changeDir, "rules.md"), validRulesBody(), false);

    const result = runCheck(["--expect-route", "setup_approval"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED: invalid_prd");
    expect(result.output).toContain("Intent field `Change type` must be present and non-empty.");
    expect(result.output).not.toContain("[FLOW CONTROLLER] BLOCKED");
  });

  test("check passes valid setup artifacts only at setup approval route", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "rules.md"), validRulesBody(), false);

    const pass = runCheck(["--expect-route", "setup_approval"]);
    const fail = runCheck(["--expect-route", "research"]);

    expect(pass.exitCode).toBe(0);
    expect(pass.output).toContain("[PHASEDEV CHECK] OK: current route is setup_approval");
    expect(fail.exitCode).toBe(1);
    expect(fail.output).toContain("expected route research, got setup_approval");
  });

  test("check can assert the current stage separately from route kind", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [ ] 1.1 Implement endpoint
`);

    const pass = runCheck(["--expect-route", "phase", "--expect-stage", "implementation"]);
    const fail = runCheck(["--expect-route", "phase", "--expect-stage", "phase_validation"]);

    expect(pass.exitCode).toBe(0);
    expect(pass.output).toContain("[PHASEDEV CHECK] OK: current route is phase (stage: implementation).");
    expect(fail.exitCode).toBe(1);
    expect(fail.output).toContain("expected stage phase_validation, got implementation");
  });

  test("check rejects unknown expected stages", () => {
    const result = runCheckWithProject(testTmpDir, ["--expect-stage", "not_a_stage"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED: unknown expected stage not_a_stage.");
    expect(result.output).toContain("Known stages:");
  });

  test("check does not load stage config", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "rules.md"), validRulesBody(), false);
    const configPath = writeConfig("codex: [");

    const result = runCheck(["--expect-route", "setup_approval", "--config", configPath]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CHECK] OK: current route is setup_approval");
  });

  test("check reports invalid design before approval", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeArtifact(path.join(changeDir, "architecture", "design.md"), "# Design\n\n## Executive Summary\n", false);

    const result = runCheck(["--expect-route", "design_approval"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED: invalid_design");
  });

  test("check passes valid design at design approval route", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "rules.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), false);

    const result = runCheck(["--expect-route", "design_approval"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CHECK] OK: current route is design_approval");
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
    const archivedDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    const result = runCheck(["--expect-route", "archive_ready"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Archive is ready; no files were moved by check.");
    expect(fs.existsSync(changeDir)).toBe(true);
    expect(fs.existsSync(archivedDir)).toBe(false);
  });

  test("check-validation final fails when findings type is phase", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "phase")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] FAILED: final");
    expect(result.output).toContain("YAML field `type` must be `final` for Final Validation.");
  });

  test("check-validation final passes when ready findings route to archive_ready", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] OK: final validation is complete.");
  });

  test("check-validation final fails when ready findings leave archive readiness blocked", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Final Validation declared ready, but route is archive_readiness_blocked.");
  });

  test("check-validation final passes when repair_required findings route to repair", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "final", "| F1 | open | MUST-FIX | validation | Final | Review coverage incomplete. | Complete final validation coverage. |\n")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] OK: final validation is complete.");
  });

  test("check-validation final rejects repaired verdict", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repaired", "final", "| F1 | resolved | MUST-FIX | validation | Final | Review coverage was incomplete. | Keep final validation coverage complete. |\n")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("`verdict: repaired` is not valid for Final Validation stage output.");
  });

  test("check-validation phase fails when ready findings leave the phase incomplete", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "phase")
    });

    const result = runCheckValidation(["--scope", "phase", "--phase-id", "1"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("`verdict: ready` is valid only after Phase 1 is marked [x].");
  });

  test("check-validation phase passes when ready findings completed the phase", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint

## Phase 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("ready", "phase")
    });

    const result = runCheckValidation(["--scope", "phase", "--phase-id", "1"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] OK: phase validation is complete.");
  });

  test("check-validation phase passes when repair_required findings route to repair", () => {
    setupChange(`
# Plan

## Phase 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "phase", "| F1 | open | MUST-FIX | validation | Phase 1 | Review coverage incomplete. | Complete phase validation coverage. |\n")
    });

    const result = runCheckValidation(["--scope", "phase", "--phase-id", "1"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] OK: phase validation is complete.");
  });

  test("check-validation phase rejects repaired verdict", () => {
    setupChange(`
# Plan

## Phase 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repaired", "phase", "| F1 | resolved | MUST-FIX | validation | Phase 1 | Review coverage was incomplete. | Keep phase validation coverage complete. |\n")
    });

    const result = runCheckValidation(["--scope", "phase", "--phase-id", "1"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("`verdict: repaired` is not valid for Phase Validation stage output.");
  });

  test("check fails when archive state is malformed", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), "{ malformed json", "utf-8");

    const result = runCheck();

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED: invalid_archive_state (stage: archive)");
    expect(result.output).toContain(".flow-archive.json is not valid JSON");
  });

  test("check-archive passes for completed archive with valid delta spec", () => {
    const archiveDir = writeCompletedArchive();
    writeDeltaSpec(archiveDir, "flow-routing", `## ADDED Requirements

### Requirement: Route approved changes
The system SHALL route approved changes to Archive.

#### Scenario: Archive-ready change
- WHEN final validation is ready
- THEN the Archive stage is selected
`);

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[FLOW ARCHIVE CHECK] OK: archive is complete.");
  });

  test("check-archive passes for completed archive without delta specs", () => {
    const archiveDir = writeCompletedArchive();

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[FLOW ARCHIVE CHECK] OK: archive is complete.");
  });

  test("check-archive fails when archive path or state is invalid", () => {
    const missingPath = runCheckArchive([]);
    expect(missingPath.exitCode).toBe(1);
    expect(missingPath.output).toContain("check-archive requires --archive-path <path>.");

    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });

    const missingState = runCheckArchive(["--archive-path", archiveDir]);
    expect(missingState.exitCode).toBe(1);
    expect(missingState.output).toContain(".flow-archive.json is missing.");

    fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), "{ malformed json", "utf-8");
    const malformedState = runCheckArchive(["--archive-path", archiveDir]);
    expect(malformedState.exitCode).toBe(1);
    expect(malformedState.output).toContain(".flow-archive.json is not valid JSON");
  });

  test("check-archive fails when completed state is incomplete", () => {
    const archiveDir = writeCompletedArchive();
    fs.writeFileSync(path.join(archiveDir, ".flow-archive.json"), JSON.stringify({
      status: "in_progress",
      changeName: "sample-change",
      archivePath: archiveDir,
      startedAt: "2026-05-29T10:00:00.000Z"
    }), "utf-8");

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("status must be \"completed\"");
    expect(result.output).toContain("must include completedAt");
  });

  test("check-archive fails when delta spec path or capability is invalid", () => {
    const archiveDir = writeCompletedArchive();
    writeDeltaSpec(archiveDir, "archive", `## ADDED Requirements

### Requirement: Route approved changes
The system SHALL route approved changes to Archive.
`);
    const nestedPath = path.join(archiveDir, "specs", "nested", "capability", "spec.md");
    fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
    fs.writeFileSync(nestedPath, "## ADDED Requirements\n", "utf-8");

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Capability name is too generic");
    expect(result.output).toContain("Delta spec path must be specs/<capability>/spec.md");
  });

  test("check-archive fails for invalid delta spec headings and placeholders", () => {
    const archiveDir = writeCompletedArchive();
    writeDeltaSpec(archiveDir, "flow-routing", `## CHANGED Requirements

### Behavior: Route approved changes
The system should route approved changes.

#### Case: Archive-ready change
- WHEN final validation is ready
- THEN the Archive stage is selected

TODO
`);

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("unsupported delta spec section heading");
    expect(result.output).toContain("requirement headings must start");
    expect(result.output).toContain("scenario headings must start");
    expect(result.output).toContain("contains unresolved placeholder-like prose");
  });

  test("check-archive fails when added or modified requirement lacks normative text", () => {
    const archiveDir = writeCompletedArchive();
    writeDeltaSpec(archiveDir, "flow-routing", `## MODIFIED Requirements

### Requirement: Route approved changes
The system routes approved changes.
`);

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("must include normative SHALL or MUST text");
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
    expect(output).toContain("implementation_plan.md must contain at least one phase heading. Use exactly `## Phase <number>: <name> [ ]`, `## Phase <number>: <name> [~]`, or `## Phase <number>: <name> [x]`.");
    expect(output).not.toContain("Stage 5B. Final Validation.");
  });

  test("check reports canonical phase heading syntax for malformed plan headings", () => {
    setupChange(`
# Plan

## Phase 1: API
- [ ] 1.1 Implement endpoint
`);

    const result = runCheck(["--expect-route", "plan_approval"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("implementation_plan.md has invalid phase heading syntax: `## Phase 1: API`. Use exactly `## Phase <number>: <name> [ ]`, `## Phase <number>: <name> [~]`, or `## Phase <number>: <name> [x]`.");
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
    expect(output).toContain("## Controller Observed Changed Files");
    expect(output).toContain(`phasedev check-validation --project-path "${testTmpDir}" --scope phase --phase-id 1`);
    expect(output).not.toContain("check --project-path");
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
    expect(output).toContain("Intent");
    expect(output).toContain("Requirements");
    expect(output).toContain("Success Criteria");
    expect(output).toContain("## Controller Observed Changed Files");
    expect(output).toContain(`phasedev check-validation --project-path "${testTmpDir}" --scope final`);
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
    expect(output).toContain("preserve all existing registry rows that are not in the current blocking queue");
    expect(output).toContain("Context budget and stop condition:");
    expect(output).toContain("Repair ready for repeat validation.");
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
    const archivedDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Stage 6. Archive.");
    expect(output).toContain(`${archivedDir}/specs/<capability>/spec.md`);
    expect(output).toContain(`check-archive --archive-path ${archivedDir}`);
    expect(output).toContain("R# | Spec-level? | Capability | Operation | Target spec | Reason");
    expect(output).toContain(".flow-archive.json");
    expect(output).toContain(`archive path: \`${archivedDir}\``);
    expect(fs.existsSync(path.join(archivedDir, ".flow-archive.json"))).toBe(true);
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev", "changes", "sample-change"))).toBe(false);
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
    const archivedDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

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
      rules: `# Rules

## Test Commands
| Gate | Command |
|---|---|
| phase | \`bun test phase\` |
| full | \`bun test full\` |
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid rules.md");
    expect(output).toContain("unit");
    expect(output).toContain("Test Commands must contain exactly these gates in order");
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
      rules: `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| full | \`bun test full\` |
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
      rules: `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
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
    expect(output).toContain(`phasedev check --project-path "${testTmpDir}" --expect-route phase --expect-stage phase_validation`);
    expect(output).toContain("finish only when the controller self-check passes or the current phase is honestly recorded as `blocked`");
    expect(output).toContain("do not mark the phase heading `[x]` at this stage");
    expect(output).not.toContain("change the phase status in the plan heading from `[~]`");
    expect(output).not.toContain("mark the phase heading as `[x]`");
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
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

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

  function readValidationTemplate(name: "step5a_val.md" | "step5b_val.md"): string {
    const stage = name === "step5b_val.md" ? "final_validation" : "phase_validation";
    return readTemplate(name).replace("{{validation_common_contract}}", renderValidationCommonContract(stage));
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

  test("generated skill policy preserves configured stage boundaries", () => {
    const config = parseConfig(`
codex:
  stages:
    setup:
      skills:
        routers:
          - using-ecc
        main:
          - spec-driven-development
        additional: []
    implementation:
      skills:
        routers:
          - using-zuvo
        main:
          - dev-core
        additional:
          - security-and-hardening
    final_validation:
      skills:
        routers:
          - using-zuvo
        main: []
        additional:
          - performance-audit
`);

    const implementationPolicy = renderSkillPolicy("implementation", config);
    const validationPolicy = renderSkillPolicy("final_validation", config);
    const setupPolicy = renderSkillPolicy("setup", config);
    const researchPolicy = renderSkillPolicy("research", parseConfig(`
codex:
  stages:
    research:
      skills:
        routers:
          - using-ecc
        main: []
        additional: []
`));

    expect(setupPolicy).toContain("router skills such as `using-ecc` may classify the task");
    expect(setupPolicy).toContain("do not authorize reading framework source, framework templates, config files");
    expect(setupPolicy).toContain("For setup, if no configured or router-selected skill fits the available post-intake evidence, continue under this Flow stage contract");
    expect(setupPolicy).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(researchPolicy).toContain("If no configured or router-selected skill fits the available stage evidence, continue under this Flow stage contract");
    expect(researchPolicy).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(implementationPolicy).toContain("Allowed skills:");
    expect(implementationPolicy).toContain("Priority 1 - Routers:");
    expect(implementationPolicy).toContain("- `using-zuvo`");
    expect(implementationPolicy).toContain("- `dev-core`");
    expect(implementationPolicy).toContain("- `security-and-hardening`");
    expect(implementationPolicy).not.toContain("Router-selected:");
    expect(implementationPolicy).not.toContain("determined after reading routers");
    expect(implementationPolicy).toContain("Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed stage skill configuration.");
    expect(implementationPolicy).not.toContain("Priority 1: read listed router skills first when they are available and applicable to the stage evidence.");
    expect(implementationPolicy).toContain("Router skills listed as Priority 1 are read first when available because they may select method skills.");
    expect(implementationPolicy).toContain("Main, additional, and router-selected method skills are loaded only when they apply to the available stage evidence.");
    expect(implementationPolicy).toContain("Do not preload every configured method skill body; keep method skill loading minimal.");
    expect(implementationPolicy).toContain("Priority 1: after reading this stage prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select method skills; then load only router-selected, main, or additional method skills that apply to the stage evidence.");
    expect(implementationPolicy).toContain("Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.");
    expect(implementationPolicy).toContain("If no configured or router-selected skill fits the available stage evidence, continue under this Flow stage contract");
    expect(implementationPolicy).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(validationPolicy).toContain("Allowed skills:");
    expect(validationPolicy).toContain("- `performance-audit`");
    expect(validationPolicy).toContain("Validation stages are review-only");
  });

  test("stage templates preserve executable artifact allowlists", () => {
    const expectations: Array<[string, string[]]> = [
      ["step0_setup.md", ["`prd.md`", "`rules.md`"]],
      ["step1_research.md", ["`research_facts.md`"]],
      ["step2_design.md", ["active change folder `architecture/design.md`", "linked files inside the active change folder `architecture/`"]],
      ["step3_plan.md", ["`implementation_plan.md`"]],
      ["step4_impl.md", ["production/test code", "`implementation_plan.md`"]],
      ["step5a_val.md", ["`validation_findings.md`", "`implementation_plan.md`"]],
      ["step5b_val.md", ["`validation_findings.md`"]],
      ["step5r_repair.md", ["affected production/test code", "`validation_findings.md`"]],
      ["step6_archive.md", ["Delta specs", "`.phasedev/specs`"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      expect(template).toContain("Allowed persistent artifacts for this stage");
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("artifact templates keep machine-readable flow contracts", () => {
    const prdTemplate = readTemplate("artifacts/prd.md");
    const planTemplate = readTemplate("artifacts/implementation_plan.md");
    const findingsTemplate = readTemplate("artifacts/validation_findings.md");

    const prdSections = Array.from(prdTemplate.matchAll(/^##\s+(.+)$/gm)).map(match => match[1]);
    expect(prdSections).toEqual(["Intent", "Requirements", "Success Criteria"]);
    expect(planTemplate).toContain("Phase status contract:");
    expect(planTemplate).toContain("Check Evidence contract:");
    expect(planTemplate).toContain("| Area / Path Pattern | Change Type | Ownership | Trace |");
    expect(findingsTemplate).toContain("verdict: <set_after_review>");
    expect(findingsTemplate).toContain("Replace `<set_after_review>` with the verdict selected after evidence review");
    expect(findingsTemplate).toContain("repair_required: use when at least one open/reopened MUST-FIX finding exists.");
    expect(findingsTemplate).toContain("type: phase");
    expect(findingsTemplate).toContain("| ID | Status | Severity | Class | Phase | Finding | Required Fix |");
  });

  test("validation templates preserve registry scope markers", () => {
    const phaseTemplate = readValidationTemplate("step5a_val.md");
    const finalTemplate = readValidationTemplate("step5b_val.md");

    expect(phaseTemplate).toContain("must have `type: phase`");
    expect(finalTemplate).toContain("must have `type: final`");
    expect(finalTemplate).not.toContain("template default `type: phase`");
    expect(phaseTemplate).toContain("Build the validation scope from the current phase `Goal`");
    expect(finalTemplate).toContain("Build the validation scope from the full approved PRD `Intent`");
    expect(finalTemplate).not.toContain("Read linked flow artifacts in this order: `implementation_plan.md` current phase");
    expect(finalTemplate).not.toContain("Inspect every changed production/source/config/test file tied to the current phase");
    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).toContain("`validation_findings.md` contains only YAML frontmatter and exactly one markdown findings table");
      expect(template).not.toContain("| ID | Status | Class | Blocks PR? | Phase | Description |");
      expect(template).not.toContain("Blocks PR?");
    }
  });

  test("archive prompt keeps archive state and delta spec inputs", () => {
    const archiveTemplate = readTemplate("step6_archive.md");

    expect(archiveTemplate).toContain("[prd.md]({{prd_path}})");
    expect(archiveTemplate).toContain("[rules.md]({{rules_path}})");
    expect(archiveTemplate).toContain("[research_facts.md]({{research_path}})");
    expect(archiveTemplate).toContain("[design.md]({{design_path}})");
    expect(archiveTemplate).toContain("[implementation_plan.md]({{plan_path}})");
    expect(archiveTemplate).toContain("{{archive_path}}/specs/<capability>/spec.md");
    expect(archiveTemplate).toContain("{{archive_state_path}}");
    expect(archiveTemplate).toContain("status: \"completed\"");
    expect(archiveTemplate).not.toContain("{{archive_command}}");
  });

  test("template renderer rejects unresolved placeholders", () => {
    expect(() => renderTemplate("step6_evolution", {})).toThrow("unresolved placeholder(s): incident, change_scope, test_scope");
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
