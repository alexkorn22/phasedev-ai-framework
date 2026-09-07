import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { buildChangePaths } from "../src/entities/change/paths";
import { getPhasePrompt, renderImplementation } from "../src/features/phase-control/get-phase-prompt";
import { renderRepairCheckCommandsOrBlocker } from "../src/features/phase-control/prompt-render-helpers";
import { getRoutePrompt } from "../src/features/phase-control/get-route-prompt";
import { checkValidationCompletion, checkPhase } from "../src/features/phase-control/check-flow";
import { validatePhaseExit } from "../src/features/phase-control/phase-validators";
import { advanceFlow } from "../src/features/phase-control/advance-flow";
import { resolveRoute } from "../src/features/phase-control/flow-route";
import { DEFAULT_CONFIG } from "../src/entities/config/config";
import { iterationValidationBlockers, isIterationReadyForValidation } from "../src/entities/iteration-plan/iteration-readiness";
import { parsePlan } from "../src/entities/iteration-plan/parse-plan";
import { parseTestCommands } from "../src/entities/test-commands/parse-test-commands";
import {
  resolveIterationFocusedCheckCommands,
  resolveRepairFocusedCheckCommands,
  parseRepairFindingScope,
  missingRepairFocusedGateCommands,
  requiredRepairFocusedGateNames,
  renderResolvedCheckCommandLines
} from "../src/entities/test-commands/resolve-check-commands";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

function setupTestDir() {
  testTmpDir = createTempWorkspace("execution-contract-checks");
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
| Why | Authoritative execution contract commands. |
| Target state | Contract commands resolve correctly. |
| Risk boundaries | Test fixture only. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | Resolve gate commands from execution_contract.md. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Commands render from contract. | review |
`;
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

function executionContractBody(overrides?: Partial<Record<"unit" | "phase" | "full", string>>): string {
  const unit = overrides?.unit ?? "bun test {{test_targets}}";
  const phase = overrides?.phase ?? "bun test --grep phase {{test_targets}}";
  const full = overrides?.full ?? "bun test full";
  return `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`${unit}\` |
| phase | \`${phase}\` |
| full | \`${full}\` |

## Environment Notes
During implementation and repair, substitute \`{{test_targets}}\` with new/changed test file paths or selectors from the actual diff. Never guess future test paths at intake.
`;
}

function withImplementationPlanContract(planContent: string): string {
  const normalizedPlanContent = planContent.trim().replace(/^#\s+.*\n+/, "").trim();
  const withBundle = normalizedPlanContent.includes("## Generation Bundle") ? normalizedPlanContent : `
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

  return withBundle.replace(/^## Iteration \d+:.*(?:\n(?!## Iteration \d+:).*)*/gm, section => {
    let nextSection = section;
    const hasIncompleteTask = /^-\s*\[\s*(?: |~|\/)\s*\]/im.test(section);
    const resultStatus = hasIncompleteTask ? "pending" : "passed";
    const evidenceStr = hasIncompleteTask ? "" : "passed checks";

    if (!/^###\s+Goal\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Goal\n\nComplete the fixture phase. Satisfies R1 and SC1.";
    } else {
      nextSection = nextSection.replace(/(###\s+Goal\s*)/i, "$1\nSatisfies R1 and SC1.\n");
    }
    if (!/^###\s+Expected Change Surface\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Expected Change Surface\n\n| Area / Path Pattern | Change Type | Ownership | Trace |\n|---|---|---|---|\n| `src/**` | update | Fixture implementation area | R1, SC1, D1 |";
    }
    if (!/^###\s+Tasks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Tasks\n";
    }
    if (!/^###\s+Checks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Checks\n\n- unit";
    }
    if (!/^###\s+Check Evidence\s*$/im.test(nextSection)) {
      nextSection += `\n\n### Check Evidence\n\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | \`bun test test/fixture.test.ts\` | ${resultStatus} | ${evidenceStr} | none |`;
    }
    return nextSection;
  });
}

function validationFindings(
  verdict: "pending" | "ready" | "ready_with_risks" | "repair_required" | "repaired",
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

function setupChange(
  planContent: string,
  options: {
    activePhase?: string;
    activeIteration?: number | null;
    executionContract?: string;
    findings?: string;
  } = {}
) {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
  writeArtifact(path.join(changeDir, "prd.md"), validPrdBody());
  writeArtifact(path.join(changeDir, "execution_contract.md"), options.executionContract ?? executionContractBody());
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeArtifact(path.join(changeDir, "architecture", "design.md"), validDesignBody());
  writeArtifact(path.join(changeDir, "iteration_plan.md"), withImplementationPlanContract(planContent));

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  fs.writeFileSync(
    path.join(changeDir, "state.json"),
    JSON.stringify({
      activePhase: options.activePhase ?? "implementation",
      activeIteration: options.activeIteration ?? 1,
      repairCycleCount: 0
    }, null, 2) + "\n",
    "utf-8"
  );

  return changeDir;
}

function initGitWorkspaceWithCommitLog(projectPath: string, changeDir: string): void {
  const run = (args: string[]) => spawnSync("git", ["-C", projectPath, ...args], { encoding: "utf-8" });
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["config", "commit.gpgsign", "false"]);
  run(["add", "-A"]);
  run(["commit", "-m", "base", "--no-gpg-sign"]);
  const start = run(["rev-parse", "HEAD"]).stdout.trim();
  const statePath = path.join(changeDir, "state.json");
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
  state.commitLog = { start, iterations: {} };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

describe("execution_contract focused check recipes", () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test("implementation renders recipe templates with target substitution guidance", () => {
    setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work. Satisfies R1 and SC1.

### Tasks

- [ ] 1.1 Implement endpoint

### Checks

- unit

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/fixture.test.ts\` | pending |  |  |
`, {
      executionContract: executionContractBody({ unit: "bun test {{test_targets}}" })
    });

    const result = getRoutePrompt(testTmpDir);
    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("- unit: `bun test {{test_targets}}`");
    expect(result.prompt).toContain("{{test_targets}}");
    expect(result.prompt).toMatch(/substitut/i);
    expect(result.prompt).not.toContain("bun test legacy-plan-unit");
  });

  test("implementation fails closed when iteration checks list full gate", () => {
    setupChange(`
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

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(true);
    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("full");
    expect(result.prompt).not.toContain("Phase 5. Implementation.");
  });

  test("readiness rejects stale evidence when recipe uses placeholder and command does not instantiate it", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- phase

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test legacy-phase\` | passed | legacy evidence | none |
`, {
      executionContract: executionContractBody({ phase: "bun test --grep phase {{test_targets}}" })
    });

    const planPath = path.join(changeDir, "iteration_plan.md");
    const contractPath = path.join(changeDir, "execution_contract.md");
    const phase = parsePlan(planPath)[0];
    const testCommands = parseTestCommands(contractPath).commands;

    expect(iterationValidationBlockers(phase, testCommands)).toContain(
      "required check evidence is missing or stale: phase: bun test --grep phase {{test_targets}}"
    );
  });

  test("readiness accepts instantiated recipe evidence for gate-only plans", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/api.test.ts\` | passed | matched instantiated | none |
`, {
      executionContract: executionContractBody({ unit: "bun test {{test_targets}}" })
    });

    const phase = parsePlan(path.join(changeDir, "iteration_plan.md"))[0];
    const testCommands = parseTestCommands(path.join(changeDir, "execution_contract.md")).commands;
    expect(iterationValidationBlockers(phase, testCommands)).toEqual([]);
  });

  test("readiness accepts legacy exact command evidence when recipe has no placeholder", () => {
    const changeDir = setupChange(`
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
| unit | \`bun test unit\` | passed | matched legacy | none |
`, {
      executionContract: executionContractBody({ unit: "bun test unit" })
    });

    const phase = parsePlan(path.join(changeDir, "iteration_plan.md"))[0];
    const testCommands = parseTestCommands(path.join(changeDir, "execution_contract.md")).commands;
    expect(iterationValidationBlockers(phase, testCommands)).toEqual([]);
  });

  test("readiness accepts instantiated evidence and rejects wrong targets for placeholder recipes", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- phase

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test --grep phase test/api.test.ts\` | passed | contract evidence | none |
`, {
      executionContract: executionContractBody({ phase: "bun test --grep phase {{test_targets}}" })
    });

    const planPath = path.join(changeDir, "iteration_plan.md");
    const contractPath = path.join(changeDir, "execution_contract.md");
    const phase = parsePlan(planPath)[0];
    const testCommands = parseTestCommands(contractPath).commands;

    expect(iterationValidationBlockers(phase, testCommands)).toEqual([]);

    phase.checkEvidence![0].commandOrMethod = "`bun test wrong`";
    expect(iterationValidationBlockers(phase, testCommands)).toContain(
      "required check evidence is missing or stale: phase: bun test --grep phase {{test_targets}}"
    );
  });

  test("implementation check and advance fail when iteration lists full gate with passed evidence", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- full: \`bun test full\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| full | \`bun test full\` | passed | full gate passed | none |
`);

    const paths = buildChangePaths(changeDir);
    const testCommands = parseTestCommands(paths.executionContractPath).commands;
    const phase = parsePlan(paths.iterationPlanPath)[0];
    expect(iterationValidationBlockers(phase, testCommands).some(b => b.includes("iteration Checks may list only focused gates"))).toBe(true);

    const validateExit = validatePhaseExit(testTmpDir, "implementation", paths, 1, DEFAULT_CONFIG.blockingSeverity);
    expect(validateExit.ok).toBe(false);
    expect(validateExit.issues.join(" ")).toContain("full");

    const check = checkPhase(testTmpDir);
    expect(check.ok).toBe(false);
    expect(check.message).toContain("full");

    const advance = advanceFlow(testTmpDir, DEFAULT_CONFIG);
    expect(advance.ok).toBe(false);
    expect(advance.message).toContain("full");
  });

  test("repair prompt uses unit recipe fallback for Final-scope findings with target guidance", () => {
    setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test legacy-unit\`
- phase: \`bun test legacy-phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test contract-unit\` | passed | ok | none |
| phase | \`bun test contract-phase\` | passed | ok | none |

## Iteration 2: UI [x]

### Goal

Complete UI work.

### Tasks

- [x] 2.1 Build page

### Checks

- phase: \`bun test legacy-phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test contract-phase\` | passed | ok | none |
`, {
      activePhase: "finding_repair",
      activeIteration: null,
      executionContract: executionContractBody({
        unit: "bun test {{test_targets}}",
        phase: "bun test --grep phase {{test_targets}}"
      }),
      findings: validationFindings(
        "repair_required",
        "final",
        "| F1 | open | MUST-FIX | validation | Final | Cross-cutting gap. | Fix validation evidence. |\n"
      )
    });

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("- unit: `bun test {{test_targets}}`");
    expect(result.prompt).not.toContain("- phase:");
    expect(result.prompt).toMatch(/substitut/i);
    expect(result.prompt).toContain("Run only checks relevant to actual repair changes");
  });

  test("repair prompt receives deduplicated focused commands and never full", () => {
    setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test legacy-unit\`
- phase: \`bun test legacy-phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test contract-unit\` | passed | ok | none |
| phase | \`bun test contract-phase\` | passed | ok | none |

## Iteration 2: UI [x]

### Goal

Complete UI work.

### Tasks

- [x] 2.1 Build page

### Checks

- unit: \`bun test legacy-unit-dup\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test contract-unit\` | passed | ok | none |
`, {
      activePhase: "finding_repair",
      activeIteration: null,
      executionContract: executionContractBody({
        unit: "bun test {{test_targets}}",
        phase: "bun test --grep phase {{test_targets}}",
        full: "bun test contract-full"
      }),
      findings: validationFindings(
        "repair_required",
        "final",
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect in API. | Fix API defect. |\n| F2 | open | MUST-FIX | implementation | Iteration 2 | Defect in UI. | Fix UI defect. |\n"
      )
    });

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("- unit: `bun test {{test_targets}}`");
    expect(result.prompt).toContain("- phase: `bun test --grep phase {{test_targets}}`");
    expect(result.prompt).not.toContain("bun test contract-full");
    expect(result.prompt).not.toContain("bun test legacy-unit");
    expect((result.prompt.match(/bun test \{\{test_targets\}\}/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  test("final_validation implementation-check renders backtick full command exactly once via safe inline code", () => {
    setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | ok | none |
`, {
      activePhase: "final_validation",
      activeIteration: null,
      executionContract: executionContractBody({ full: "bun test `backtick-full-suite`" })
    });

    const implementationCheck = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "implementation-check");
    expect(implementationCheck.blocked).toBe(false);
    expect(implementationCheck.prompt).toContain("run the `full` gate command exactly once: ``bun test `backtick-full-suite```");
    expect((implementationCheck.prompt.match(/backtick-full-suite/g) ?? []).length).toBe(1);

    for (const role of ["code-review", "security-review"] as const) {
      const reviewer = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, role);
      expect(reviewer.prompt).not.toContain("backtick-full-suite");
      expect(reviewer.prompt).not.toMatch(/run the `full` gate command exactly once:/);
    }
  });

  test("final_validation implementation-check exposes exact full command once after review ordering", () => {
    setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | ok | none |
`, {
      activePhase: "final_validation",
      activeIteration: null,
      executionContract: executionContractBody({ full: "bun test contract-full-suite" })
    });

    const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, "implementation-check");
    expect(result.blocked).toBe(false);
    expect(result.prompt).toContain("`bun test contract-full-suite`");
    expect(result.prompt).not.toContain("{{full_gate_command}}");
    expect((result.prompt.match(/bun test contract-full-suite/g) ?? []).length).toBe(1);
    const reviewIndex = result.prompt.indexOf("audit `Check Evidence`");
    const fullGateIndex = result.prompt.indexOf("`bun test contract-full-suite`");
    expect(reviewIndex).toBeGreaterThan(-1);
    expect(fullGateIndex).toBeGreaterThan(reviewIndex);
  });

  test("reviewer roles exclude executable full gate command", () => {
    setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | ok | none |
`, {
      activePhase: "final_validation",
      activeIteration: null,
      executionContract: executionContractBody({ full: "bun test contract-full-suite" })
    });

    for (const role of ["code-review", "security-review"] as const) {
      const result = getPhasePrompt(testTmpDir, DEFAULT_CONFIG, undefined, role);
      expect(result.blocked).toBe(false);
      expect(result.prompt).not.toContain("bun test contract-full-suite");
      expect(result.prompt).not.toMatch(/run the `full` gate command/);
    }
  });

  test("missing required gate in execution_contract fails closed for implementation", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [ ] 1.1 Implement endpoint

### Checks

- phase: \`bun test phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test phase\` | pending |  |  |
`, {
      executionContract: executionContractBody({ phase: "bun test phase" }).replace(
        "| phase | `bun test phase` |",
        "| phase |  |"
      )
    });

    const result = renderImplementation(testTmpDir, DEFAULT_CONFIG, buildChangePaths(changeDir), 1);
    expect(typeof result).not.toBe("string");
    if (typeof result !== "string") {
      expect(result.blocked).toBe(true);
      expect(result.prompt).toContain("Missing test command");
      expect(result.prompt).toContain("phase");
    }
  });

  test("resolve helpers deduplicate identical focused commands", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Checks

- unit: \`legacy-a\`
- phase: \`legacy-b\`

## Iteration 2: UI [ ]

### Checks

- unit: \`legacy-c\`
- phase: \`legacy-d\`
`);
    const plan = parsePlan(path.join(changeDir, "iteration_plan.md"));
    const commands = { unit: "bun test {{test_targets}}", phase: "bun test --grep phase {{test_targets}}" };

    const repairCommands = resolveRepairFocusedCheckCommands(plan, commands, {
      iterationIds: [1, 2],
      hasFinalScopeFindings: false
    });
    expect(repairCommands).toEqual([
      { gate: "unit", command: "bun test {{test_targets}}" },
      { gate: "phase", command: "bun test --grep phase {{test_targets}}" }
    ]);

    const iterationCommands = resolveIterationFocusedCheckCommands(plan[0], commands);
    expect(iterationCommands).toEqual([
      { gate: "unit", command: "bun test {{test_targets}}" },
      { gate: "phase", command: "bun test --grep phase {{test_targets}}" }
    ]);
  });

  test("repair prompt fails closed when final-scope fallback requires missing unit gate", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit: \`bun test legacy-unit\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test contract-unit\` | passed | ok | none |
`, {
      activePhase: "finding_repair",
      activeIteration: null,
      findings: validationFindings(
        "repair_required",
        "final",
        "| F1 | open | MUST-FIX | validation | Final | Cross-cutting gap. | Fix validation evidence. |\n"
      )
    });
    const plan = parsePlan(path.join(changeDir, "iteration_plan.md"));
    const rulesPath = path.join(changeDir, "execution_contract.md");
    const scope = { iterationIds: [], hasFinalScopeFindings: true };
    const blocker = renderRepairCheckCommandsOrBlocker(plan, { phase: "bun test phase", full: "bun test full" }, scope, rulesPath);

    expect(typeof blocker).not.toBe("string");
    if (typeof blocker !== "string") {
      expect(blocker.blocked).toBe(true);
      expect(blocker.phase).toBe("finding_repair");
      expect(blocker.prompt).toContain("Missing test command");
      expect(blocker.prompt).toContain("unit");
    }
  });

  test("repair prompt fails closed when iteration finding requires missing phase gate", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- phase: \`bun test legacy-phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test contract-phase\` | passed | ok | none |
`, {
      activePhase: "finding_repair",
      findings: validationFindings(
        "repair_required",
        "iteration",
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect in API. | Fix API defect. |\n"
      )
    });
    const plan = parsePlan(path.join(changeDir, "iteration_plan.md"));
    const rulesPath = path.join(changeDir, "execution_contract.md");
    const scope = { iterationIds: [1], hasFinalScopeFindings: false };
    const blocker = renderRepairCheckCommandsOrBlocker(
      plan,
      { unit: "bun test contract-unit", full: "bun test full" },
      scope,
      rulesPath
    );

    expect(typeof blocker).not.toBe("string");
    if (typeof blocker !== "string") {
      expect(blocker.prompt).toContain("Missing test command");
      expect(blocker.prompt).toContain("phase");
    }
  });

  test("missingRepairFocusedGateCommands derives required gates from repair scope not resolved commands", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]

### Checks

- phase: \`legacy-phase\`

## Iteration 2: UI [x]

### Checks

- unit: \`legacy-unit\`
`, {
      activePhase: "finding_repair",
      findings: validationFindings("repair_required", "iteration")
    });
    const plan = parsePlan(path.join(changeDir, "iteration_plan.md"));
    const scope = {
      iterationIds: [1, 2],
      hasFinalScopeFindings: false
    };

    expect(requiredRepairFocusedGateNames(plan, scope)).toEqual(["phase", "unit"]);
    expect(missingRepairFocusedGateCommands(plan, { unit: "bun test unit" }, scope)).toEqual(["phase"]);
    expect(missingRepairFocusedGateCommands(plan, { unit: "bun test unit", phase: "bun test phase" }, scope)).toEqual([]);
    expect(requiredRepairFocusedGateNames(plan, { iterationIds: [], hasFinalScopeFindings: true })).toEqual(["unit"]);
  });

  test("renderResolvedCheckCommandLines preserves commands containing markdown backticks", () => {
    const rendered = renderResolvedCheckCommandLines([
      { gate: "unit", command: "bun test `backtick-suite`" }
    ]);
    expect(rendered).toBe("- unit: ``bun test `backtick-suite```");
    expect(rendered).toContain("bun test `backtick-suite`");
  });

  test("implementation prompt renders backtick-containing recipe exactly once", () => {
    setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Tasks

- [ ] 1.1 Implement endpoint

### Checks

- unit

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/fixture.test.ts\` | pending |  |  |
`, {
      executionContract: executionContractBody({ unit: "bun test `backtick-suite` {{test_targets}}" })
    });

    const result = getRoutePrompt(testTmpDir);
    expect(result.phase).toBe("implementation");
    expect(result.prompt).toContain("- unit: ``bun test `backtick-suite` {{test_targets}}``");
  });

  test("check-validation stale evidence message references recipe not legacy plan command", () => {
    const changeDir = setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- phase: \`bun test legacy-phase\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| phase | \`bun test wrong\` | passed | wrong command | none |

## Iteration 2: UI [ ]
- [ ] 2.1 Build page
`, {
      executionContract: executionContractBody({ phase: "bun test --grep phase {{test_targets}}" }),
      findings: validationFindings("ready", "iteration")
    });

    const result = checkValidationCompletion(testTmpDir, {
      scope: "iteration",
      iterationId: 1
    });

    expect(result.ok).toBe(false);
    expect(parseRepairFindingScope([
      { phase: "Final", blocksPr: true, latestStatus: "open" }
    ])).toEqual({ iterationIds: [], hasFinalScopeFindings: true });

    expect(parseRepairFindingScope([
      { phase: "Iteration 1", blocksPr: true, latestStatus: "open" },
      { phase: "Final", blocksPr: true, latestStatus: "open" }
    ])).toEqual({ iterationIds: [1], hasFinalScopeFindings: true });
  });

  test("resolveRoute uses execution_contract recipes for gate-only readiness (no advance deadlock)", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | API | R1, SC1, D1 |

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/api.test.ts\` | passed | matched instantiated | none |
`, {
      executionContract: executionContractBody({ unit: "bun test {{test_targets}}" })
    });

    const planPath = path.join(changeDir, "iteration_plan.md");
    const contractPath = path.join(changeDir, "execution_contract.md");
    const phase = parsePlan(planPath)[0];
    const testCommands = parseTestCommands(contractPath).commands;

    expect(isIterationReadyForValidation(phase)).toBe(false);
    expect(isIterationReadyForValidation(phase, testCommands)).toBe(true);
    expect(iterationValidationBlockers(phase, testCommands)).toEqual([]);

    const route = resolveRoute(testTmpDir);
    expect(route.kind).toBe("iteration");
    if (route.kind === "iteration") {
      expect(route.phase).toBe("iteration_validation");
    }

    initGitWorkspaceWithCommitLog(testTmpDir, changeDir);
    const advance = advanceFlow(testTmpDir, DEFAULT_CONFIG);
    expect(advance.ok).toBe(true);
    expect(advance.newState?.activePhase).toBe("iteration_validation");
  });

  test("implementation and repair prompts inject controller changed-file inventory", () => {
    const changeDir = setupChange(`
## Iteration 1: API [~]

### Goal

Complete API work.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/**\` | update | API | R1, SC1, D1 |

### Tasks

- [ ] 1.1 Implement endpoint

### Checks

- unit

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/api.test.ts\` | pending | | |
`, {
      executionContract: executionContractBody({ unit: "bun test {{test_targets}}" })
    });

    const paths = buildChangePaths(changeDir);
    const implementationPrompt = renderImplementation(testTmpDir, DEFAULT_CONFIG, paths, 1);
    expect(typeof implementationPrompt).toBe("string");
    if (typeof implementationPrompt === "string") {
      expect(implementationPrompt).toContain("## Controller Observed Changed Files");
      expect(implementationPrompt).toContain("is a forecast/traceability aid for planning and review, not a hard allowlist");
      expect(implementationPrompt).toContain("refresh/inspect the actual git diff");
    }

    setupChange(`
## Iteration 1: API [x]

### Goal

Complete API work.

### Tasks

- [x] 1.1 Implement endpoint

### Checks

- unit

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/api.test.ts\` | passed | ok | none |
`, {
      activePhase: "finding_repair",
      activeIteration: null,
      executionContract: executionContractBody({ unit: "bun test {{test_targets}}" }),
      findings: validationFindings(
        "repair_required",
        "iteration",
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect. | Fix it. |\n"
      )
    });

    const repairPrompt = getPhasePrompt(testTmpDir, DEFAULT_CONFIG);
    expect(repairPrompt.blocked).toBe(false);
    expect(repairPrompt.prompt).toContain("## Controller Observed Changed Files");
    expect(repairPrompt.prompt).toContain("refresh/inspect the actual git diff");
    expect(repairPrompt.prompt).not.toContain("- full:");
  });
});
