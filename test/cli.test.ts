import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getConfigValue, parseConfig, DEFAULT_CONFIG } from "../src/entities/config/config";
import { loadConfig } from "../src/entities/config/config";
import { getRoutePrompt } from "../src/features/phase-control/get-route-prompt";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { renderSkillPolicy } from "../src/features/phase-control/skill-policy";
import { renderValidationCommonContract } from "../src/features/phase-control/validation-common-contract";
import { renderTemplate } from "../src/shared/templates/render-template";
import { approvalContentHash } from "../src/shared/markdown/frontmatter";
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
  if (approved) {
    const contentHash = approvalContentHash(body);
    fs.writeFileSync(filePath, `---\napproved: true\napproved_hash: "${contentHash}"\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(filePath, `---\napproved: false\n---\n${body}`, "utf-8");
  }
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

## Constraints
None.

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
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

function validationFindings(verdict: "ready" | "ready_with_risks" | "repair_required" | "repaired", type: "iteration" | "final", rows = ""): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-05-28
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
| Approval scope | Exercise the flow CLI fixture path. |
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
  writeApproved(path.join(changeDir, "execution_contract.md"), options.rules ?? validRulesBody());
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), options.designApproved ?? true);
  writeArtifact(path.join(changeDir, "iteration_plan.md"), withImplementationPlanContract(planContent), options.planApproved ?? true);

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  return changeDir;
}

function writeStateJson(changeDir: string, activePhase: string, activeIteration: number | null = null): void {
  const statePath = path.join(changeDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({ activePhase, activeIteration }, null, 2) + "\n", "utf-8");
}

function runPhase(args: string[] = []): string {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, "phase", "--project-path", testTmpDir, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  expect(result.exitCode).toBe(0);
  return result.stdout.toString();
}

function runNext(args: string[] = []): string {
  // Extract --config <path> from args if present
  let explicitConfig: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && args[i + 1]) {
      explicitConfig = args[i + 1];
      break;
    }
  }

  let config: Config;
  if (explicitConfig) {
    config = loadConfig(path.resolve(explicitConfig));
  } else {
    const projectConfig = path.join(testTmpDir, ".phasedev", "config.yaml");
    if (fs.existsSync(projectConfig)) {
      config = loadConfig(projectConfig);
    } else {
      config = DEFAULT_CONFIG;
    }
  }

  const result = getRoutePrompt(testTmpDir, config);
  return result.prompt;
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

function runCli(args: string[] = []): { exitCode: number; output: string } {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", cliPath, ...args],
    stdout: "pipe",
    stderr: "pipe"
  });

  return {
    exitCode: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`
  };
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
  fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), JSON.stringify({
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

  test("help output documents commands, workflow, generated files, and stages", () => {
    const help = runCli(["help"]);
    const helpLong = runCli(["--help"]);
    const helpShort = runCli(["-h"]);

    expect(help.exitCode).toBe(0);
    expect(helpLong.exitCode).toBe(0);
    expect(helpShort.exitCode).toBe(0);
    expect(helpLong.output).toBe(help.output);
    expect(helpShort.output).toBe(help.output);
    expect(help.output).toContain("PhaseDev AI Framework");
    expect(help.output).toContain("Workflow:");
    expect(help.output).toContain("Commands:");
    expect(help.output).toContain("Generated files:");
    expect(help.output).toContain("Phases:");
    expect(help.output).toContain("Examples:");
    for (const commandName of ["help", "init-project", "init", "next", "check", "check-validation", "check-archive"]) {
      expect(help.output).toContain(`phasedev ${commandName}`);
    }
    for (const generatedPath of [".phasedev/config.yaml", ".phasedev/changes/", ".phasedev/changes/archive/", ".phasedev/specs/", ".phasedev/logs/"]) {
      expect(help.output).toContain(generatedPath);
    }
    expect(help.output).toContain("change_intake");
    expect(help.output).toContain("code_research");
    expect(help.output).toContain("final_validation");
    expect(help.output).toContain("archive");
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev"))).toBe(false);
  });

  test("unknown command prints help and exits non-zero", () => {
    const result = runCli(["unknown-command", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown command: unknown-command");
    expect(result.output).toContain("Commands:");
    expect(result.output).toContain("phasedev init-project");
  });

  test("commands report an actionable blocker when multiple active changes exist", () => {
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "change-a"), { recursive: true });
    fs.mkdirSync(path.join(testTmpDir, ".phasedev", "changes", "change-b"), { recursive: true });

    const result = runCli(["status", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Multiple active changes found in .phasedev/changes");
    expect(result.output).toContain("change-a");
    expect(result.output).toContain("change-b");
    expect(result.output).toContain("Keep exactly one active change");
  });

  test("init-project creates PhaseDev workspace structure and project config", () => {
    const result = runCli(["init-project", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV INIT-PROJECT] OK");
    for (const workspacePath of [
      ".phasedev",
      ".phasedev/changes",
      ".phasedev/changes/archive",
      ".phasedev/specs",
      ".phasedev/logs"
    ]) {
      expect(fs.statSync(path.join(testTmpDir, workspacePath)).isDirectory()).toBe(true);
    }
    const configPath = path.join(testTmpDir, ".phasedev", "config.yaml");
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.readFileSync(configPath, "utf-8")).toContain("phases:");
    expect(fs.readFileSync(configPath, "utf-8")).toContain("runArchiveStage:");
    expect(fs.readdirSync(path.join(testTmpDir, ".phasedev", "changes")).sort()).toEqual(["archive"]);
  });

  test("init-project is idempotent and does not overwrite existing config", () => {
    const configPath = path.join(testTmpDir, ".phasedev", "config.yaml");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, "custom: true\n", "utf-8");

    const first = runCli(["init-project", "--project-path", testTmpDir]);
    const second = runCli(["init-project", "--project-path", testTmpDir]);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.output).toContain("config: existing");
    expect(second.output).toContain("config: existing");
    expect(fs.readFileSync(configPath, "utf-8")).toBe("custom: true\n");
    expect(fs.statSync(path.join(testTmpDir, ".phasedev", "changes", "archive")).isDirectory()).toBe(true);
  });

  test("init-project fails when project path does not exist", () => {
    const missingPath = path.join(testTmpDir, "missing-project");
    const result = runCli(["init-project", "--project-path", missingPath]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV INIT-PROJECT] FAILED");
    expect(result.output).toContain("project path must exist and be a directory");
    expect(fs.existsSync(missingPath)).toBe(false);
  });

  test("init output contains base prompt without stage skill router", () => {
    const output = runInit();

    expect(output).toContain("Use this prompt only to acknowledge the current PhaseDev init handshake.");
    expect(output).toContain("## Init State");
    expect(output).toContain("command: init");
    expect(output).toContain("current_phase: change_intake");
    expect(output).toContain("route_kind: change_intake");
    expect(output).toContain("active_change: none");
    expect(output).toContain("may_modify_files: false");
    expect(output).toContain("Allowed persistent artifacts: none");
    expect(output).toContain("complete, verbatim controller output printed by `phasedev phase`");
    expect(output).toContain("A user paraphrase, manual reconstruction, memory-based summary");
    expect(output).toContain("For incomplete next input, no work is performed");
    expect(output).not.toContain("Stage-specific skill policy");
    expect(output).not.toContain("Do not infer allowed skills from this init prompt.");
    expect(output).not.toContain("## Mandatory Skill Selection Router");
    expect(output).not.toContain("## Configured Skill Policy");
    expect(output).not.toContain("Artifact Build Contract");
    expect(output).not.toContain("Phase 1. Change Intake.");
  });

  test("init accepts project flow config but keeps output policy-free", () => {
    writeProjectConfig(`
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
stages:
  change_intake:
    skills:
      routers: []
      main: []
      additional: []
`);

    const output = runInit();

    expect(output).toContain("Use this prompt only to acknowledge the current PhaseDev init handshake.");
    expect(output).toContain("command: init");
    expect(output).toContain("route_kind: change_intake");
    expect(output).not.toContain("Config key");
  });

  test("implementation prompt uses config skills without requiring a router", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
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
    expect(output).toContain("Authority: Flow phase contract > linked/embedded artifact contract > configured skill policy > skill body.");
    expect(output).toContain("Skills are method instructions only; they never control Flow state");
    expect(output).toContain("Read Priority 1 router skills first (they may select execution-method skills); then evaluate configured `main` and router-selected skills against phase evidence. `additional` skills are optional unless routers/main are insufficient.");
    expect(output).toContain("If a configured router, configured `main`, or router-selected skill is unavailable and applicable, stop with a blocker. Skip only with a concrete evidence-specific reason.");
    expect(output).toContain("Final response: one line per skill — `APPLIED` / `NOT_APPLICABLE(reason)` / `UNAVAILABLE`.");
    expect(output).not.toContain("If a listed skill is unavailable and is needed or applicable");
    expect(output).toContain("Native skill reports, headings, and output formats are not Flow artifact structure; adapt useful output into the current PhaseDev artifact template, final response, or blocker.");
    expect(output).toContain("No routers are configured; main skills fully execute by default.");
    expect(output).toContain("Allowed skills:");
    expect(output).toContain("Priority 1 - Routers:\n- none configured");
    expect(output).toContain("Priority 2 - Main:");
    expect(output).toContain("- `dev-core`");
    expect(output).toContain("- `test-driven-development`");
    expect(output).toContain("Priority 3 - Additional:");
    expect(output).toContain("- `api-and-interface-design`");
    expect(output).toContain("Authorized external skills (boundary, do not exceed): only the main and additional skills listed in this prompt.");
    expect(output).toContain("For each configured router, configured main, and router-selected skill that does not fit the phase evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section.");
    expect(output).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(output).not.toContain("Router-selected:");
    expect(output).toContain("Check Evidence");
    // Negative: old compact placeholder must not appear when skills are configured
    expect(output).not.toContain("Skill compliance: <configured/router skills used; skipped/unavailable skills>");
    // Structured ledger format must be in the compliance line
    expect(output).toContain("Skill compliance: one entry per configured router, configured main, router-selected, and selected additional skill.");
    expect(output).toContain("Format: `skill-name`: APPLIED(source: <loaded>, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)");
    expect(output).toContain("Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])");
    expect(output).toContain("Format: `skill-name`: UNAVAILABLE(exact_name: <name>, reason: <not found/unavailable/error>)");
  });

  test("implementation prompt uses project flow config without --config", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    writeProjectConfig(`
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
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());

    const output = runNext();

    expect(fs.existsSync(path.join(testTmpDir, ".phasedev", "config.yaml"))).toBe(false);
    expect(output).toContain("Phase 2. Code Research.");
    expect(output).toContain("## Configured Skill Policy");
    expect(output).toContain("No external skills are configured for this phase.");
    expect(output).toContain("Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed phase skill configuration.");
    expect(output).toContain("Skill compliance: none configured.");
    expect(output).not.toContain("using-ecc");
    expect(output).not.toContain("Router-selected:");
    expect(output).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
  });

  test("implementation prompt renders compiled skill priorities before main and additional skills", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
stages:
  change_intake:
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
    expect(output).toContain("Authority: Flow phase contract > linked/embedded artifact contract > configured skill policy > skill body.");
    expect(output).toContain("Priority 1 - Routers:\n- `using-zuvo`");
    expect(output).not.toContain("Router-selected:");
    expect(output).not.toContain("determined after reading routers");
    expect(output).not.toContain("Priority 1: read listed router skills first when they are available and applicable to the phase evidence.");
    expect(output).toContain("Read Priority 1 router skills first (they may select execution-method skills); then evaluate configured `main` and router-selected skills against phase evidence. `additional` skills are optional unless routers/main are insufficient.");
    expect(output).toContain("If a configured router, configured `main`, or router-selected skill is unavailable and applicable, stop with a blocker. Skip only with a concrete evidence-specific reason.");
    expect(output).toContain("Priority 1: after reading this phase prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select execution-method skills; then fully execute router-selected or main skills that apply to the phase evidence, and use additional skills only when their evidence-specific condition is met.");
    expect(output).toContain("Router-selected skills follow the same mandatory execution contract as main skills.");
    expect(output).toContain("Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.");
    expect(output).toContain("Priority 2: fully execute listed main skills by default; they are not gated by router availability. Router (P1) augments/selects; it does not gate main. When a router-selected skill and a main skill conflict on the same evidence, the router-selected skill takes priority and the main skill reports as NOT_APPLICABLE(superseded by <skill>) only for the superseded evidence.");
    expect(output).toContain("Authorized external skills (boundary, do not exceed): listed router skills, skills selected by listed router skills, listed main skills, and listed additional skills.");
    expect(output).toContain("Priority 2 - Main:");
    expect(output).toContain("Priority 3 - Additional:");
  });

  test("implementation prompt has no skill content when stage skills are empty", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint
`);
    const configPath = writeConfig(`
stages:
  implementation: {}
`);

    const output = runNext(["--config", configPath]);

    // When skills are empty, the phase prompt must say so explicitly, without the
    // full mandatory-execution contract or priority sections used for configured skills.
    expect(output).toContain("## Configured Skill Policy");
    expect(output).toContain("No external skills are configured");
    expect(output).toContain("Skill compliance: none configured.");
    expect(output).not.toContain("Do not use external skills");
    expect(output).not.toContain("Priority 1 - Routers:");
    // No-skills branch must not include execution contract or skill compliance
    expect(output).not.toContain("Configured `main` skills are mandatory execution-method skills for this phase.");
    expect(output).not.toContain("APPLIED(source:");
  });

  test("plan prompt includes PRD intent input for downstream planning", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeApproved(path.join(changeDir, "architecture", "design.md"), validDesignBody());

    const output = runNext();

    expect(output).toContain("Phase 4. Iteration Planning.");
    expect(output).toContain("PRD intent, requirements, and success criteria");
    expect(output).toContain("prd.md");
    expect(output).toContain("Target state");
    expect(output).toContain("Risk boundaries");
  });

  test("artifact stage prompts include immediate self-check routes", () => {
    let output = runNext();
    expect(output).toContain("Artifact Build Contract: prd.md");
    expect(output).toContain("Artifact Build Contract: execution_contract.md");
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
    expect(output).toContain("Stop condition: stop reading once you can fill `Intent`, `R#`, `SC#`, risk boundaries, and `execution_contract.md` gates without material assumptions");
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
    expect(output).toContain("--project-path");
    expect(output).toContain("look once for a controller-provided or local equivalent that runs the same `check");
    expect(output).toContain("Final response must use this compact template and include no extra sections");
    expect(output).toContain("Change slug: <slug>");
    expect(output).toContain("Self-check: <exact command> -> <result>");
    expect(output).toContain("Skill compliance: none configured.");

    cleanupTestDir();
    let changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());

    output = runNext();
    expect(output).toContain("Phase 2. Code Research.");
    expect(output).toContain("Artifact Build Contract: research_facts.md");
    expect(output).toContain("# Research Facts");
    expect(output).toContain(`Existing project specs: [.phasedev/specs](file://${path.join(testTmpDir, ".phasedev", "specs")})`);
    expect(output).toContain(`Target project root for repository evidence: \`${testTmpDir}\``);
    expect(output).toContain("Run repository code, config, test, and runtime evidence searches under the active project root unless an explicit input path in this prompt points elsewhere.");
    expect(output).toContain("Retrieval order: project instructions and package/test metadata, then code/config/tests/runtime wiring directly tied to the PRD targets");
    expect(output).toContain("Context budget: use 2-4 broad file listings/searches total as a soft cap, at most one per target area");
    expect(output).not.toContain("Context budget: use a small bounded number of broad file listings/searches");
    expect(output).not.toContain("Context budget: use at most one broad file listing/search to map candidate areas");
    expect(output).toContain("Stop condition: stop reading once every `Intent` field, `R#`, `SC#`, evidence type, and risk boundary can be recorded");
    expect(output).toContain("Current code lacking the target behavior is usually a `limited` or `blocked` current-state fact");
    expect(output).toContain("Put affected modules, public interfaces, dependencies, existing contracts, constraints, and similar existing solutions in the `Fact` text");
    expect(output).toContain("Every table cell must be non-empty, including Notes.");
    expect(output).toContain("Source Facts Supports must use R#/SC#; do not use none/not_applicable.");
    expect(output).toContain("Replace every embedded template example row and example value with real phase-specific content.");
    expect(output).toContain("The final artifact must not contain these embedded template sample values: `Requested target from PRD.`, `Requested risk boundary from PRD.`, `Current implementation partially supports the requested target; F1 records what exists and what does not yet fully support the target.`, `Current tests or configuration partially cover this boundary; F2 records current enforcement gaps without claiming target completion.`, `src/file.ts:42`, `test/file.test.ts:12`, `.phasedev/specs/foo/spec.md:12`, `Current implementation does X.`, `Tests verify behavior X.`, `Existing spec describes capability Y.`.");
    expect(output).not.toContain("Preserve YAML frontmatter keys exactly; change only allowed values.");
    expect(output).toContain("Artifact self-check");
    expect(output.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(output).toContain("--project-path");
    expect(output).toContain("If the `phasedev` executable is unavailable, look once for a controller-provided or local equivalent that runs the same `check");
    expect(output).not.toContain("--expect-route");
    expect(output).toContain("If no equivalent is available, or the same non-actionable validator failure repeats after one concrete artifact fix and rerun, stop and report a blocker with the exact command and output.");
    expect(output).toContain("Report `Research ready` only after this self-check passes.");
    expect(output).toContain("Success final response is allowed only after the self-check passes. It must use this compact template and include no extra sections");
    expect(output).toContain("The only exception is unavailable self-check after the documented command lookup.");
    expect(output).toContain("do not use the `Research ready` template and add no extra sections");
    expect(output).toContain("final response must be exactly one short plain blocker sentence or one compact line such as `Blocked: self-check unavailable (<exact command failure>)`");
    expect(output).toContain("Research ready:");
    expect(output).toContain("Route: design");
    expect(output).toContain("Next: phasedev phase");
    expectSubstringsInOrder(output, [
      "Phase 2. Code Research.",
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
      "Phase completion:",
      "Success final response is allowed only after the self-check passes",
      "Research ready:",
      "The only exception is unavailable self-check after the documented command lookup"
    ]);

    cleanupTestDir();
    changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");

    output = runNext();
    expect(output).toContain("Phase 3. Technical Design.");
    expect(output).toContain("Artifact Build Contract: architecture/design.md");
    expect(output).toContain("# Design");
    expect(output).toContain("## Architecture Package Map");
    expect(output).toContain("immediately validate the new design artifact");
    expect(output).toContain("--project-path");

    writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), true);

    output = runNext();
    expect(output).toContain("Phase 4. Iteration Planning.");
    expect(output).toContain("Artifact Build Contract: iteration_plan.md");
    expect(output).toContain("# Implementation Plan");
    expect(output.match(/`- \[ \] <iteration>\.<task> Task description`/g) ?? []).toHaveLength(1);
    expect(output).toContain("Artifact self-check");
    expect(output.match(/Self-check command:/g) ?? []).toHaveLength(0);
    expect(output).toContain("--project-path");
    expect(output).toContain("Use this bounded retrieval order before planning");
    expect(output).toContain("If any required input is missing or unreadable, report `Missing required input artifact: <exact linked path>` and stop without creating or partially writing `iteration_plan.md`.");
    expect(output).toContain("Verify that `prd.md` and `design.md` have `approved: true`");
    expect(output).toContain("Context budget and stop condition:");
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
    expect(output).toContain("Use the test command already listed in `execution_contract.md` for the matching evidence type");
    expect(output).toContain("Examples of required planning blockers:");
    expect(output).toContain("Approved PRD and approved design disagree about a public contract");
    expect(output).toContain("If the missing answer would change what the user is approving");
    expect(output).toContain("Do not use emoji in `iteration_plan.md`");
    expect(output).toContain("If the `phasedev` executable is unavailable, look once for a controller-provided or local equivalent that runs the same `check");
    expect(output).toContain("`bun run src/cli.ts check --project-path ...` when package/source entrypoint evidence supports it");
    expect(output).toContain("Success final response is allowed only after the self-check passes. It must use this compact template and include no extra sections");
    expect(output).toContain("Plan ready: iteration_plan.md");
    expect(output).toContain("Plan path:");
    expect(output).toContain("Self-check: <exact command> -> <result>");
    expect(output).toContain("Skill compliance: none configured.");
    expect(output).toContain("Next: review iteration_plan.md, set approved: true and approved_by: \"<your name>\" only if accepted, then run phasedev advance.");
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
    const phasePlanLink = phaseValidationPrompt.match(/\[iteration_plan\.md\]\((file:\/\/[^)]+)\)/)?.[1];
    const phaseFindingsLink = phaseValidationPrompt.match(/\[validation_findings\.md\]\((file:\/\/[^)]+)\)/)?.[1];
    const phaseOutputPath = phaseValidationPrompt.match(/- Output path: `([^`]+validation_findings\.md)`/)?.[1];
    const phaseCheckProjectPath = phaseValidationPrompt.match(/phasedev check-validation --project-path "([^"]+)" --scope iteration --iteration-id 1/)?.[1];
    const finalOutputPath = finalValidationPrompt.match(/- Output path: `([^`]+validation_findings\.md)`/)?.[1];
    const finalCheckProjectPath = finalValidationPrompt.match(/phasedev check-validation --project-path "([^"]+)" --scope final/)?.[1];
    const repairOutputPath = repairPrompt.match(/- Output path: `([^`]+validation_findings\.md)`/)?.[1];
    const repairCheckProjectPath = repairPrompt.match(/phasedev check --project-path "([^"]+)"/)?.[1];

    expect(planPrompt).toContain(path.join(outDir, "artifact-snapshots", "04-stage-3-plan", ".phasedev", "changes", "generated-agent-prompts", "iteration_plan.md"));
    expect(planPrompt).toContain("Examples of acceptable conservative planning assumptions:");
    expect(planPrompt).toContain("Examples of required planning blockers:");
    expect(planPrompt).toContain("Success final response is allowed only after the self-check passes.");
    expect(planPrompt).toContain("For any blocker stop, do not use the `Plan ready` template and do not add extra sections.");
    expect(implementationPrompt).toContain("Ordered workflow:");
    expect(implementationPrompt).toContain("use the embedded full-plan orientation and current iteration excerpt below as the implementation-plan read surface");
    expect(implementationPrompt).toContain("Full-plan orientation:");
    expect(implementationPrompt).toContain("Read this phase prompt, the embedded full-plan orientation, and the embedded current iteration excerpt first");
    expect(implementationPrompt).toContain("open the full [iteration_plan.md]");
    expect(implementationPrompt).toContain("only when patching current-iteration task checkboxes or `Check Evidence`, or when the embedded orientation/excerpt is missing or contradictory");
    expect(implementationPrompt).toContain("Use the full-plan orientation to understand sequence, dependencies, completed prior work, and future boundaries");
    expect(implementationPrompt).toContain("do not implement future-iteration tasks from the orientation alone");
    expect(implementationPrompt).toContain("retrieve only the rows or sections referenced by current-iteration `R#`, `SC#`, `D#`, checks, and risk boundaries");
    expect(implementationPrompt).toContain("Inspect repository files only after the current iteration scope is understood, and only files or narrow searches needed by the current iteration `Expected Change Surface`.");
    expect(implementationPrompt).not.toContain("Read this stage prompt, then the linked artifacts in this order");
    expect(implementationPrompt).not.toContain("Treat the linked artifacts and current iteration excerpt as the first retrieval layer.");
    expect(implementationPrompt).toContain("Context budget and stop condition:");
    expect(implementationPrompt).toContain("Treat the embedded full-plan orientation plus current iteration excerpt as the primary retrieval layer");
    expect(implementationPrompt).toContain("Keep future iterations as boundary context only");
    expect(implementationPrompt).toContain("Stop retrieval when every current-iteration task, related `R#`, related `SC#`, check row, and applicable risk boundary has enough evidence to implement and verify.");
    expect(planPrompt).toContain("Phase 4. Iteration Planning.");
    expect(phaseValidationPrompt).toContain("Skill compliance: none configured.");
    expect(implementationPrompt).toContain("Skill compliance: none configured.");
    expect(implementationPrompt).toContain("if an approved plan/design gap materially prevents safe current-iteration completion or verification for a required `Target state`, `R#`, `SC#`, `Evidence` type, or risk boundary");
    expect(implementationPrompt).toContain("if a plan/design gap does not materially prevent safe completion or verification of the current iteration inside the approved surface, record it as a remaining risk instead of blocking");
    expect(implementationPrompt).toContain("do not block on PRD/design coverage gaps outside the current iteration boundary");
    expect(implementationPrompt).toContain("use only these `Result` values in `Check Evidence`: `pending`, `passed`, `failed`, `blocked`, `not_applicable`");
    expect(implementationPrompt).toContain("if checks fail and the failure is causally related to the current iteration change set, fix only inside the approved current-iteration surface and repeat the affected checks");
    expect(implementationPrompt).toContain("if a check failure is unrelated to the current iteration, external/environmental, or outside the approved surface, do not repair outside scope");
    expect(implementationPrompt).toContain("if the controller self-check command, binary, or environment is unavailable, record the exact command and error class, keep the iteration heading `[~]`");
    expect(implementationPrompt).toContain("do not substitute a different route check");
    expect(implementationPrompt).toContain("--project-path");
    expect(implementationPrompt).toContain("Final response is allowed only after the self-check passes or the current iteration is honestly recorded as `blocked`.");
    expect(implementationPrompt).toContain("Implementation ready: Iteration 1: Prompt Generation");
    expect(implementationPrompt).not.toContain("{{artifact_build_contract}}");
    expect(phaseValidationPrompt).toContain("Retrieval order:");
    expect(phaseValidationPrompt).toContain("If only a generated prompt bundle is being evaluated and its linked sandbox files are unavailable, use the embedded artifact contract and current phase label in this prompt");
    expect(phaseValidationPrompt).toContain("Context budget and stop condition:");
    expect(phaseValidationPrompt).toContain("git diff --name-status -- .");
    expect(phaseValidationPrompt).toContain("Determine the single project root from this prompt context");
    expect(phaseValidationPrompt).toContain("Run `git status --short --untracked-files=all -- .` and `git diff --name-status -- .` from that root");
    expect(phaseValidationPrompt).toContain("including, where applicable to changed files, user/input handling");
    expect(phaseValidationPrompt).toContain("proceed with filesystem reads as fallback");
    expect(phaseValidationPrompt).toContain("Preserve every existing finding row, including `resolved` rows");
    expect(phaseValidationPrompt).toContain("Allocate new IDs by reading all existing `F<number>` IDs and using the next highest number");
    expect(phaseValidationPrompt).toContain("verdict: <set_after_review>");
    expect(phaseValidationPrompt).not.toContain("verdict: ready\ntype: iteration\ndate:");
    expect(phaseOutputPath).toBe(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(phaseCheckProjectPath).toBe(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation"));
    expect(phasePlanLink).toBeTruthy();
    const phasePlanPath = phasePlanLink!.replace(/^file:\/\//, "");
    expect(phasePlanPath).toContain(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation"));
    const phasePlanSnapshot = fs.readFileSync(phasePlanPath, "utf-8");
    expect(phasePlanSnapshot).toContain("## Iteration 1: Prompt Generation [~]");
    expect(phasePlanSnapshot).not.toContain("## Iteration 1: Prompt Generation [x]");
    expect(phaseFindingsLink).toBeTruthy();
    const phaseFindingsPath = phaseFindingsLink!.replace(/^file:\/\//, "");
    expect(phaseFindingsPath).toContain(path.join(outDir, "artifact-snapshots", "06-stage-5a-phase-validation"));
    if (fs.existsSync(phaseFindingsPath)) {
      expect(fs.readFileSync(phaseFindingsPath, "utf-8")).toContain("type: iteration");
      expect(fs.readFileSync(phaseFindingsPath, "utf-8")).not.toContain("type: final");
    }
    expect(phaseValidationPrompt).not.toContain(path.join(outDir, "artifact-snapshots", "07-stage-5b-final-validation"));
    expect(phaseValidationPrompt).not.toContain(`file://${path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "iteration_plan.md")}`);
    expect(phaseValidationPrompt).not.toContain(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalValidationPrompt).toContain("Phase 6B. Final Validation.");
    expect(finalValidationPrompt).toContain("Retrieval order:");
    expect(finalValidationPrompt).toContain("Start from the approved PRD target state, requirements, success criteria, and risk boundaries");
    expect(finalValidationPrompt).toContain("scope = full change");
    expect(finalValidationPrompt).toContain("Read linked flow artifacts in this order: `prd.md`, `architecture/design.md`, `iteration_plan.md` all iterations");
    expect(finalValidationPrompt).toContain("Build the validation scope from the full approved PRD `Intent`, every `R#`, every `SC#`");
    expect(finalValidationPrompt).toContain("Inspect every changed production/source/config/test file in the full change set");
    expect(finalValidationPrompt).toContain("Declarative Check Evidence such as `passed` without these details is weak evidence, not an automatic blocker");
    expect(finalValidationPrompt).toContain("do not force `repair_required`");
    expect(finalValidationPrompt).toContain("run the `full` gate command from `execution_contract.md` exactly once");
    expect(finalValidationPrompt).toContain("`verdict: ready` or `verdict: ready_with_risks` is allowed only when the full gate run passed");
    expect(finalValidationPrompt).toContain("Final Validation does not mark iterations as `[x]`");
    expect(finalValidationPrompt).toContain("type: final");
    expect(finalValidationPrompt).toContain("verdict must be exactly one of: ready, ready_with_risks, repair_required.");
    expect(finalValidationPrompt).not.toContain("verdict must be exactly one of: ready, ready_with_risks, repair_required, repaired.");
    expect(finalValidationPrompt).not.toContain("- repaired: use only in Repair Loop after actual blocking findings are resolved");
    expect(finalValidationPrompt).toContain("phasedev check-validation --project-path");
    expect(finalValidationPrompt).toContain("--scope final");
    expect(finalValidationPrompt).toContain("snapshot Output paths and snapshot self-check project paths are fixture paths for bundle self-check coherence");
    expect(finalValidationPrompt).toContain("during live `phasedev phase`, use the active change folder and Output path provided by the live prompt instead");
    expect(finalOutputPath).toBe(path.join(outDir, "artifact-snapshots", "07-stage-5b-final-validation", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalCheckProjectPath).toBe(path.join(outDir, "artifact-snapshots", "07-stage-5b-final-validation"));
    expect(finalOutputPath).toBe(path.join(finalCheckProjectPath!, ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalValidationPrompt).not.toContain(`phasedev check-validation --project-path "${path.join(outDir, "sandbox-project")}" --scope final`);
    expect(finalValidationPrompt).not.toContain(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"));
    expect(finalValidationPrompt).not.toContain("Read linked flow artifacts in this order: `iteration_plan.md` current iteration");
    expect(finalValidationPrompt).not.toContain("Build the validation scope from the current iteration `Goal`");
    expect(finalValidationPrompt).not.toContain("Inspect every changed production/source/config/test file tied to the current iteration");
    expect(finalValidationPrompt).not.toContain("current-iteration artifacts, current-iteration changed files");
    expect(repairPrompt).toContain("Phase 6R. Finding Repair.");
    expect(repairPrompt).toContain("Ordered workflow:");
    expect(repairPrompt).toContain("Read the Current Repair Queue, then open the full findings registry only to preserve/update rows");
    expect(repairPrompt).toContain("Context budget and stop condition:");
    expect(repairPrompt).toContain("Stop retrieval when every queued finding ID has a concrete repair target");
    expect(repairPrompt).toContain("preserve all existing registry rows that are not in the current blocking queue");
    expect(repairPrompt).toContain("if a requirements/design detail is ambiguous but does not change approval scope");
    expect(repairPrompt).toContain("Repair class map:");
    expect(repairPrompt).toContain("`implementation`: change affected production/source/config/test files inside the current approved design and plan");
    expect(repairPrompt).toContain("`test`: change the affected tests, test fixtures, or test command evidence");
    expect(repairPrompt).toContain("`plan`: update [iteration_plan.md]");
    expect(repairPrompt).toContain("`design`: update [design.md]");
    expect(repairPrompt).toContain("`requirements`: stop for user discussion before material approval-scope changes");
    expect(repairPrompt).toContain("`validation`: repair validation evidence, registry row accuracy, or Check Evidence consistency");
    expect(repairPrompt).toContain("`security`: change affected source/config/tests needed to remove the security blocker");
    expect(repairPrompt).toContain("`code_review`: change the exact files or active change artifacts identified by the review finding");
    expect(repairPrompt).toContain("do not set `ready` or `ready_with_risks` during the Repair Loop phase");
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
    expect(fs.existsSync(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "iteration_plan.md"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "sandbox-project", ".phasedev", "changes", "generated-agent-prompts", "validation_findings.md"))).toBe(true);
    expect(manifest[0].sourceProjectPath).toBe(testTmpDir);
    expect(manifest[0].workingProjectPath).toBe(path.join(outDir, "sandbox-project"));
  });

  test("check reports invalid fresh PRD without rendering the next prompt", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n\n## Intent\n", false);
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody(), false);
    writeStateJson(changeDir, "change_intake");

    const result = runCheck([]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED");
    expect(result.output).toContain("Intent field `Change type` must be present and non-empty.");
  });

  test("check passes valid setup artifacts", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody(), false);
    writeStateJson(changeDir, "change_intake");

    const result = runCheck([]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CHECK] OK");
  });

  test("manual next does not auto-approve setup artifacts when loop autoApprove is enabled", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody(), false);
    const configPath = writeConfig(`
autoApprove: true
`);

    const output = runNext(["--config", configPath]);

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Setup incomplete");
    expect(fs.readFileSync(path.join(changeDir, "prd.md"), "utf-8")).toContain("approved: false");
  });

  test("check validates specific phase via --phase flag", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody(), false);
    writeStateJson(changeDir, "change_intake");

    const result = runCheck([]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CHECK] OK");
  });

  test("check rejects unknown phase via --phase flag", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    writeStateJson(changeDir, "change_intake");

    const result = runCheck(["--phase", "nonsense"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED");
    expect(result.output).toContain("Unknown phase");
  });

  test("check does not load config for per-phase validation", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), validPrdBody(), false);
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody(), false);
    writeStateJson(changeDir, "change_intake");
    writeConfig("phases: [");

    const result = runCheck([]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CHECK] OK");
  });

  test("check reports invalid design issues", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeArtifact(path.join(changeDir, "architecture", "design.md"), "# Design\n\n## Executive Summary\n", false);
    writeStateJson(changeDir, "technical_design");

    const result = runCheck([]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED");
  });

  test("check passes valid design", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());
    fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
    writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody(), false);
    writeStateJson(changeDir, "technical_design");

    const result = runCheck([]);

    // Design fixture matches the schema sections (fixed with proper heading names)
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CHECK] OK");
  });

  test("check fails when archive state is malformed", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), "not json", "utf-8");
    fs.writeFileSync(path.join(archiveDir, "state.json"), JSON.stringify({ activePhase: "archive", activeIteration: null }, null, 2) + "\n", "utf-8");

    const result = runCheck([]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED");
  });

  test("check --check-orphans passes when no archive directories exist", () => {
    const result = runCheck(["--check-orphans"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV ARCHIVE ORPHAN CHECK] OK");
  });

  test("check --check-orphans reports directories missing archive state", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-orphan-change");
    fs.mkdirSync(archiveDir, { recursive: true });

    const result = runCheck(["--check-orphans"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV ARCHIVE ORPHAN CHECK] FOUND");
    expect(result.output).toContain("no archive state");
  });

  test("check --check-orphans reports in-progress archives", () => {
    writeCompletedArchive("done-change");
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-stuck-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), JSON.stringify({
      status: "in_progress",
      changeName: "stuck-change",
      archivePath: archiveDir,
      startedAt: "2026-05-29T10:00:00.000Z"
    }, null, 2), "utf-8");

    const result = runCheck(["--check-orphans"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV ARCHIVE ORPHAN CHECK] FOUND");
    expect(result.output).toContain("still in_progress");
    expect(result.output).not.toContain("done-change");
  });

  test("check-validation final fails when findings type is phase", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "iteration")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] FAILED: final");
    expect(result.output).toContain("YAML field `type` must be `final` for Final Validation.");
  });

  test("check-validation final passes when ready findings route to archive_ready", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
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

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Final Validation declared ready, but route is archive_readiness_blocked.");
  });

  test("check-validation final fails when ready findings leave blocked evidence before archive", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | blocked | command unavailable | retry later |
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

## Iteration 1: API [x]
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

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repaired", "final", "| F1 | resolved | MUST-FIX | validation | Final | Review coverage was incomplete. | Keep final validation coverage complete. |\n")
    });

    const result = runCheckValidation(["--scope", "final"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("`verdict: repaired` is not valid for Final Validation phase output.");
  });

  test("check-validation phase fails when ready findings leave the phase incomplete", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "iteration")
    });

    const result = runCheckValidation(["--scope", "iteration", "--iteration-id", "1"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("`verdict: ready` is valid only after Iteration 1 is marked [x].");
  });

  test("check-validation phase passes when ready findings completed the phase", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("ready", "iteration")
    });

    const result = runCheckValidation(["--scope", "iteration", "--iteration-id", "1"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] OK: iteration validation is complete.");
  });

  test("check-validation phase fails when ready findings leave required check evidence stale", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- phase: \`bun test phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test unit\` | passed | unit passed | wrong command |

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("ready", "iteration")
    });

    const result = runCheckValidation(["--scope", "iteration", "--iteration-id", "1"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("required check evidence is missing or stale: phase: bun test phase");
  });

  test("check-validation phase passes when repair_required findings route to repair", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", "| F1 | open | MUST-FIX | validation | Phase 1 | Review coverage incomplete. | Complete phase validation coverage. |\n")
    });

    const result = runCheckValidation(["--scope", "iteration", "--iteration-id", "1"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV VALIDATION CHECK] OK: iteration validation is complete.");
  });

  test("check-validation phase rejects repaired verdict", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repaired", "iteration", "| F1 | resolved | MUST-FIX | validation | Phase 1 | Review coverage was incomplete. | Keep phase validation coverage complete. |\n")
    });

    const result = runCheckValidation(["--scope", "iteration", "--iteration-id", "1"]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("`verdict: repaired` is not valid for Iteration Validation phase output.");
  });

  test("check fails when archive state is malformed", () => {
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), "{ malformed json", "utf-8");
    writeStateJson(archiveDir, "archive");

    const result = runCheck();

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED");
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

  test("check-archive accepts a completed archive whose stored archivePath is stale after a project move", () => {
    const archiveDir = writeCompletedArchive();
    const statePath = path.join(archiveDir, ".phase-archive.json");
    const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    state.archivePath = "/old/location/that/no/longer/exists";
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");

    const result = runCheckArchive(["--archive-path", archiveDir]);

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("archivePath must match");
  });

  test("check-archive fails when archive path or state is invalid", () => {
    const missingPath = runCheckArchive([]);
    expect(missingPath.exitCode).toBe(1);
    expect(missingPath.output).toContain("check-archive requires --archive-path <path>.");

    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-05-29-sample-change");
    fs.mkdirSync(archiveDir, { recursive: true });

    const missingState = runCheckArchive(["--archive-path", archiveDir]);
    expect(missingState.exitCode).toBe(1);
    expect(missingState.output).toContain(".phase-archive.json is missing.");

    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), "{ malformed json", "utf-8");
    const malformedState = runCheckArchive(["--archive-path", archiveDir]);
    expect(malformedState.exitCode).toBe(1);
    expect(malformedState.output).toContain(".phase-archive.json is not valid JSON");
  });

  test("check-archive fails when completed state is incomplete", () => {
    const archiveDir = writeCompletedArchive();
    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), JSON.stringify({
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

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Phase 6A. Iteration Validation.");
    expect(output).toContain("Current iteration:\nIteration 1: API");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("Check Evidence");
    expect(output).toContain("do not rerun tests or additional checks");
    expect(output).not.toContain("run project test suite");
  });

  test("blocks when more than one phase is in progress", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [~]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid iteration plan");
    expect(output).toContain("Only one iteration may have [~] status at a time; active iterations: Iteration 1: API, Iteration 2: UI.");
    expect(output).toContain("Iteration 1: API");
    expect(output).toContain("Iteration 2: UI");
    expect(output).not.toContain("Phase 5. Implementation.");
    expect(output).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("blocks approved plan with no recognized phases before final validation", () => {
    setupChange(`
# Plan

No iteration headings yet.
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid iteration plan");
    expect(output).toContain("iteration_plan.md must contain at least one iteration heading. Use exactly `## Iteration <number>: <name> [ ]`, `## Iteration <number>: <name> [~]`, or `## Iteration <number>: <name> [x]`.");
    expect(output).not.toContain("Phase 6B. Final Validation.");
  });

  test("check reports canonical iteration heading syntax for malformed plan headings", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API
- [ ] 1.1 Implement endpoint
`);
    writeStateJson(changeDir, "iteration_planning");

    const result = runCheck([]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV CHECK] FAILED");
  });

  test("blocks phase without tasks before implementation", () => {
    setupChange(`
# Plan

## Iteration 1: Empty Phase [ ]
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid iteration plan");
    expect(output).toContain("Iteration 1: Empty Phase must contain at least one task checkbox.");
    expect(output).not.toContain("Phase 5. Implementation.");
  });

  test("blocks duplicate and non-sequential phase numbers", () => {
    setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint

## Iteration 1: UI [ ]
- [ ] 2.1 Build page

## Iteration 3: Docs [ ]
- [ ] 3.1 Update docs
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid iteration plan");
    expect(output).toContain("Iteration numbers must be unique; duplicate iteration id(s): 1.");
    expect(output).toContain("Iteration numbers must be sequential starting at 1.");
    expect(output).not.toContain("Phase 5. Implementation.");
  });

  test("blocks completed phase that still contains incomplete tasks", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
- [ ] 1.2 Add tests
`);

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid iteration plan");
    expect(output).toContain("Iteration 1: API is [x] but contains incomplete tasks.");
    expect(output).not.toContain("Phase 6B. Final Validation.");
  });

  test("single-phase plan sends completed in-progress phase to phase validation", () => {
    setupChange(`
# Plan

## Iteration 1: Complete Change [~]
- [x] 1.1 Implement change
`);

    const output = runNext();

    expect(output).toContain("Phase 6A. Iteration Validation.");
    expect(output).toContain("Current iteration:\nIteration 1: Complete Change");
    expect(output).not.toContain("Phase 6B. Final Validation.");
    expect(output).not.toContain("bun test phase");
    expect(output).toContain("do not rerun tests or additional checks");
    expect(output).toContain("## Controller Observed Changed Files");
    expect(output).toContain(`phasedev check-validation --project-path "${testTmpDir}" --scope iteration --iteration-id 1`);
    expect(output).not.toContain("check --project-path");
  });

  test("single-phase plan sends validated phase to final validation", () => {
    setupChange(`
# Plan

## Iteration 1: Complete Change [x]
- [x] 1.1 Implement change
`, {
      findings: validationFindings("ready", "iteration")
    });

    const output = runNext();

    expect(output).toContain("Phase 6B. Final Validation.");
    expect(output).not.toContain("Phase 6A. Iteration Validation.");
    expect(output).not.toContain("bun test full");
    expect(output).toContain("run the `full` gate command from `execution_contract.md` exactly once");
    expect(output).toContain("Intent");
    expect(output).toContain("Requirements");
    expect(output).toContain("Success Criteria");
    expect(output).toContain("## Controller Observed Changed Files");
    expect(output).toContain(`phasedev check-validation --project-path "${testTmpDir}" --scope final`);
  });

  test("repaired phase validation repeats phase validation for current in-progress phase", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      findings: validationFindings("repaired", "iteration", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("Phase 6A. Iteration Validation.");
    expect(output).toContain("Current iteration:\nIteration 1: API");
  });

  test("repaired final validation repeats final validation", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [x]
- [x] 2.1 Build page
`, {
      findings: validationFindings("repaired", "final", "| F1 | resolved | MUST-FIX | implementation | Final | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("Phase 6B. Final Validation.");
    expect(output).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("repair prompt includes compact queue instead of full findings registry", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("repair_required", "iteration", [
        "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |",
        "| F2 | open | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |"
      ].join("\n"))
    });

    const output = runNext();

    expect(output).toContain("Phase 6R. Finding Repair.");
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

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: `---
verdict: repair_required
type: iteration
date: 2026-05-28
---

No markdown finding table here.
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid validation_findings.md");
    expect(output).toContain("validation_findings.md must contain exactly one markdown table");
    expect(output).not.toContain("Phase 6R. Finding Repair.");
  });

  test("successful final validation routes to archive stage", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [x]
- [x] 2.1 Build page
`, {
      findings: validationFindings("ready", "final")
    });

    // The archive mutation is owned by advance; prompt resolution is read-only.
    startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);
    const output = runNext();
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Phase 7. Archive.");
    expect(output).toContain(`${archivedDir}/specs/<capability>/spec.md`);
    expect(output).toContain(`check-archive --archive-path ${archivedDir}`);
    expect(output).toContain("R# | Spec-level? | Capability | Operation | Target spec | Reason");
    expect(output).toContain(".phase-archive.json");
    expect(output).toContain(`archive path: \`${archivedDir}\``);
    expect(fs.existsSync(path.join(archivedDir, ".phase-archive.json"))).toBe(true);
    expect(fs.existsSync(path.join(testTmpDir, ".phasedev", "changes", "sample-change"))).toBe(false);
    expect(output).not.toContain("src/archive-change.ts");
    expect(output).not.toContain("[FLOW CONTROLLER] SUCCESS!");
    expect(output).not.toContain("Phase Evolution.");
  });

  test("pending archive state repeats archive prompt without active change", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);
    const first = runNext();
    const second = runNext();

    expect(first).toContain("Phase 7. Archive.");
    expect(second).toContain("Phase 7. Archive.");
    expect(second).toContain(".phase-archive.json");
    expect(second).not.toContain("Phase 1. Change Intake.");
  });

  test("final ready_with_risks without blocking findings routes to archive stage", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "final", "| F1 | open | RECOMMENDED | implementation | Final | Minor follow-up. | Track as follow-up. |\n")
    });

    startArchiveStage(testTmpDir, changeDir, new Date(), DEFAULT_CONFIG);
    const output = runNext();
    const today = new Date().toISOString().split("T")[0];
    const archivedDir = path.join(testTmpDir, ".phasedev", "changes", "archive", `${today}-sample-change`);

    expect(output).toContain("Phase 7. Archive.");
    expect(output).toContain("Do not use `validation_findings.md` as a source of requirements");
    expect(fs.existsSync(path.join(archivedDir, ".phase-archive.json"))).toBe(true);
  });

  test("final ready blocks archive if any phase is not completed", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready", "final")
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Archive readiness failed");
    expect(output).toContain("iteration_plan.md");
    expect(output).not.toContain("Phase 7. Archive.");
    expect(output).not.toContain("Phase 6B. Final Validation.");
  });

  test("final ready_with_risks with open blocking findings routes to repair instead of archive", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      findings: validationFindings("ready_with_risks", "final", "| F1 | open | MUST-FIX | implementation | Final | Broken final check. | Repair the final check. |\n")
    });

    const output = runNext();

    expect(output).toContain("Phase 6R. Finding Repair.");
    expect(output).toContain("| F1 | MUST-FIX | implementation | Final | Broken final check. | Repair the final check. |");
    expect(output).not.toContain("Phase 7. Archive.");
  });

  test("invalid execution contract with missing Constraints section blocks before rendering implementation prompts", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint
`, {
      rules: `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid execution_contract.md");
    expect(output).toContain("must contain section `## Constraints`");
    expect(output).not.toContain("run unit tests");
  });

  test("invalid execution contract with missing Verification Gates section blocks before phase validation prompt", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      rules: `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |

## Constraints
None.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid execution_contract.md");
    expect(output).toContain("must contain section `## Verification Gates`");
    expect(output).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("invalid execution contract with missing Environment Notes section blocks before final validation prompt", () => {
    setupChange(`
# Plan

## Iteration 1: API [x]
- [x] 1.1 Implement endpoint
`, {
      rules: `# Rules

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
`
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid execution_contract.md");
    expect(output).toContain("must contain section `## Environment Notes`");
    expect(output).not.toContain("Phase 6B. Final Validation.");
  });

  test("invalid plan blocks before plan approval prompt", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, {
      planApproved: false
    });
    fs.appendFileSync(path.join(changeDir, "iteration_plan.md"), "\n\n## Notes\nNot allowed before approval.\n", "utf-8");

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Invalid iteration plan");
    expect(output).toContain("iteration_plan.md contains unexpected section `## Notes`.");
    expect(output).not.toContain("[FLOW CONTROLLER] BLOCKED: Plan requires review");
  });

  test("approval gates block after repair resets an approved artifact", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
      designApproved: false,
      findings: validationFindings("repaired", "iteration", "| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |\n")
    });

    const output = runNext();

    expect(output).toContain("[FLOW CONTROLLER] BLOCKED: Design requires review");
    expect(output).toContain("architecture/design.md");
    expect(output).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("implementation prompt does not instruct agent to mark phase header completed", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint
`);

    const output = runNext();

    expect(output).toContain("Phase 5. Implementation.");
    expect(output).toContain("bun test unit");
    expect(output).toContain(`phasedev check --project-path "${testTmpDir}"`);
    expect(output).toContain("finish only when the controller self-check passes or the current iteration is honestly recorded as `blocked`");
    expect(output).toContain("do not mark the iteration heading `[x]` at this phase");
    expect(output).not.toContain("change the phase status in the plan heading from `[~]`");
    expect(output).not.toContain("mark the iteration heading as `[x]`");
    expect(output).not.toContain("run unit tests");
  });

  test("implementation prompt includes additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`
- Browser smoke for login flow

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Phase 5. Implementation.");
    expect(output).toContain("Current iteration from approved plan:");
    expect(output).toContain("Additional checks:");
    expect(output).toContain("bun test:e2e auth");
    expect(output).toContain("Browser smoke for login flow");
  });

  test("implementation prompt includes full current iteration excerpt and bounded full-plan orientation", () => {
    // [~] is set by advance (applyStateSideEffects) when entering the
    // iteration; prompt resolution is read-only and renders the plan as-is.
    setupChange(`
# Plan

## Iteration 1: API [~]
- [ ] 1.1 Implement endpoint

Checks:
- Endpoint handles not found responses.

Additional checks:
- \`bun test:e2e auth\`

Implementation note:
- Keep API contract unchanged.

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Current iteration from approved plan:");
    expect(output).toContain("Full-plan orientation:");
    expect(output).toContain("- Iteration 1: API [~] (current); tasks: 1.1; required checks: unit");
    expect(output).toContain("- Iteration 2: UI [ ] (orientation only); tasks: 2.1; required checks: unit");
    expect(output).toContain("Checks:");
    expect(output).toContain("Endpoint handles not found responses.");
    expect(output).toContain("Implementation note:");
    expect(output).toContain("Keep API contract unchanged.");
    expect(output).not.toContain("## Iteration 2: UI");
    expect(output).not.toContain("Build page");
  });

  test("implementation prompt resolution is read-only and renders the plan status as-is", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint

Checks:
- Endpoint handles not found responses.
`);

    const output = runNext();

    expect(output).toContain("Phase 5. Implementation.");
    expect(output).toContain("## Iteration 1: API [ ]");
    // Prompt resolution never mutates the plan; the [~] flip is advance's job.
    const planAfter = fs.readFileSync(path.join(changeDir, "iteration_plan.md"), "utf-8");
    expect(planAfter).toContain("## Iteration 1: API [ ]");
  });

  test("phase validation prompt does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`);

    const output = runNext();

    expect(output).toContain("Phase 6A. Iteration Validation.");
    expect(output).not.toContain("Additional checks for the current iteration from the plan:");
    expect(output).not.toContain("bun test:e2e auth");
    expect(output).not.toContain("additional checks are executed");
  });

  test("final validation does not include additional checks from implementation plan", () => {
    setupChange(`
# Plan

## Iteration 1: Complete Change [x]
- [x] 1.1 Implement change

Additional checks:
- \`bun test:e2e checkout\`
`);

    const output = runNext();

    expect(output).toContain("Phase 6B. Final Validation.");
    expect(output).not.toContain("Additional checks for the current single-iteration iteration");
    expect(output).not.toContain("bun test:e2e checkout");
    expect(output).not.toContain("applicable additional checks");
  });
});

describe("flow templates", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  const templateNames = [
    "phase1_change_intake.md",
    "phase2_code_research.md",
    "phase3_technical_design.md",
    "phase4_iteration_planning.md",
    "phase5_implementation.md",
    "phase6a_iteration_validation.md",
    "phase6b_final_validation.md",
    "phase6r_finding_repair.md",
    "phase7_archive.md"
  ];

  function readTemplate(name: string): string {
    return fs.readFileSync(path.resolve(__dirname, "..", "templates", name), "utf-8");
  }

  function readValidationTemplate(name: "phase6a_iteration_validation.md" | "phase6b_final_validation.md"): string {
    const stage = name === "phase6b_final_validation.md" ? "final_validation" : "iteration_validation";
    return readTemplate(name).replace("{{validation_common_contract}}", renderValidationCommonContract(stage, parseConfig(`stages: {}`)));
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
stages:
  change_intake:
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
    const setupPolicy = renderSkillPolicy("change_intake", config);
    const researchPolicy = renderSkillPolicy("code_research", parseConfig(`
stages:
  code_research:
    skills:
      routers:
        - using-ecc
      main: []
      additional: []
`));

    expect(setupPolicy).toContain("router skills such as `using-ecc` may classify the task");
    expect(setupPolicy).toContain("do not authorize reading framework source, framework templates, config files");
    expect(setupPolicy).toContain("For setup, for each configured router, configured main, and router-selected skill that does not fit the available post-intake evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section.");
    expect(setupPolicy).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(researchPolicy).toContain("For each configured router, configured main, and router-selected skill that does not fit the phase evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section.");
    expect(researchPolicy).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(implementationPolicy).toContain("Allowed skills:");
    expect(implementationPolicy).toContain("Priority 1 - Routers:");
    expect(implementationPolicy).toContain("- `using-zuvo`");
    expect(implementationPolicy).toContain("- `dev-core`");
    expect(implementationPolicy).toContain("- `security-and-hardening`");
    expect(implementationPolicy).not.toContain("Router-selected:");
    expect(implementationPolicy).not.toContain("determined after reading routers");
    expect(implementationPolicy).toContain("Read Priority 1 router skills first (they may select execution-method skills); then evaluate configured `main` and router-selected skills against phase evidence. `additional` skills are optional unless routers/main are insufficient.");
    expect(implementationPolicy).toContain("Native skill reports, headings, and output formats are not Flow artifact structure; adapt useful output into the current PhaseDev artifact template, final response, or blocker.");
    expect(implementationPolicy).toContain("When a router-selected skill and a main skill conflict on the same evidence, the router-selected skill takes priority and the main skill reports as NOT_APPLICABLE(superseded by <skill>) only for the superseded evidence.");
    expect(implementationPolicy).not.toContain("Priority 1: read listed router skills first when they are available and applicable to the phase evidence.");
    expect(implementationPolicy).toContain("Priority 1: after reading this phase prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select execution-method skills; then fully execute router-selected or main skills that apply to the phase evidence, and use additional skills only when their evidence-specific condition is met.");
    expect(implementationPolicy).toContain("Router-selected skills follow the same mandatory execution contract as main skills.");
    expect(implementationPolicy).toContain("Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.");
    expect(implementationPolicy).toContain("For each configured router, configured main, and router-selected skill that does not fit the phase evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section.");
    expect(implementationPolicy).not.toContain("If none fits, stop and ask the user to update `config.yaml` or approve an exception.");
    expect(validationPolicy).toContain("Allowed skills:");
    expect(validationPolicy).toContain("- `performance-audit`");
    expect(validationPolicy).toContain("Apply only read-only review/audit/static-inspection skill methods");
    expect(validationPolicy).toContain("Skills are method instructions only; they never control Flow state");
  });

  test("stage templates preserve executable artifact allowlists", () => {
    const expectations: Array<[string, string[]]> = [
      ["phase1_change_intake.md", ["`prd.md`", "`execution_contract.md`"]],
      ["phase2_code_research.md", ["`research_facts.md`"]],
      ["phase3_technical_design.md", ["active change folder `architecture/design.md`", "linked files inside the active change folder `architecture/`"]],
      ["phase4_iteration_planning.md", ["`iteration_plan.md`"]],
      ["phase5_implementation.md", ["production/test code", "`iteration_plan.md`"]],
      ["phase6a_iteration_validation.md", ["`validation_findings.md`", "`iteration_plan.md`"]],
      ["phase6b_final_validation.md", ["`validation_findings.md`"]],
      ["phase6r_finding_repair.md", ["affected production/test code", "`validation_findings.md`"]],
      ["phase7_archive.md", ["Delta specs", "`.phasedev/specs`"]]
    ];

    for (const [templateName, fragments] of expectations) {
      const template = readTemplate(templateName);
      expect(template).toContain("Allowed persistent artifacts for this phase");
      for (const fragment of fragments) {
        expect(template).toContain(fragment);
      }
    }
  });

  test("artifact templates keep machine-readable flow contracts", () => {
    const prdTemplate = readTemplate("artifacts/prd.md");
    const planTemplate = readTemplate("artifacts/iteration_plan.md");
    const findingsTemplate = readTemplate("artifacts/validation_findings.md");

    const prdSections = Array.from(prdTemplate.matchAll(/^##\s+(.+)$/gm)).map(match => match[1]);
    expect(prdSections).toEqual(["Intent", "Requirements", "Success Criteria"]);
    expect(planTemplate).toContain("Iteration status contract:");
    expect(planTemplate).toContain("Check Evidence contract:");
    expect(planTemplate).toContain("| Area / Path Pattern | Change Type | Ownership | Trace |");
    expect(findingsTemplate).toContain("verdict: <set_after_review>");
    expect(findingsTemplate).toContain("Replace `<set_after_review>` with the verdict selected after evidence review");
    expect(findingsTemplate).toContain("repair_required: use when at least one open/reopened MUST-FIX finding exists.");
    expect(findingsTemplate).toContain("Security rows must always use Severity: MUST-FIX, including resolved rows.");
    expect(findingsTemplate).toContain("type: {{artifact_type}}");
    expect(findingsTemplate).toContain("| ID | Status | Severity | Class | Iteration | Finding | Required Fix |");
  });

  test("validation templates preserve registry scope markers", () => {
    const phaseTemplate = readValidationTemplate("phase6a_iteration_validation.md");
    const finalTemplate = readValidationTemplate("phase6b_final_validation.md");

    expect(finalTemplate).not.toContain("template default `type: iteration`");
    expect(phaseTemplate).toContain("Build the validation scope from the current iteration `Goal`");
    expect(finalTemplate).toContain("Build the validation scope from the full approved PRD `Intent`");
    expect(finalTemplate).not.toContain("Read linked flow artifacts in this order: `iteration_plan.md` current iteration");
    expect(finalTemplate).not.toContain("Inspect every changed production/source/config/test file tied to the current iteration");
    for (const template of [phaseTemplate, finalTemplate]) {
      expect(template).toContain("Structure, column set, allowed values, and verdict/type — only from the embedded Artifact Build Contract");
      expect(template).toContain("Class = security` and `Severity = MUST-FIX");
      expect(template).not.toContain("| ID | Status | Class | Blocks PR? | Phase | Description |");
      expect(template).not.toContain("Blocks PR?");
    }
  });

  test("archive prompt keeps archive state and delta spec inputs", () => {
    const archiveTemplate = readTemplate("phase7_archive.md");

    expect(archiveTemplate).toContain("[prd.md]({{prd_path}})");
    expect(archiveTemplate).toContain("[execution_contract.md]({{rules_path}})");
    expect(archiveTemplate).toContain("[research_facts.md]({{research_path}})");
    expect(archiveTemplate).toContain("[architecture/design.md]({{design_path}})");
    expect(archiveTemplate).toContain("[iteration_plan.md]({{plan_path}})");
    expect(archiveTemplate).toContain("{{archive_path}}/specs/<capability>/spec.md");
    expect(archiveTemplate).toContain("{{archive_state_path}}");
    expect(archiveTemplate).toContain("status: \"completed\"");
    expect(archiveTemplate).not.toContain("{{archive_command}}");
  });

  test("template renderer rejects unresolved placeholders", () => {
    const templatesDir = path.resolve(__dirname, "..", "templates");
    const tempTemplateName = "__test_unresolved_placeholders";
    const tempTemplatePath = path.join(templatesDir, `${tempTemplateName}.md`);
    fs.writeFileSync(tempTemplatePath, "Incident: {{incident}}\nScope: {{change_scope}}\nTests: {{test_scope}}\n", "utf-8");

    try {
      expect(() => renderTemplate(tempTemplateName, {})).toThrow("unresolved placeholder(s): incident, change_scope, test_scope");
    } finally {
      fs.unlinkSync(tempTemplatePath);
    }
  });

  test("template renderer does not re-expand a placeholder found inside another variable's value", () => {
    const templatesDir = path.resolve(__dirname, "..", "templates");
    const tempTemplateName = "__test_second_order_placeholder";
    const tempTemplatePath = path.join(templatesDir, `${tempTemplateName}.md`);
    fs.writeFileSync(tempTemplatePath, "Name: {{name}}\n", "utf-8");

    try {
      // Substitution runs once, against the original template text. A
      // "{{secret}}"-shaped snippet arriving through another variable's value
      // must stay a literal: never re-expanded into TOP_SECRET, and never
      // treated as an unresolved placeholder (legitimate artifact content may
      // contain mustache snippets).
      const rendered = renderTemplate(tempTemplateName, { name: "attacker {{secret}}", secret: "TOP_SECRET" });
      expect(rendered).toBe("Name: attacker {{secret}}\n");
      expect(rendered).not.toContain("TOP_SECRET");
    } finally {
      fs.rmSync(tempTemplatePath, { force: true });
    }
  });

  describe("config command deprecation", () => {
    test("getConfigValue maps codex.stages.setup.skills.main to stages.change_intake.skills.main with deprecation hint", () => {
      const config = parseConfig(`
stages:
  change_intake:
    skills:
      main: ["test-skill"]
`);
      const value = getConfigValue(config, "codex.stages.setup.skills.main");
      expect(value).toEqual(["test-skill"]);
    });

    test("getConfigValue returns root values for runArchiveStage", () => {
      const config = parseConfig(`
runArchiveStage: false
`);
      expect(getConfigValue(config, "runArchiveStage")).toBe(false);
    });

    test("getConfigValue returns undefined for nonexistent key", () => {
      const config = parseConfig(`{}`);
      expect(getConfigValue(config, "nonexistent.key")).toBeUndefined();
    });
  });

  test("default config defines stage skill routers instead of a separate skill router template", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "..", "config.yaml"), "utf-8");

    expect(fs.existsSync(path.resolve(__dirname, "..", "templates", "skill_router.md"))).toBe(false);
    expect(config).toContain("implementation:");
    expect(config).toContain("skills:");
    expect(config).toContain("iteration_validation:");
    expect(config).toContain("final_validation:");
    expect(config).toContain("archive:");
    expect(config).toContain("routers: []");
    expect(config).toContain("main: []");
    expect(config).toContain("additional: []");
  });
});

describe("new CLI commands", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  // --- version ---

  test("version prints package version", () => {
    const result = runCli(["version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("--version prints package version", () => {
    const result = runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("-V prints package version", () => {
    const result = runCli(["-V"]);
    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  // --- status ---

  test("status shows no active change when project is empty", () => {
    const result = runCli(["status", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Active Change: none");
  });

  test("status shows active change details", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "test-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());

    const result = runCli(["status", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Active Change: test-change");
    expect(result.output).toContain("Current Phase:");
    expect(result.output).toContain("Route:");
    expect(result.output).toContain("prd.md");
    expect(result.output).toContain("execution_contract.md");
  });

  // --- approve ---

  test("approve sets approved: true in file frontmatter", () => {
    const filePath = path.join(testTmpDir, "test.md");
    fs.writeFileSync(filePath, "---\napproved: false\n---\n\n# Test\n", "utf-8");

    const result = runCli(["approve", filePath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV APPROVE] OK");

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("approved: true");
    expect(content).toContain("approved_by:");
  });

  test("approve fails when file does not exist", () => {
    const result = runCli(["approve", "/nonexistent/file.md"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("[PHASEDEV APPROVE] FAILED");
  });

  test("approve fails when file has no frontmatter", () => {
    const filePath = path.join(testTmpDir, "nofm.md");
    fs.writeFileSync(filePath, "# No Frontmatter\n", "utf-8");

    const result = runCli(["approve", filePath]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("does not contain YAML frontmatter");
  });

  test("approve requires file argument", () => {
    const result = runCli(["approve"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("<file> is required");
  });

  test("approve supports --by option", () => {
    const filePath = path.join(testTmpDir, "test-by.md");
    fs.writeFileSync(filePath, "---\napproved: false\n---\n\n# Test\n", "utf-8");

    const result = runCli(["approve", filePath, "--by", "TestUser"]);
    expect(result.exitCode).toBe(0);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("approved_by: \"TestUser\"");
  });

  // --- set-iteration-status ---

  test("set-iteration-status sets iteration to [x]", () => {
    const planPath = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(planPath, `# Plan\n\n## Iteration 1: API [ ]\n- [ ] 1.1 Implement endpoint\n`, "utf-8");

    const result = runCli(["set-iteration-status", "1", "x", "--file", planPath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV SET-ITERATION-STATUS] OK");

    const content = fs.readFileSync(planPath, "utf-8");
    expect(content).toContain("## Iteration 1: API [x]");
  });

  test("set-iteration-status rejects invalid id", () => {
    const result = runCli(["set-iteration-status", "abc", "x"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("must be a positive integer");
  });

  test("set-iteration-status rejects invalid status", () => {
    const result = runCli(["set-iteration-status", "1", "invalid"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("invalid status");
  });

  test("set-iteration-status reports missing iteration", () => {
    const planPath = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(planPath, `# Plan\n\n## Iteration 1: API [ ]\n- [ ] 1.1 Implement endpoint\n`, "utf-8");

    const result = runCli(["set-iteration-status", "99", "x", "--file", planPath]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Iteration 99 not found");
  });

  // --- validate-artifact ---

  test("validate-artifact validates prd.md", () => {
    const filePath = path.join(testTmpDir, "prd.md");
    writeApproved(filePath, validPrdBody());

    const result = runCli(["validate-artifact", filePath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("validation passed");
  });

  test("validate-artifact validates execution_contract.md", () => {
    const filePath = path.join(testTmpDir, "execution_contract.md");
    writeApproved(filePath, validRulesBody());

    const result = runCli(["validate-artifact", filePath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("validation passed");
  });

  test("validate-artifact cross-checks research_facts.md against a sibling prd.md", () => {
    const prdFilePath = path.join(testTmpDir, "prd.md");
    writeApproved(prdFilePath, validPrdBody().replace(
      "| R1 | Route the flow according to approved artifacts. |\n",
      "| R1 | Route the flow according to approved artifacts. |\n| R2 | Second requirement not traced by research. |\n"
    ));
    const researchFilePath = path.join(testTmpDir, "research_facts.md");
    fs.writeFileSync(researchFilePath, validResearchBody(), "utf-8");

    const result = runCli(["validate-artifact", researchFilePath]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Requirements & Success Criteria Trace must include PRD ID `R2`.");
  });

  test("validate-artifact fails for unknown artifact type", () => {
    const filePath = path.join(testTmpDir, "unknown.md");
    fs.writeFileSync(filePath, "# Unknown\n", "utf-8");

    const result = runCli(["validate-artifact", filePath]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Unknown artifact type");
  });

  test("validate-artifact fails for nonexistent file", () => {
    const result = runCli(["validate-artifact", "/nonexistent/file.md"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("File not found");
  });

  test("validate-artifact requires file argument", () => {
    const result = runCli(["validate-artifact"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("<file> is required");
  });

  // --- add-finding / resolve-finding ---

  function writeValidationFindings(filePath: string, rows?: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = `---
verdict: repair_required
type: iteration
date: 2026-07-01
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows ?? ""}`;
    fs.writeFileSync(filePath, content, "utf-8");
  }

  test("add-finding adds a row to validation_findings.md", () => {
    const findingsPath = path.join(testTmpDir, "validation_findings.md");
    writeValidationFindings(findingsPath);

    const result = runCli(["add-finding", "F1", "Test finding", "MUST-FIX", "--required-fix", "Add missing guard clause", "--iteration", "Iteration 1", "--file", findingsPath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV ADD-FINDING] OK");

    const content = fs.readFileSync(findingsPath, "utf-8");
    expect(content).toContain("F1");
    expect(content).toContain("open");
    expect(content).toContain("MUST-FIX");
    expect(content).toContain("Iteration 1");
    expect(content).toContain("Add missing guard clause");
  });

  test("add-finding rejects duplicate ID", () => {
    const findingsPath = path.join(testTmpDir, "validation_findings.md");
    writeValidationFindings(findingsPath, "| F1 | open | MUST-FIX | validation | Phase 1 | Broken thing | Fix it |\n");

    const result = runCli(["add-finding", "F1", "Duplicate", "MUST-FIX", "--required-fix", "Fix it", "--iteration", "Iteration 1", "--file", findingsPath]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("already exists");
  });

  test("add-finding without --required-fix fails with usage error", () => {
    const result = runCli(["add-finding", "F9", "Broken thing", "MUST-FIX", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("--required-fix");
  });

  test("add-finding rejects placeholder required fix", () => {
    const result = runCli(["add-finding", "F9", "Broken thing", "MUST-FIX", "--required-fix", "TBD", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("placeholder");
  });

  test("add-finding rejects whitespace-only required fix with the concrete-fix message, not the iteration message", () => {
    const result = runCli(["add-finding", "F9", "Broken thing", "MUST-FIX", "--required-fix", "   ", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Required fix must be a concrete action");
    expect(result.output).not.toContain("could not derive the iteration");
  });

  test("add-finding derives the iteration label from state.json when --iteration is omitted", () => {
    const changeDir = setupChange(`
# Plan

## Iteration 1: API [ ]
- [ ] 1.1 Implement endpoint
`, { findings: `---\nverdict: repair_required\ntype: iteration\ndate: 2026-07-01\n---\n\n| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n|---|---|---|---|---|---|---|\n` });
    writeStateJson(changeDir, "implementation", 2);

    const result = runCli(["add-finding", "F1", "Missing guard clause", "MUST-FIX", "--required-fix", "Add missing guard clause", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(0);
    const content = fs.readFileSync(path.join(changeDir, "validation_findings.md"), "utf-8");
    expect(content).toContain("Iteration 2");
  });

  test("resolve-finding sets finding status to resolved", () => {
    const findingsPath = path.join(testTmpDir, "validation_findings.md");
    writeValidationFindings(findingsPath, "| F1 | open | MUST-FIX | validation | Phase 1 | Broken thing | Fix it |\n");

    const result = runCli(["resolve-finding", "F1", "--file", findingsPath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV RESOLVE-FINDING] OK");

    const content = fs.readFileSync(findingsPath, "utf-8");
    expect(content).toContain("F1");
    expect(content).toContain("resolved");
  });

  test("resolve-finding fails for unknown ID", () => {
    const findingsPath = path.join(testTmpDir, "validation_findings.md");
    writeValidationFindings(findingsPath);

    const result = runCli(["resolve-finding", "F99", "--file", findingsPath]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("not found");
  });

  // --- changes ---

  test("changes shows no changes for empty project", () => {
    const result = runCli(["changes", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("No changes found");
  });

  test("list alias works same as changes", () => {
    const result = runCli(["list", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("No changes found");
  });

  test("changes shows active and archived changes", () => {
    // Create active change
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "active-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
    writeApproved(path.join(changeDir, "execution_contract.md"), validRulesBody());

    // Create archived change
    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-07-01-archived-change");
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, ".phase-archive.json"), JSON.stringify({ status: "completed" }), "utf-8");

    const result = runCli(["changes", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Active Changes");
    expect(result.output).toContain("active-change");
    expect(result.output).toContain("Archived Changes");
    expect(result.output).toContain("archived-change");
  });

  // --- config set ---

  test("config set writes a simple key", () => {
    const configPath = path.join(testTmpDir, "config.yaml");
    fs.writeFileSync(configPath, "runArchiveStage: true\nmaxIterations: 10\n", "utf-8");

    const result = runCli(["config", "set", "maxIterations", "5", "--config", configPath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV CONFIG SET] OK");

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("maxIterations: 5");
  });

  test("config set handles boolean values", () => {
    const configPath = path.join(testTmpDir, "config.yaml");
    fs.writeFileSync(configPath, "runArchiveStage: true\n", "utf-8");

    const result = runCli(["config", "set", "runArchiveStage", "false", "--config", configPath]);
    expect(result.exitCode).toBe(0);

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("runArchiveStage: false");
  });

  test("config set rejects missing args", () => {
    const result = runCli(["config", "set"]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("<key> and <value> are required");
  });

  // --- log ---

  test("log shows no logs message when log file missing", () => {
    const result = runCli(["log", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("No logs found");
  });

  test("log displays log entries", () => {
    const logDir = path.join(testTmpDir, ".phasedev", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, "ralph-log.jsonl"),
      '{"timestamp":"2026-07-01T10:00:00Z","level":"INFO","message":"Test log entry"}\n' +
      '{"timestamp":"2026-07-01T10:01:00Z","level":"ERROR","message":"Test error entry"}\n',
      "utf-8");

    const result = runCli(["log", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Test log entry");
    expect(result.output).toContain("Test error entry");
  });

  test("log respects --tail flag", () => {
    const logDir = path.join(testTmpDir, ".phasedev", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, "ralph-log.jsonl"),
      '{"timestamp":"2026-07-01T10:00:00Z","level":"INFO","message":"First entry"}\n' +
      '{"timestamp":"2026-07-01T10:01:00Z","level":"INFO","message":"Second entry"}\n',
      "utf-8");

    const result = runCli(["log", "--project-path", testTmpDir, "--tail", "1"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Second entry");
    expect(result.output).not.toContain("First entry");
  });

  // --- reset-change ---

  test("reset-change warns without --yes flag", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "test-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());

    const result = runCli(["reset-change", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("WARNING");
    expect(result.output).toContain("--yes");
    expect(fs.existsSync(changeDir)).toBe(true);
  });

  test("reset-change moves change to .trash with --yes", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "test-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());

    const result = runCli(["reset-change", "--project-path", testTmpDir, "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("[PHASEDEV RESET-CHANGE] OK");
    expect(result.output).toContain(".trash");
    expect(fs.existsSync(changeDir)).toBe(false);
  });

  test("reset-change reports no active change when none exists", () => {
    const result = runCli(["reset-change", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("No active change found");
  });
});

describe("--json envelope", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  function setupChangeIntakeChange(): string {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeArtifact(path.join(changeDir, "prd.md"), "# PRD\n\n## Intent\n", false);
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody(), false);
    writeStateJson(changeDir, "change_intake");
    return changeDir;
  }

  test("phase --json emits an envelope with the prompt in data.prompt", () => {
    setupChangeIntakeChange();

    const result = runCli(["phase", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.kind).toBe("phase");
    expect(envelope.phase).toBe("change_intake");
    expect(typeof envelope.data.prompt).toBe("string");
    expect(envelope.data.prompt.length).toBeGreaterThan(0);
  });

  test("advance --json reports a blocked refusal with issues folded into message", () => {
    setupChangeIntakeChange();

    const result = runCli(["advance", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(1);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe("advance");
    expect(envelope.phase).toBe(null);
    expect(envelope.data.advanced).toBe(false);
    expect(envelope.message).toContain("Cannot leave phase");
  });

  test("check --json reports a structured issues array on failure", () => {
    setupChangeIntakeChange();

    const result = runCli(["check", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(1);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe("check");
    expect(envelope.phase).toBe("change_intake");
    expect(Array.isArray(envelope.issues)).toBe(true);
    expect(envelope.issues.length).toBeGreaterThan(0);
    expect(envelope.issues[0]).not.toStartWith("- ");
  });

  test("status --json makes the no-active-change case explicit", () => {
    const result = runCli(["status", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.kind).toBe("status");
    expect(envelope.data.activeChange).toBe(null);
  });

  test("status --json reports the active change name explicitly", () => {
    setupChangeIntakeChange();

    const result = runCli(["status", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.data.activeChange).toBe("sample-change");
  });

  test("approve --json reports the mutation as ok:true", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    const filePath = path.join(changeDir, "prd.md");
    writeArtifact(filePath, validPrdBody(), false);

    const result = runCli(["approve", filePath, "--by", "tester", "--json"]);
    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.kind).toBe("approve");
    expect(envelope.data.file).toBe(filePath);
    expect(envelope.data.approvedBy).toBe("tester");
  });

  test("reset-change --json reports a blocked refusal as ok:false", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "test-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());

    const result = runCli(["reset-change", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(1);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe("reset-change");
    expect(envelope.data.confirmationRequired).toBe(true);
  });

  test("reset-change --json treats no-active-change as ok:true", () => {
    const result = runCli(["reset-change", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.kind).toBe("reset-change");
    expect(envelope.data.confirmationRequired).toBe(false);
  });
});

describe("CLI robustness fixes", () => {
  beforeEach(() => setupTestDir());
  afterEach(() => cleanupTestDir());

  test("reset-change refusal without --yes exits non-zero (it did NOT reset)", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "test-change");
    fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
    writeApproved(path.join(changeDir, "prd.md"), validPrdBody());

    const result = runCli(["reset-change", "--project-path", testTmpDir]);
    expect(result.exitCode).toBe(1);
  });

  test("parseStringOption rejects a following flag as the option's value", () => {
    const filePath = path.join(testTmpDir, "some-file.md");

    const result = runCli(["approve", filePath, "--by", "--project-path", testTmpDir]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("--by");
    expect(result.output).toContain("requires a value");
  });

  test("config set --string forces string storage and echoes the stored type", () => {
    const configPath = path.join(testTmpDir, "config.yaml");
    fs.writeFileSync(configPath, "runArchiveStage: true\n", "utf-8");

    const result = runCli(["config", "set", "someFlag", "true", "--config", configPath, "--string"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("(string)");

    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain('someFlag: "true"');
  });

  test("config set echoes the coerced type when --string is not passed", () => {
    const configPath = path.join(testTmpDir, "config.yaml");
    fs.writeFileSync(configPath, "runArchiveStage: true\n", "utf-8");

    const result = runCli(["config", "set", "maxIterations", "7", "--config", configPath]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("(number)");
  });

  test("config set --json reports the stored value and type", () => {
    const configPath = path.join(testTmpDir, "config.yaml");
    fs.writeFileSync(configPath, "runArchiveStage: true\n", "utf-8");

    const result = runCli(["config", "set", "maxIterations", "7", "--config", configPath, "--json"]);
    expect(result.exitCode).toBe(0);

    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(true);
    expect(envelope.kind).toBe("config-set");
    expect(envelope.data.storedValue).toBe(7);
    expect(envelope.data.storedType).toBe("number");
  });
});
