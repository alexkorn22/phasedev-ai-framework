import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getFlowStatus, renderFlowStatus } from "../src/features/flow-status/get-status";
import {
  passedFullGateEvidence,
  prdUsageContractAndNonGoals,
  validFindingsBody,
  validRulesBody
} from "./helpers/fixtures";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("flow-status-gates");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

function browserValidationTable(url = "http://localhost:3000/app"): string {
  return `## Browser Validation

| Field | Value |
|---|---|
| start | Open the app and wait for the shell to load. |
| url | ${url} |
| criteria | The dashboard renders with the primary navigation visible. |
`;
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

${prdUsageContractAndNonGoals()}
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
  const withBundle = normalizedPlanContent.includes("## Generation Bundle") ? normalizedPlanContent : `
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
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
      nextSection = nextSection.replace(/(###\s+Goal\s*)/i, "$1\nSatisfies R1 and SC1.\n");
    }
    if (!/^###\s+Expected Change Surface\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Expected Change Surface\n\n| Area / Path Pattern | Change Type | Ownership | Trace |\n|---|---|---|---|\n| \`src/**\` | update | Fixture implementation area | R1, SC1, D1 |";
    }
    if (!/^###\s+Tasks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Tasks\n";
    }
    if (!/^###\s+Checks\s*$/im.test(nextSection)) {
      nextSection += "\n\n### Checks\n\n- unit: \`bun test unit\`";
    }
    if (!/^###\s+Check Evidence\s*$/im.test(nextSection)) {
      nextSection += `\n\n### Check Evidence\n\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | \`bun test unit\` | ${resultStatus} | ${evidenceStr} |  |`;
    }
    return nextSection;
  });
}

function iterationPlanSection(status: "[x]" | "[~]" | "[ ]"): string {
  const taskLine = status === "[x]" ? "- [x] 1.1 Implement endpoint" : status === "[~]" ? "- [~] 1.1 Implement endpoint" : "- [ ] 1.1 Implement endpoint";
  return `
## Iteration 1: API ${status}

### Tasks

${taskLine}
`;
}

function validResearchBody(): string {
  return `# Research Facts

## PRD Intent Trace

| Field | Status | Evidence | Notes |
|---|---|---|---|
| Change type | not_applicable | prd-only | Classification comes from PRD. |
| Why | not_applicable | prd-only | User intent, not repository evidence. |
| Target state | confirmed | F1 | Code fixture confirms routing. |
| Risk boundaries | confirmed | F2 | Existing fixture tests cover the boundary. |

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

function iterationPlanBody(status: "[x]" | "[~]" | "[ ]"): string {
  return withImplementationPlanContract(iterationPlanSection(status));
}

function writeApproved(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
}

function setupChange(
  options: {
    rules?: string;
    findings?: string;
    gateEvidence?: string;
    iterationPlan?: string;
  } = {}
): string {
  const changeDir = path.join(testTmpDir, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });

  writeApproved(path.join(changeDir, "prd.md"), validPrdBody());
  writeApproved(path.join(changeDir, "execution_contract.md"), options.rules ?? validRulesBody());
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), validResearchBody(), "utf-8");
  writeApproved(
    path.join(changeDir, "architecture", "design.md"),
    validDesignBody()
  );
  writeApproved(
    path.join(changeDir, "iteration_plan.md"),
    options.iterationPlan ?? iterationPlanBody("[x]")
  );

  if (options.findings) {
    fs.writeFileSync(path.join(changeDir, "validation_findings.md"), options.findings, "utf-8");
  }

  if (options.gateEvidence) {
    fs.writeFileSync(path.join(changeDir, "final_gate_evidence.md"), options.gateEvidence, "utf-8");
  }

  return changeDir;
}


describe("status final gate requirements", () => {
  test("final_validation without Browser Validation or evidence reports absent, missing, not_required", () => {
    setupChange();

    const status = getFlowStatus(testTmpDir);
    expect(status.phase).toBe("final_validation");
    expect(status.finalGates).toEqual({
      browserValidation: "absent",
      fullGateEvidence: "missing",
      browserGateEvidence: "not_required"
    });

    const rendered = renderFlowStatus(status);
    expect(rendered).toContain("--- Final gates ---");
    expect(rendered).toContain("Browser Validation: absent");
    expect(rendered).toContain("full gate evidence: missing");
    expect(rendered).toContain("browser gate evidence: not_required");
  });

  test("final_validation with passed full gate evidence reports full = passed", () => {
    setupChange({
      gateEvidence: passedFullGateEvidence("bun test full")
    });

    const status = getFlowStatus(testTmpDir);
    expect(status.finalGates?.fullGateEvidence).toBe("passed");
    expect(status.finalGates?.browserValidation).toBe("absent");
    expect(status.finalGates?.browserGateEvidence).toBe("not_required");

    const rendered = renderFlowStatus(status);
    expect(rendered).toContain("full gate evidence: passed");
  });

  test("Browser Validation present without browser row reports present and browser = missing", () => {
    setupChange({
      rules: `${validRulesBody()}\n${browserValidationTable()}`
    });

    const status = getFlowStatus(testTmpDir);
    expect(status.finalGates).toEqual({
      browserValidation: "present",
      fullGateEvidence: "missing",
      browserGateEvidence: "missing"
    });

    const rendered = renderFlowStatus(status);
    expect(rendered).toContain("Browser Validation: present");
    expect(rendered).toContain("browser gate evidence: missing");
  });

  test("finding_repair with type final shows the final gates block", () => {
    setupChange({
      findings: validFindingsBody(
        "repair_required",
        "final",
        "| F1 | open | MUST-FIX | validation | Final | Finding 1 | Fix 1 |"
      )
    });

    const status = getFlowStatus(testTmpDir);
    expect(status.phase).toBe("finding_repair");
    const rendered = renderFlowStatus(status);
    expect(rendered).toContain("--- Final gates ---");
    expect(rendered).toContain("full gate evidence: missing");
  });

  test("iteration_validation does not show the final gates block", () => {
    setupChange({
      iterationPlan: withImplementationPlanContract(`
## Iteration 1: API [~]

### Tasks

- [x] 1.1 Implement endpoint
`),
      findings: validFindingsBody("ready", "iteration")
    });

    const status = getFlowStatus(testTmpDir);
    expect(status.phase).toBe("iteration_validation");
    const rendered = renderFlowStatus(status);
    expect(rendered).not.toContain("--- Final gates ---");
    expect(rendered).not.toContain("full gate evidence:");
  });

  test("status CLI includes final gate fields in JSON data", () => {
    setupChange({
      gateEvidence: passedFullGateEvidence("bun test full")
    });

    const result = Bun.spawnSync({
      cmd: ["bun", "run", cliPath, "status", "--project-path", testTmpDir, "--json"],
      stdout: "pipe",
      stderr: "pipe"
    });
    expect(result.exitCode).toBe(0);
    const envelope = JSON.parse(result.stdout.toString());
    expect(envelope.data.finalGates).toEqual({
      browserValidation: "absent",
      fullGateEvidence: "passed",
      browserGateEvidence: "not_required"
    });
  });
});
