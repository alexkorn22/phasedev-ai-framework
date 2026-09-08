import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getPhasePrompt } from "../src/features/phase-control/get-phase-prompt";
import { getRoutePrompt } from "../src/features/phase-control/get-route-prompt";
import { phaseRecoveryCommand } from "../src/features/phase-control/prompt-blockers";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import {
  FINAL_VALIDATION_ROLES,
  ITERATION_VALIDATION_ROLES
} from "../src/entities/phase/validation-phase-role";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";
import { prdUsageContractAndNonGoals } from "./helpers/fixtures";

const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

let testTmpDir: string;

function setupTestDir() {
  testTmpDir = createTempWorkspace("validation-role-phase");
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
| Why | Validate role-scoped contracts. |
| Target state | Role isolation works. |
| Risk boundaries | Test fixture only. |

${prdUsageContractAndNonGoals()}
## Requirements

| ID | Requirement |
|---|---|
| R1 | Route validation by role. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Role contracts render correctly. | review |
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

## Environment Notes
Test fixture only.
`;
}

function browserValidationSection(overrides: { start?: string; url?: string; criteria?: string } = {}): string {
  return `## Browser Validation

| Field | Value |
|---|---|
| start | ${overrides.start ?? "Launch the preview server and wait for the shell."} |
| url | ${overrides.url ?? "http://localhost:3000/app"} |
| criteria | ${overrides.criteria ?? "The dashboard renders with primary navigation visible."} |
`;
}

function validRulesBodyWithBrowserValidation(overrides: { start?: string; url?: string; criteria?: string } = {}): string {
  return `${validRulesBody()}\n\n${browserValidationSection(overrides)}`;
}

function withImplementationPlanContract(planContent: string): string {
  const normalizedPlanContent = planContent.trim().replace(/^#\s+.*\n+/, "").trim();
  return `
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Sequencing risk | none |
| Validation | Use fixture commands. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Fixture path. |
| Tests | yes | Fixture commands. |
| Docs/specs | not_applicable | none |
| Migrations | not_applicable | none |
| Feature flags/rollout | not_applicable | none |
| Observability | not_applicable | none |
| Rollback path | not_applicable | none |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Complete fixture. | 1.1 | unit |

${normalizedPlanContent}`;
}

function validResearchBody(): string {
  return `# Research Facts

## PRD Intent Trace

| Field | Status | Evidence | Notes |
|---|---|---|---|
| Change type | not_applicable | prd-only | none |
| Why | not_applicable | prd-only | none |
| Target state | confirmed | F1 | none |
| Risk boundaries | confirmed | F2 | none |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | none | none |
| SC1 | confirmed | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/cli.ts:1\` | Fixture fact. | R1 |
| F2 | code | \`test/cli.test.ts:1\` | Fixture fact. | SC1 |

## Research Gaps & Blockers

No non-blocking gaps.
`;
}

function validDesignBody(): string {
  return `# Design

## Executive Summary

| Area | Decision |
|---|---|
| Approval scope | Approve fixture design. |
| Out of scope | none |
| Key decision | D1 fixture routing. |
| Validation | Review evidence. |

## Traceability Mapping

| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |
|---|---|---|---|---|
| R1 | F1 | D1 | Fixture coverage. | Plan implements routing. |
| SC1 | F2 | D1 | Prompt rendering path. | Plan checks verify rendering. |

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Design entry point. | summary | high |

## Key Design Decisions

| Decision ID | Decision | Rationale | Applies To | Impacts |
|---|---|---|---|---|
| D1 | Keep routing artifact-driven. | Preserves PRD contract. | R1, SC1 | flow route |

## Contracts, Interfaces & Boundaries

| Boundary | Contract | Applies To |
|---|---|---|
| Flow routing | Controller advances on valid artifacts. | D1 |

## Risks & Open Questions
None.
`;
}

function setupValidationChange(activePhase: "iteration_validation" | "final_validation", planStatus: "[~]" | "[x]" = "[~]") {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
  writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody());
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody());
  writeArtifact(path.join(changeDir, "iteration_plan.md"), withImplementationPlanContract(`
## Iteration 1: API ${planStatus}

### Goal

Complete API work. Satisfies R1 and SC1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | API | R1, SC1, D1 |

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | unit tests passed | none |
`));

  const activeIteration = activePhase === "final_validation" ? null : 1;
  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase, activeIteration, repairCycleCount: 0 }, null, 2) + "\n",
    "utf-8"
  );

  return changeDir;
}

function runCli(args: string[]): { exitCode: number; output: string } {
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

describe("validation role phase contracts", () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test("CLI phase accepts --role and threads it to prompt rendering", () => {
    setupValidationChange("iteration_validation");
    const result = runCli(["phase", "--project-path", testTmpDir, "--role", "code-review"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Execution role: code-review");
  });

  test("missing role on iteration_validation fails closed with allowed roles and no contract body", () => {
    setupValidationChange("iteration_validation");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("iteration_validation");
    expect(result.prompt).toContain("Allowed roles:");
    expect(result.prompt).toContain('phasedev phase --change "sample-change" --role <name>');
    for (const role of ITERATION_VALIDATION_ROLES) {
      expect(result.prompt).toContain(role);
    }
    expect(result.prompt).not.toContain("browser-qa");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
    expect(result.prompt).not.toContain("Artifact Build Contract: validation_findings.md");
  });

  test("missing role on final_validation fails closed with allowed roles", () => {
    setupValidationChange("final_validation", "[x]");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("final_validation");
    expect(result.prompt).toContain("Allowed roles:");
    for (const role of FINAL_VALIDATION_ROLES) {
      expect(result.prompt).toContain(role);
    }
    expect(result.prompt).not.toContain("Phase 6B. Final Validation.");
  });

  test("unknown role fails closed with allowed roles", () => {
    setupValidationChange("iteration_validation");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "final-validator");
    expect(result.blocked).toBe(true);
    expect(result.prompt).toContain("final-validator");
    expect(result.prompt).toContain("Allowed roles:");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("non-validation phase preserves behavior when role is absent", () => {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 }, null, 2) + "\n",
      "utf-8"
    );

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Phase 1. Change Intake.");
  });

  test("code-review role isolates code review responsibilities in 6A", () => {
    setupValidationChange("iteration_validation");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "code-review");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: code-review");
    expect(result.prompt).toContain("complete review target set, including every file classified as outside expected");
    expect(result.prompt).toContain("perform the code review pass only");
    expect(result.prompt).toContain("phasedev add-finding");
    expect(result.prompt).toContain("Class = code_review");
    expect(result.prompt).not.toContain("phasedev set-verdict");
    expect(result.prompt).not.toContain("phasedev check-validation --project-path");
    expect(result.prompt).not.toContain("Self-check command:");
    expect(result.prompt).not.toContain("Update iteration status only");
    expect(result.prompt).not.toContain("from `[~]` to `[x]`");
    expect(result.prompt).not.toContain("[execution_contract.md]");
    expect(result.prompt).not.toContain("Test command rules:");
    expect(result.prompt).not.toMatch(/gate command/i);
  });

  test("security-review role isolates security responsibilities in 6A", () => {
    setupValidationChange("iteration_validation");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "security-review");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: security-review");
    expect(result.prompt).toContain("complete review target set, including every file classified as outside expected");
    expect(result.prompt).toContain("perform the security review pass only");
    expect(result.prompt).toContain("Class = security");
    expect(result.prompt).not.toMatch(/perform the code review pass/);
    expect(result.prompt).not.toContain("phasedev set-verdict");
    expect(result.prompt).not.toContain("phasedev check-validation --project-path");
    expect(result.prompt).not.toContain("Self-check command:");
    expect(result.prompt).not.toContain("Update iteration status only");
    expect(result.prompt).not.toContain("[execution_contract.md]");
    expect(result.prompt).not.toContain("Test command rules:");
  });

  test("implementation-check owns verdict and check-validation in 6A without test execution", () => {
    setupValidationChange("iteration_validation");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "implementation-check");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: implementation-check");
    expect(result.prompt).toContain("audit every actual changed file in the controller inventory against instantiated Check Evidence");
    expect(result.prompt).toContain("phasedev set-verdict");
    expect(result.prompt).toContain("phasedev check-validation");
    expect(result.prompt).toContain("test quality audit");
    expect(result.prompt).toContain("do not rerun tests");
    expect(result.prompt).toContain("Update iteration status only");
    expect(result.prompt).toContain("from `[~]` to `[x]`");
    expect(result.prompt).toContain("execution_contract.md");
    expect(result.prompt).not.toContain("final code review pass");
    expect(result.prompt).not.toContain("final security review pass");
  });

  test("implementation-check exposes exact full gate command in 6B", () => {
    setupValidationChange("final_validation", "[x]");
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    writeArtifact(path.join(changeDir, "execution_contract.md"), validRulesBody().replace(
      "| full | `bun test full` |",
      "| full | `bun test contract-full-suite` |"
    ));

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "implementation-check");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: implementation-check");
    expect(result.prompt).toContain("run the `full` gate command exactly once");
    expect(result.prompt).toContain("`bun test contract-full-suite`");
    expect(result.prompt).not.toContain("{{full_gate_command}}");
    expect((result.prompt.match(/bun test contract-full-suite/g) ?? []).length).toBe(1);
    expect(result.prompt).toContain("phasedev check-validation");
    expect(result.prompt).not.toContain("final code review pass");
    expect(result.prompt).not.toContain("final security review pass");
    expect(result.prompt).toMatch(/environment is unavailable|sandbox|network/i);
    expect(result.prompt).toMatch(/do not add a product finding|do not route to finding_repair/i);
    expect(result.prompt).toMatch(/product test failures[\s\S]*MUST-FIX/i);
  });

  test("code-review role in 6B excludes verdict, full gate, iteration status, and check-validation ownership", () => {
    setupValidationChange("final_validation", "[x]");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "code-review");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: code-review");
    expect(result.prompt).toContain("phasedev add-finding");
    expect(result.prompt).not.toContain("phasedev set-verdict");
    expect(result.prompt).not.toContain("{{full_gate_command}}");
    expect(result.prompt).not.toMatch(/run the `full` gate command/);
    expect(result.prompt).not.toContain("phasedev check-validation --project-path");
    expect(result.prompt).not.toContain("Self-check command:");
    expect(result.prompt).not.toContain("Update iteration status");
    expect(result.prompt).not.toContain("mark iterations as `[x]`");
    expect(result.prompt).not.toContain("[execution_contract.md]");
    expect(result.prompt).not.toContain("Test command rules:");
  });

  test("security-review role in 6B excludes verdict, full gate, iteration status, and check-validation ownership", () => {
    setupValidationChange("final_validation", "[x]");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "security-review");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: security-review");
    expect(result.prompt).toContain("phasedev add-finding");
    expect(result.prompt).not.toContain("phasedev set-verdict");
    expect(result.prompt).not.toContain("{{full_gate_command}}");
    expect(result.prompt).not.toMatch(/run the `full` gate command/);
    expect(result.prompt).not.toContain("phasedev check-validation --project-path");
    expect(result.prompt).not.toContain("Self-check command:");
    expect(result.prompt).not.toContain("Update iteration status");
    expect(result.prompt).not.toContain("mark iterations as `[x]`");
    expect(result.prompt).not.toContain("[execution_contract.md]");
    expect(result.prompt).not.toContain("Test command rules:");
  });

  test("phase --json fails closed when validation role is missing", () => {
    setupValidationChange("iteration_validation");
    const result = runCli(["phase", "--project-path", testTmpDir, "--json"]);
    expect(result.exitCode).toBe(1);
    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe("phase");
    expect(envelope.phase).toBe("iteration_validation");
    expect(envelope.message).toContain("Missing validation role");
    expect(envelope.data.prompt).toContain("Allowed roles:");
    expect(envelope.data.prompt).toContain('phasedev phase --change "sample-change" --role <name>');
    expect(envelope.data.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("phase --json fails closed for an invalid validation role", () => {
    setupValidationChange("final_validation", "[x]");
    const result = runCli(["phase", "--project-path", testTmpDir, "--role", "final-validator", "--json"]);
    expect(result.exitCode).toBe(1);
    const envelope = JSON.parse(result.output);
    expect(envelope.ok).toBe(false);
    expect(envelope.kind).toBe("phase");
    expect(envelope.phase).toBe("final_validation");
    expect(envelope.message).toContain("Invalid validation role");
    expect(envelope.data.prompt).toContain("final-validator");
    expect(envelope.data.prompt).toContain("Allowed roles:");
    expect(envelope.data.prompt).not.toContain("Phase 6B. Final Validation.");
  });

  test("phaseRecoveryCommand uses role-scoped phase for validation targets", () => {
    expect(phaseRecoveryCommand("iteration_validation", "sample-change")).toBe(
      'phasedev phase --change "sample-change" --role <name>'
    );
    expect(phaseRecoveryCommand("final_validation", "sample-change")).toBe(
      'phasedev phase --change "sample-change" --role <name>'
    );
  });

  test("phaseRecoveryCommand uses bare phase for non-validation targets", () => {
    expect(phaseRecoveryCommand("finding_repair", "sample-change")).toBe(
      'phasedev phase --change "sample-change"'
    );
    expect(phaseRecoveryCommand("implementation", "sample-change")).toBe(
      'phasedev phase --change "sample-change"'
    );
  });

  test("CLI help documents phase --role and fail-closed validation semantics", () => {
    const result = runCli(["help"]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("phasedev phase");
    expect(result.output).toContain("--role <name>");
    expect(result.output).toContain("code-review, security-review, implementation-check");
    expect(result.output).toContain("browser-qa");
    expect(result.output).toMatch(/browser-qa.*final_validation only|final_validation only.*browser-qa/i);
    expect(result.output).toContain("fail closed");
  });

  test("browser-qa role is blocked on iteration_validation", () => {
    setupValidationChange("iteration_validation");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "browser-qa");
    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("iteration_validation");
    expect(result.prompt).toContain("browser-qa");
    expect(result.prompt).toContain("Allowed roles:");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
  });

  test("browser-qa on final_validation without Browser Validation section is blocked", () => {
    setupValidationChange("final_validation", "[x]");
    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "browser-qa");
    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("final_validation");
    expect(result.prompt).toContain("Browser Validation section is absent; do not dispatch browser-qa.");
    expect(result.prompt).not.toContain("Phase 6B. Final Validation.");
  });

  test("browser-qa on final_validation with Browser Validation section renders browser contract without full gate", () => {
    setupValidationChange("final_validation", "[x]");
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    writeArtifact(
      path.join(changeDir, "execution_contract.md"),
      validRulesBodyWithBrowserValidation({
        start: "Run bun run dev and wait for port 3000.",
        url: "http://localhost:3000/dashboard",
        criteria: "Login form accepts credentials and redirects to dashboard."
      })
    );

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "browser-qa");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: browser-qa");
    expect(result.prompt).toContain("Run bun run dev and wait for port 3000.");
    expect(result.prompt).toContain("http://localhost:3000/dashboard");
    expect(result.prompt).toContain("Login form accepts credentials and redirects to dashboard.");
    expect(result.prompt).toContain("phasedev record-gate browser");
    expect(result.prompt).not.toMatch(/run the `full` gate command/);
    expect(result.prompt).not.toContain("- full:");
    expect(result.prompt).toContain("do NOT run `phasedev set-verdict`");
    expect(result.prompt).not.toMatch(/set the phase verdict ONLY with `phasedev set-verdict`/);
  });

  test("implementation-check on final_validation includes record-gate full and excludes browser start", () => {
    setupValidationChange("final_validation", "[x]");
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
    writeArtifact(
      path.join(changeDir, "execution_contract.md"),
      validRulesBodyWithBrowserValidation({
        start: "Run bun run dev and wait for port 3000.",
        url: "http://localhost:3000/dashboard",
        criteria: "Login form accepts credentials."
      }).replace("| full | `bun test full` |", "| full | `bun test contract-full-suite` |")
    );

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "implementation-check");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("phasedev record-gate full");
    expect(result.prompt).toContain("`bun test contract-full-suite`");
    expect(result.prompt).not.toContain("Run bun run dev and wait for port 3000.");
    expect(result.prompt).not.toContain("http://localhost:3000/dashboard");
  });

  test("getRoutePrompt fails closed for validation phases without role", () => {
    setupValidationChange("iteration_validation");
    const result = getRoutePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("iteration_validation");
    expect(result.prompt).toContain("Allowed roles:");
    expect(result.prompt).not.toContain("Phase 6A. Iteration Validation.");
    expect(result.prompt).not.toContain("phasedev set-verdict");
  });

  test("getRoutePrompt renders role-scoped validation contract when role is provided", () => {
    setupValidationChange("iteration_validation");
    const result = getRoutePrompt(testTmpDir, DEFAULT_CONFIG, { validationRole: "implementation-check" });
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("Execution role: implementation-check");
    expect(result.prompt).toContain("phasedev set-verdict");
    expect(result.prompt).not.toContain("final code review pass");
  });
});
