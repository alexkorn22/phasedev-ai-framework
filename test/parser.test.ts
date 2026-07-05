import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { findActiveChangeDir } from "../src/entities/change/active-change";
import { parsePlan } from "../src/entities/iteration-plan/parse-plan";
import type { Iteration } from "../src/entities/iteration-plan/types";
import { validatePlanArtifact } from "../src/entities/iteration-plan/validate-plan-artifact";
import { validatePlanStructure } from "../src/entities/iteration-plan/validate-plan";
import { validatePrdArtifact } from "../src/entities/prd/validate-prd";
import { validateResearchFacts } from "../src/entities/research-facts/validate-research";
import { validateRulesArtifact } from "../src/entities/rules/validate-rules";
import { validateDesign } from "../src/entities/design/validate-design";
import { validateExecutionContract } from "../src/entities/execution-contract/validate-execution-contract";
import { extractRequirementsAndCriteriaFromPrd } from "../src/entities/prd/traceability";
import { parseTestCommands } from "../src/entities/test-commands/parse-test-commands";
import { parseBlockingValidationFindings, parseCurrentValidationFindings, parseValidationFindingsArtifact, parseValidationVerdict, parseValidationVerdictType } from "../src/entities/validation-findings/parse-validation-findings";
import { isApproved, readFrontmatter } from "../src/shared/markdown/frontmatter";
import { normalizeLineEndings } from "../src/shared/markdown/normalize-line-endings";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

function setupTestDir() {
  if (!testTmpDir) {
    testTmpDir = createTempWorkspace("parser");
  }
  if (!fs.existsSync(testTmpDir)) {
    fs.mkdirSync(testTmpDir, { recursive: true });
  }
}

function cleanupTestDir() {
  cleanupTempWorkspace(testTmpDir);
}

const canonicalTaskSyntaxIssue =
  "Use exactly `- [ ] <iteration>.<task> Task name` for top-level tasks and `  - [ ] <iteration>.<task>.<subtask> Subtask name` for subtasks.";
const canonicalPhaseHeadingSyntaxIssue =
  "Use exactly `## Iteration <number>: <name> [ ]`, `## Iteration <number>: <name> [~]`, or `## Iteration <number>: <name> [x]`.";

describe("Parser & Checker Utilities", () => {
  beforeAll(() => {
    setupTestDir();
  });

  test("normalizeLineEndings cleans BOM and special characters", () => {
    const raw = "\uFEFFLine 1\r\nLine 2\u00A0with space";
    const cleaned = normalizeLineEndings(raw);
    expect(cleaned).toBe("Line 1\nLine 2 with space");
  });

  test("isApproved detects approved: true in YAML frontmatter and lines", () => {
    const validFile = path.join(testTmpDir, "valid.md");
    fs.writeFileSync(validFile, "---\napproved: true\n---\n# Title", "utf-8");
    expect(isApproved(validFile)).toBe(true);

    const invalidFile = path.join(testTmpDir, "invalid.md");
    fs.writeFileSync(invalidFile, "---\napproved: false\n---\n# Title", "utf-8");
    expect(isApproved(invalidFile)).toBe(false);
    
    const missingFmFile = path.join(testTmpDir, "missing.md");
    fs.writeFileSync(missingFmFile, "approved: true\n# Title", "utf-8");
    expect(isApproved(missingFmFile)).toBe(false);

    const notApprovedFile = path.join(testTmpDir, "not_approved.md");
    fs.writeFileSync(notApprovedFile, "---\nnot_approved: true\n---\n# Title", "utf-8");
    expect(isApproved(notApprovedFile)).toBe(false);
  });

  test("readFrontmatter keeps keys after an indented '---' inside a block scalar", () => {
    const blockScalarFile = path.join(testTmpDir, "block_scalar.md");
    fs.writeFileSync(
      blockScalarFile,
      [
        "---",
        "description: |",
        "  Some text before.",
        "  ---",
        "  Some text after.",
        "approved: true",
        "---",
        "# Title"
      ].join("\n"),
      "utf-8"
    );

    expect(readFrontmatter(blockScalarFile)).toMatchObject({ approved: true });
  });

  test("readFrontmatter returns null when there is no closing fence", () => {
    const noClosingFence = path.join(testTmpDir, "no_closing_fence.md");
    fs.writeFileSync(noClosingFence, "---\napproved: true\n# Title", "utf-8");

    expect(readFrontmatter(noClosingFence)).toBeNull();
  });

  test("parsePlan extracts phases and task list statuses correctly", () => {
    const planFile = path.join(testTmpDir, "plan.md");
    const planContent = `
# Plan

## Iteration 1: Database Setup [x]
- [x] 1.1 Create migration
- [x] 1.2 Create user model

## Iteration 2: Core Auth APIs [~]
- [x] 2.1 Implement signup handler
  - [x] 2.1.1 Add validation
- [ ] 2.2 Implement login handler
- [ ] 2.3 Add JWT middleware

## Iteration 3: UI [ ]
- [ ] 3.1 Layout
`;
    fs.writeFileSync(planFile, planContent, "utf-8");
    const phases = parsePlan(planFile);

    expect(phases).toHaveLength(3);
    expect(phases[0].id).toBe(1);
    expect(phases[0].status).toBe("completed");
    expect(phases[0].tasks).toHaveLength(2);
    expect(phases[0].tasks[0].status).toBe("completed");

    expect(phases[1].id).toBe(2);
    expect(phases[1].status).toBe("in_progress");
    expect(phases[1].tasks).toHaveLength(3);
    expect(phases[1].tasks[0].id).toBe("2.1");
    expect(phases[1].tasks[0].children[0].id).toBe("2.1.1");
    expect(phases[1].tasks[0].status).toBe("completed");
    expect(phases[1].tasks[1].status).toBe("not_started");
  });

  test("parsePlan anchors the heading regex like the strict validator", () => {
    const planFile = path.join(testTmpDir, "plan_anchored.md");
    const planContent = `
# Plan

## Iteration 1: Fix [x] flag [~]
- [x] 1.1 Do something

## Iteration 2: Foo [x] (trailing note)
- [x] 2.1 Do something else
`;
    fs.writeFileSync(planFile, planContent, "utf-8");
    const phases = parsePlan(planFile);

    expect(phases).toHaveLength(1);
    expect(phases[0].id).toBe(1);
    expect(phases[0].name).toBe("Fix [x] flag");
    expect(phases[0].status).toBe("in_progress");
  });

  test("parsePlan treats a [/] iteration heading as not_started, distinct from [~] in_progress", () => {
    const planFile = path.join(testTmpDir, "plan_slash_status.md");
    const planContent = `
# Plan

## Iteration 1: Deferred Work [/]
- [ ] 1.1 Not yet started
`;
    fs.writeFileSync(planFile, planContent, "utf-8");
    const phases = parsePlan(planFile);

    expect(phases).toHaveLength(1);
    expect(phases[0].status).toBe("not_started");
    expect(phases[0].status).not.toBe("in_progress");
    expect(phases[0].status).not.toBe("completed");
  });

  test("parsePlan extracts optional phase additional checks", () => {
    const planFile = path.join(testTmpDir, "plan_checks.md");
    const planContent = `
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint

Additional checks:
- \`bun test:e2e auth\`
- Browser smoke for login flow

Checks:
- Endpoint works.
`;
    fs.writeFileSync(planFile, planContent, "utf-8");
    const phases = parsePlan(planFile);

    expect(phases).toHaveLength(1);
    expect(phases[0].additionalChecks).toEqual(["`bun test:e2e auth`", "Browser smoke for login flow"]);
  });

  test("parsePlan extracts generation bundle and check evidence without mixing them into tasks", () => {
    const planFile = path.join(testTmpDir, "plan_evidence.md");
    const planContent = `
# Plan

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update prompt templates. |
| Tests | yes | Add parser regression. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert prompt changes. |

## Iteration 1: Prompt Updates [~]

### Goal

Update prompts.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`templates/step3_plan.md\` | update | Plan prompt contract | R1, SC1, D1 |

### Tasks

- [x] 1.1 Update setup prompt
- [ ] 1.2 Update validation prompts

### Checks

- unit: \`bun test test/parser.test.ts\`

Additional checks:
- \`npm run typecheck\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | passed | 12 tests passed | none |
| additional | \`npm run typecheck\` | pending |  |  |
`;
    fs.writeFileSync(planFile, planContent, "utf-8");
    const phases = parsePlan(planFile);

    expect(phases).toHaveLength(1);
    expect(phases[0].tasks).toHaveLength(2);
    expect(phases[0].tasks.map(task => task.id)).toEqual(["1.1", "1.2"]);
    expect(phases[0].additionalChecks).toEqual(["`npm run typecheck`"]);
    expect(phases[0].requiredChecks).toEqual([
      { check: "unit", command: "bun test test/parser.test.ts" }
    ]);
    expect(phases[0].generationBundle?.map(row => row.area)).toEqual([
      "Production code",
      "Tests",
      "Docs/specs",
      "Migrations",
      "Feature flags/rollout",
      "Observability",
      "Rollback path"
    ]);
    expect(phases[0].checkEvidence).toEqual([
      { check: "unit", commandOrMethod: "`bun test test/parser.test.ts`", result: "passed", evidence: "12 tests passed", notes: "none" },
      { check: "additional", commandOrMethod: "`npm run typecheck`", result: "pending", evidence: "", notes: "" }
    ]);
  });

  test("parsePlan extracts multiple required phase checks from the Checks section", () => {
    const planFile = path.join(testTmpDir, "plan_required_checks.md");
    fs.writeFileSync(planFile, `
# Plan

## Iteration 1: Validation Gates [~]

### Tasks

- [x] 1.1 Complete work

### Checks

- unit: \`bun test unit\`
- phase: \`bun test phase\`
- full: \`npm run typecheck\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test unit\` | passed | unit passed | none |
| phase | \`bun test phase\` | pending |  |  |
`, "utf-8");

    const phases = parsePlan(planFile);

    expect(phases[0].requiredChecks).toEqual([
      { check: "unit", command: "bun test unit" },
      { check: "phase", command: "bun test phase" },
      { check: "full", command: "npm run typecheck" }
    ]);
  });

  test("validatePlanStructure enforces generation bundle and check evidence contract for parsed plans", () => {
    const invalidPlanFile = path.join(testTmpDir, "invalid_plan_contract.md");
    fs.writeFileSync(invalidPlanFile, `
# Plan

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | maybe |  |
| Tests | yes | Add tests. |

## Iteration 1: Prompt Updates [~]

### Goal

Update prompts.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`templates/step3_plan.md\` | update | Plan prompt contract | R1, SC1, D1 |

### Tasks

- [x] 1.1 Update setup prompt

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit |  | passed |  | none |
| additional | \`npm run typecheck\` | unknown |  |  |
`, "utf-8");

    const issues = validatePlanStructure(parsePlan(invalidPlanFile));

    expect(issues).toContain("Generation Bundle area `Production code` has invalid Required value `maybe`; expected yes, no, or not_applicable.");
    expect(issues).toContain("Generation Bundle area `Production code` must have a non-empty Plan explanation.");
    expect(issues).toContain("Generation Bundle must include area `Docs/specs`.");
    expect(issues).toContain("Iteration 1: Prompt Updates Check Evidence row 1 has an empty Command Or Method.");
    expect(issues).toContain("Iteration 1: Prompt Updates Check Evidence row 1 with Result `passed` must have non-empty Evidence.");
    expect(issues).toContain("Iteration 1: Prompt Updates Check Evidence row 2 has invalid Result `unknown`; expected pending, passed, failed, blocked, or not_applicable.");
  });

  test("validatePlanArtifact enforces top-level plan artifact contract", () => {
    const validPlanFile = path.join(testTmpDir, "valid_plan_artifact.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(validPlanFile, `---
approved: true
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Update prompt templates. |
| Out of scope | Runtime product changes. |
| Sequencing risk | none |
| Validation | Run parser tests. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update prompt templates. |
| Tests | yes | Add parser regression. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert prompt changes. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Update prompts. | 1.1 | unit |

## Iteration 1: Prompt Updates [~]

### Goal

Update prompts.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`templates/step3_plan.md\` | update | Plan prompt contract | R1, SC1, D1 |

### Tasks

- [x] 1.1 Update setup prompt

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | passed | parser tests passed | none |
`, "utf-8");

    expect(validatePlanArtifact(validPlanFile)).toEqual([]);

    const invalidPlanFile = path.join(testTmpDir, "invalid_plan_artifact.md");
    fs.writeFileSync(invalidPlanFile, `---
approved: true
date: 2026-06-02
---
<!-- leftover -->
# Plan

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | maybe | TODO |

## Notes
Unexpected section.

## Iteration 1: Prompt Updates [~]
- [x] 1.1 Update setup prompt
`, "utf-8");

    const issues = validatePlanArtifact(invalidPlanFile);
    expect(issues).toContain("iteration_plan.md must not contain HTML template comments.");
    expect(issues).toContain("iteration_plan.md must not contain placeholder text: TODO.");
    expect(issues).toContain("iteration_plan.md must contain exactly one top-level heading: `# Implementation Plan`.");
    expect(issues).toContain("iteration_plan.md contains unexpected section `## Notes`.");
    expect(issues).toContain("iteration_plan.md non-iteration `##` sections must exactly match this order: `## Approval Summary`, `## Generation Bundle`, `## Iteration Overview`.");
    expect(issues).toContain("Section `## Approval Summary` must contain a markdown table.");
    expect(issues).toContain("Section `## Iteration Overview` must contain a markdown table.");
  });

  test("validatePlanArtifact gives canonical guidance for malformed iteration headings", () => {
    const invalidPlanFile = path.join(testTmpDir, "malformed_phase_heading_plan.md");
    fs.writeFileSync(invalidPlanFile, `---
approved: false
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Update API. |
| Out of scope | none |
| Sequencing risk | none |
| Validation | unit |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update API. |
| Tests | yes | Add tests. |
| Docs/specs | not_applicable | No docs. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert code. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | API | 1.1 | unit |

## Iteration 1: API

### Goal

Update API.
`, "utf-8");

    const issues = validatePlanArtifact(invalidPlanFile);

    expect(issues).toContain(`iteration_plan.md has invalid iteration heading syntax: \`## Iteration 1: API\`. ${canonicalPhaseHeadingSyntaxIssue}`);
    expect(issues).toContain(`iteration_plan.md must contain at least one iteration heading. ${canonicalPhaseHeadingSyntaxIssue}`);
  });

  test("validatePlanArtifact names empty cells in fixed tables and Expected Change Surface", () => {
    const invalidPlanFile = path.join(testTmpDir, "empty_cells_plan_artifact.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(invalidPlanFile, `---
approved: true
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope |  |
| Out of scope | Runtime product changes. |
| Sequencing risk | none |
| Validation | Run parser tests. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes |  |
| Tests | yes | Add parser regression. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert prompt changes. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 |  | 1.1 | unit |

## Iteration 1: Prompt Updates [~]

### Goal

Update prompts.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`templates/step3_plan.md\` | update |  | R1, SC1, D1 |

### Tasks

- [x] 1.1 Update setup prompt

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | passed | parser tests passed | none |
`, "utf-8");

    const issues = validatePlanArtifact(invalidPlanFile);
    expect(issues).toContain("Approval Summary row 4 (Approval scope) has empty cell(s): Decision.");
    expect(issues).toContain("Generation Bundle row 4 (Production code) has empty cell(s): Plan.");
    expect(issues).toContain("Iteration Overview row 4 (Iteration 1) has empty cell(s): Goal.");
    expect(issues).toContain("Iteration 1: Prompt Updates Expected Change Surface row 1 (`templates/step3_plan.md`) has empty cell(s): Ownership.");
    expect(issues).not.toContain("Approval Summary row 4 must not contain empty cells.");
    expect(issues).not.toContain("Generation Bundle row 4 must not contain empty cells.");
    expect(issues).not.toContain("Iteration Overview row 4 must not contain empty cells.");
    expect(issues).not.toContain("Iteration 1: Prompt Updates Expected Change Surface row 1 must not contain empty cells.");
  });

  test("validatePlanArtifact accepts Expected Change Surface with globs and enforces design decision traceability", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    const prdFile = path.join(testTmpDir, "prd.md");
    const validPlanFile = path.join(testTmpDir, "valid_surface_plan.md");
    const missingDecisionPlanFile = path.join(testTmpDir, "missing_decision_plan.md");
    const vagueTracePlanFile = path.join(testTmpDir, "vague_surface_trace_plan.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(prdFile, `# PRD

## Requirements

| ID | Requirement |
|---|---|
| R1 | Update plan artifact scope control. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Plan validation accepts bounded expected change surfaces. | test |
`, "utf-8");
    fs.writeFileSync(designFile, `---
approved: true
date: 2026-06-02
---
${validDesignBody()}
`, "utf-8");

    const planBody = `---
approved: true
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Update the plan artifact contract for R1, SC1, and D1. |
| Out of scope | Runtime product behavior. |
| Sequencing risk | none |
| Validation | Run parser tests. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update prompt and validator code for R1, SC1, D1. |
| Tests | yes | Add parser regression for R1, SC1, D1. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert plan validator changes. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Add expected surface validation for R1, SC1, D1. | 1.1 | unit |

## Iteration 1: Plan Surface [~]

### Goal

Add bounded expected change surfaces for R1, SC1, and D1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/entities/iteration-plan/*.ts\` | update | Plan artifact validation | R1, SC1, D1 |
| \`templates/**/*.md\` | update | Prompt contracts | R1, SC1, D1 |

### Tasks

- [x] 1.1 Implement validator.

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | passed | parser tests passed | none |
`;
    fs.writeFileSync(validPlanFile, planBody, "utf-8");
    fs.writeFileSync(missingDecisionPlanFile, planBody.replace(/, D1/g, "").replace(/D1/g, ""), "utf-8");
    fs.writeFileSync(vagueTracePlanFile, planBody.replace(/R1, SC1, D1/g, "all requirements"), "utf-8");

    expect(validatePlanArtifact(validPlanFile, prdFile, designFile)).toEqual([]);
    expect(validatePlanArtifact(missingDecisionPlanFile, prdFile, designFile)).toContain("Design decision `D1` is not mapped in the implementation plan.");
    expect(validatePlanArtifact(vagueTracePlanFile, prdFile, designFile)).toContain("Iteration 1: Plan Surface Expected Change Surface row 1 Trace must reference at least one `R#`, one `SC#`, and one `D#`.");
    expect(validatePlanArtifact(validPlanFile, prdFile)).toEqual([]);
  });

  test("plan referencing an undeclared R#/SC#/D# is invalid", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    const prdFile = path.join(testTmpDir, "prd.md");
    const planFile = path.join(testTmpDir, "unknown_trace_plan.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(prdFile, `# PRD

## Requirements

| ID | Requirement |
|---|---|
| R1 | Update plan artifact scope control. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Plan validation accepts bounded expected change surfaces. | test |
`, "utf-8");
    fs.writeFileSync(designFile, `---
approved: true
date: 2026-06-02
---
${validDesignBody()}
`, "utf-8");

    const planBody = `---
approved: true
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Update the plan artifact contract for R1, SC1, and D1. |
| Out of scope | Runtime product behavior. |
| Sequencing risk | none |
| Validation | Run parser tests. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update prompt and validator code for R1, SC1, D1. |
| Tests | yes | Add parser regression for R1, SC1, D1. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert plan validator changes. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Add expected surface validation for R1, SC1, D1. | 1.1 | unit |

## Iteration 1: Plan Surface [~]

### Goal

Add bounded expected change surfaces for R1, SC1, and D1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/entities/iteration-plan/*.ts\` | update | Plan artifact validation | R1, SC1, D1 |
| \`templates/**/*.md\` | update | Prompt contracts | R1, SC1, D1 |

### Tasks

- [x] 1.1 Implement validator.

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | passed | parser tests passed | none |
`;
    fs.writeFileSync(planFile, planBody.replace(/R1, SC1, D1/g, "R1 R9, SC1 SC9, D1 D9"), "utf-8");

    const issues = validatePlanArtifact(planFile, prdFile, designFile);

    expect(issues).toContain("iteration_plan.md references unknown trace ID `R9`; it is not declared in prd.md.");
    expect(issues).toContain("iteration_plan.md references unknown trace ID `SC9`; it is not declared in prd.md.");
    expect(issues).toContain("iteration_plan.md references unknown trace ID `D9`; it is not declared in architecture/design.md Key Design Decisions.");
  });

  test("unknown-ID check is skipped when PRD or design is unavailable", () => {
    const planFile = path.join(testTmpDir, "unknown_trace_no_artifacts_plan.md");
    cleanupTestDir();
    setupTestDir();

    const planBody = `---
approved: true
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Update the plan artifact contract for R1, SC1, and D1. |
| Out of scope | Runtime product behavior. |
| Sequencing risk | none |
| Validation | Run parser tests. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update prompt and validator code for R1, SC1, D1. |
| Tests | yes | Add parser regression for R1, SC1, D1. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert plan validator changes. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Add expected surface validation for R1, SC1, D1. | 1.1 | unit |

## Iteration 1: Plan Surface [~]

### Goal

Add bounded expected change surfaces for R1, SC1, and D1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/entities/iteration-plan/*.ts\` | update | Plan artifact validation | R1, SC1, D1 |
| \`templates/**/*.md\` | update | Prompt contracts | R1, SC1, D1 |

### Tasks

- [x] 1.1 Implement validator.

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | passed | parser tests passed | none |
`;
    fs.writeFileSync(planFile, planBody.replace(/R1, SC1, D1/g, "R1 R9, SC1 SC9, D1 D9"), "utf-8");

    const issues = validatePlanArtifact(planFile);

    expect(issues.filter(issue => issue.includes("unknown trace ID"))).toHaveLength(0);
  });

  test("validatePlanArtifact rejects concrete modify paths that do not exist", () => {
    const planFile = path.join(testTmpDir, "missing_modify_surface_plan.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.join(testTmpDir, "src", "entities"), { recursive: true });
    fs.writeFileSync(path.join(testTmpDir, "src", "entities", "existing.ts"), "export {};\n", "utf-8");
    fs.writeFileSync(planFile, `---
approved: true
date: 2026-06-02
---
# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Update the plan artifact contract for R1, SC1, and D1. |
| Out of scope | Runtime product behavior. |
| Sequencing risk | none |
| Validation | Run parser tests. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Update validator code for R1, SC1, D1. |
| Tests | yes | Add parser regression for R1, SC1, D1. |
| Docs/specs | not_applicable | No docs change. |
| Migrations | not_applicable | No migrations. |
| Feature flags/rollout | not_applicable | No rollout. |
| Observability | not_applicable | No observability. |
| Rollback path | not_applicable | Revert plan validator changes. |

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Add expected surface validation for R1, SC1, D1. | 1.1 | unit |

## Iteration 1: Plan Surface [~]

### Goal

Add bounded expected change surfaces for R1, SC1, and D1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`src/entities/missing.ts\` | modify | Plan artifact validation | R1, SC1, D1 |
| \`src/new-file.ts\` | new | Plan artifact validation | R1, SC1, D1 |
| \`src/entities/*.ts\` | modify | Plan artifact validation | R1, SC1, D1 |

### Tasks

- [ ] 1.1 Implement validator.

### Checks

- unit: \`bun test test/parser.test.ts\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test test/parser.test.ts\` | pending | not run yet | none |
`, "utf-8");

    const issues = validatePlanArtifact(planFile);

    expect(issues).toContain("Iteration 1: Plan Surface Expected Change Surface row 1 references MODIFY path that does not exist: `src/entities/missing.ts`.");
    expect(issues).not.toContain("Iteration 1: Plan Surface Expected Change Surface row 2 references NEW path that does not exist: `src/new-file.ts`.");
    expect(issues).not.toContain("Iteration 1: Plan Surface Expected Change Surface row 3 references MODIFY path that does not exist: `src/entities/*.ts`.");
  });

  test("validatePlanStructure rejects empty and malformed phase plans", () => {
    expect(validatePlanStructure([])).toContain(`iteration_plan.md must contain at least one iteration heading. ${canonicalPhaseHeadingSyntaxIssue}`);

    const issues = validatePlanStructure([
      { id: 1, name: "API", status: "completed", tasks: [{ id: "1.1", name: "Implement endpoint", status: "not_started", children: [] }], additionalChecks: [] },
      { id: 1, name: "UI", status: "in_progress", tasks: [], additionalChecks: [] },
      { id: 3, name: "Docs", status: "in_progress", tasks: [{ id: "3.1", name: "Update docs", status: "completed", children: [] }], additionalChecks: [] }
    ] as Iteration[]);

    expect(issues).toContain("Iteration numbers must be unique; duplicate iteration id(s): 1.");
    expect(issues).toContain("Iteration numbers must be sequential starting at 1.");
    expect(issues).toContain("Iteration 1: API is [x] but contains incomplete tasks.");
    expect(issues).toContain("Iteration 1: UI must contain at least one task checkbox.");
    expect(issues).toContain("Only one iteration may have [~] status at a time; active iterations: Iteration 1: UI, Iteration 3: Docs.");
  });

  test("validatePlanStructure rejects empty phase names", () => {
    const issues = validatePlanStructure([
      { id: 1, name: "", status: "not_started", tasks: [{ id: "1.1", name: "Implement prompt", status: "not_started", children: [] }], additionalChecks: [] }
    ] as Iteration[]);

    expect(issues).toContain("Iteration 1 must have a non-empty name.");
  });

  test("validatePlanStructure rejects unstarted phases containing completed tasks or non-pending evidence", () => {
    const issues = validatePlanStructure([
      {
        id: 1,
        name: "API",
        status: "not_started" as const,
        tasks: [
          { id: "1.1", name: "Task 1", status: "completed" as const, children: [] }
        ],
        additionalChecks: [],
        rawContent: "### Goal\nGoal\n### Expected Change Surface\n| Area / Path Pattern | Change Type | Ownership | Trace |\n|---|---|---|---|\n| `src/**` | update | API | R1, SC1, D1 |\n### Tasks\n- [x] 1.1 Task 1\n### Checks\nchecks\n### Check Evidence\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | cmd | passed | ok | none |\n",
        checkEvidence: [
          { check: "unit", commandOrMethod: "cmd", result: "passed" as const, evidence: "ok", notes: "none" }
        ]
      }
    ] as Iteration[]);

    expect(issues).toContain("Iteration 1: API is not started [ ] but contains completed tasks: 1.1.");
    expect(issues).toContain("Iteration 1: API is not started [ ] but contains non-pending evidence results.");
  });

  test("validatePlanStructure enforces monotonic phase status order", () => {
    const validIssues = validatePlanStructure([
      { id: 1, name: "Done", status: "completed", tasks: [{ id: "1.1", name: "Task 1", status: "completed", children: [] }], additionalChecks: [] },
      { id: 2, name: "Active", status: "in_progress", tasks: [{ id: "2.1", name: "Task 2", status: "not_started", children: [] }], additionalChecks: [] },
      { id: 3, name: "Queued", status: "not_started", tasks: [{ id: "3.1", name: "Task 3", status: "not_started", children: [] }], additionalChecks: [] }
    ] as Iteration[]);
    expect(validIssues).not.toContain("Iteration statuses must follow [x]* -> [~]? -> [ ]* order; Iteration 2: Active [~] cannot appear after Iteration 1: Done [x].");

    const queuedBeforeActiveIssues = validatePlanStructure([
      { id: 1, name: "Queued", status: "not_started", tasks: [{ id: "1.1", name: "Task 1", status: "not_started", children: [] }], additionalChecks: [] },
      { id: 2, name: "Active", status: "in_progress", tasks: [{ id: "2.1", name: "Task 2", status: "not_started", children: [] }], additionalChecks: [] }
    ] as Iteration[]);
    expect(queuedBeforeActiveIssues).toContain("Iteration statuses must follow [x]* -> [~]? -> [ ]* order; Iteration 2: Active [~] cannot appear after Iteration 1: Queued [ ].");

    const activeBeforeCompletedIssues = validatePlanStructure([
      { id: 1, name: "Active", status: "in_progress", tasks: [{ id: "1.1", name: "Task 1", status: "not_started", children: [] }], additionalChecks: [] },
      { id: 2, name: "Done", status: "completed", tasks: [{ id: "2.1", name: "Task 2", status: "completed", children: [] }], additionalChecks: [] }
    ] as Iteration[]);
    expect(activeBeforeCompletedIssues).toContain("Iteration statuses must follow [x]* -> [~]? -> [ ]* order; Iteration 2: Done [x] cannot appear after Iteration 1: Active [~].");

    const queuedBeforeCompletedIssues = validatePlanStructure([
      { id: 1, name: "Queued", status: "not_started", tasks: [{ id: "1.1", name: "Task 1", status: "not_started", children: [] }], additionalChecks: [] },
      { id: 2, name: "Done", status: "completed", tasks: [{ id: "2.1", name: "Task 2", status: "completed", children: [] }], additionalChecks: [] }
    ] as Iteration[]);
    expect(queuedBeforeCompletedIssues).toContain("Iteration statuses must follow [x]* -> [~]? -> [ ]* order; Iteration 2: Done [x] cannot appear after Iteration 1: Queued [ ].");
  });

  test("validatePlanStructure validates traceability of requirements and criteria from PRD", () => {
    const prdFile = path.join(testTmpDir, "traceability_prd.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---
# PRD
## Requirements
| ID | Requirement |
|---|---|
| R1 | Require auth |
| R2 | Require log |
## Success Criteria
| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Auth is tested | unit |
| SC2 | R2 | Log is tested | review |
`, "utf-8");

    const phases: Iteration[] = [
      {
        id: 1,
        name: "Auth",
        status: "in_progress",
        tasks: [{ id: "1.1", name: "Implement auth", status: "not_started", children: [] }],
        additionalChecks: [],
        rawContent: "### Goal\nGoal\n### Expected Change Surface\n| Area / Path Pattern | Change Type | Ownership | Trace |\n|---|---|---|---|\n| `src/**` | update | API | R1, SC1, D1 |\n### Tasks\n- [ ] 1.1 Implement auth (implements R1)\n### Checks\nunit\n### Check Evidence\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | cmd | pending | | | /* verifies SC1 */\n"
      }
    ];

    const issues = validatePlanStructure(phases, prdFile);
    expect(issues).toContain("Requirement \`R2\` is not mapped in the implementation plan.");
    expect(issues).toContain("Success criterion \`SC2\` is not mapped in the implementation plan.");
    expect(issues).not.toContain("Requirement \`R1\` is not mapped in the implementation plan.");
    expect(issues).not.toContain("Success criterion \`SC1\` is not mapped in the implementation plan.");
  });

  test("validatePlanStructure rejects invalid numbered task structure", () => {
    const issues = validatePlanStructure([
      {
        id: 1,
        name: "API",
        status: "completed",
        additionalChecks: [],
        tasks: [
          { id: "", name: "Missing task id", status: "completed", children: [] },
          { id: "2.1", name: "Wrong phase id", status: "completed", children: [] },
          { id: "1.2", name: "Parent task", status: "completed", children: [{ id: "1.2.1", name: "Child task", status: "not_started", children: [] }] },
          { id: "1.2", name: "Duplicate task id", status: "completed", children: [] }
        ]
      }
    ] as Iteration[]);

    expect(issues).toContain(`Iteration 1: API has a task with invalid task ID syntax: Missing task id. ${canonicalTaskSyntaxIssue}`);
    expect(issues).toContain("Task 2.1 must start with iteration number 1.");
    expect(issues).toContain("Task 1.2 is [x] but contains incomplete subtasks.");
    expect(issues).toContain("Task IDs must be unique; duplicate task id `1.2` in Iteration 1: API and Iteration 1: API.");
    expect(issues).toContain("Iteration 1: API is [x] but contains incomplete tasks.");
  });

  test("validatePlanStructure gives positive canonical guidance for malformed task checkbox IDs", () => {
    const planFile = path.join(testTmpDir, "malformed_task_ids.md");
    fs.writeFileSync(planFile, `
# Plan

## Iteration 1: API [~]
- [ ] 1. Build endpoint
- [ ] T1.1: Build tests
- [ ] 1.1: Wire handler
- [ ] 1.2 Wire route
`, "utf-8");

    const issues = validatePlanStructure(parsePlan(planFile));

    expect(issues).toContain(`Iteration 1: API has a task with invalid task ID syntax: 1. Build endpoint. ${canonicalTaskSyntaxIssue}`);
    expect(issues).toContain(`Iteration 1: API has a task with invalid task ID syntax: T1.1: Build tests. ${canonicalTaskSyntaxIssue}`);
    expect(issues).toContain(`Iteration 1: API has a task with invalid task ID syntax: 1.1: Wire handler. ${canonicalTaskSyntaxIssue}`);
    expect(issues).not.toContain(`Iteration 1: API has a task with invalid task ID syntax: 1.2 Wire route. ${canonicalTaskSyntaxIssue}`);
    expect(issues.join("\n")).not.toContain("do not use");
  });

  test("validatePrdArtifact accepts required PRD contract", () => {
    const prdFile = path.join(testTmpDir, "valid_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
approved_by: "tester"
date: 2026-06-02
---

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded in approved requirements. |
| Target state | Update flow prompts and validation gates. |
| Risk boundaries | No behavior outside flow prompt routing changes. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | PRD must include Intent. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Downstream stages consume PRD intent. | review |
`, "utf-8");

    expect(validatePrdArtifact(prdFile)).toEqual([]);
  });

  test("validatePrdArtifact rejects incomplete PRD template output", () => {
    const prdFile = path.join(testTmpDir, "invalid_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

<!-- leftover comment -->

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | bug |
| Why |  |
| Target state |  |
| Risk boundaries |  |

## Requirements
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("prd.md must not contain HTML template comments.");
    expect(issues).toContain("prd.md must contain section `## Success Criteria`.");
    expect(issues).toContain("Intent field `Change type` must be one of: feature, fix, refactor, infra, experiment.");
    expect(issues).toContain("Intent field `Why` must be present and non-empty.");
    expect(issues).toContain("Intent field `Target state` must be present and non-empty.");
    expect(issues).toContain("Intent field `Risk boundaries` must be present and non-empty.");
    expect(issues).toContain("Section `## Requirements` must contain a markdown table.");
  });

  test("validatePrdArtifact rejects unexpected PRD sections", () => {
    const prdFile = path.join(testTmpDir, "unexpected_section_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded in approved requirements. |
| Target state | Update flow prompts and validation gates. |
| Risk boundaries | No behavior outside flow prompt routing changes. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | PRD must include Intent. |

## Notes

Extra notes are not allowed as a PRD section.

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Downstream stages consume PRD intent. | review |
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("prd.md contains unexpected section `## Notes`.");
    expect(issues).toContain("prd.md `##` sections must exactly match this order: `## Intent`, `## Requirements`, `## Success Criteria`.");
  });

  test("validatePrdArtifact rejects hidden deeper PRD sections", () => {
    const prdFile = path.join(testTmpDir, "deep_heading_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded in approved requirements. |
| Target state | Update flow prompts and validation gates. |
| Risk boundaries | No behavior outside flow prompt routing changes. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | PRD must include Intent. |

### Risks

Hidden section.

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Downstream stages consume PRD intent. | review |
`, "utf-8");

    expect(validatePrdArtifact(prdFile)).toContain("prd.md must not contain headings deeper than `##`: `### Risks`.");
  });

  test("validatePrdArtifact rejects extra Intent rows", () => {
    const prdFile = path.join(testTmpDir, "extra_intent_row_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded in approved requirements. |
| Target state | Update flow prompts and validation gates. |
| Risk boundaries | No behavior outside flow prompt routing changes. |
| Extra | Not allowed. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | PRD must include Intent. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Downstream stages consume PRD intent. | review |
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("Intent field `Extra` is not allowed.");
    expect(issues).toContain("Intent fields must exactly match this order: `Change type`, `Why`, `Target state`, `Risk boundaries`.");
  });

  test("validatePrdArtifact rejects missing requirement ids, success ids, unknown verifies, and missing evidence", () => {
    const prdFile = path.join(testTmpDir, "missing_ids_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded in approved requirements. |
| Target state | Update flow prompts and validation gates. |
| Risk boundaries | No behavior outside flow prompt routing changes. |

## Requirements

| ID | Requirement |
|---|---|
| Requirement | PRD must include Intent. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| Criterion | R2 | Downstream stages consume PRD intent. |  |
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("Requirements row 3 ID must use `R#` format.");
    expect(issues).toContain("Success Criteria row 3 ID must use `SC#` format.");
    expect(issues).toContain("Success Criteria row 3 Verifies references unknown requirement `R2`.");
    expect(issues).toContain("Success Criteria row 3 Evidence must be non-empty.");
  });

  test("validatePrdArtifact rejects placeholder text", () => {
    const prdFile = path.join(testTmpDir, "placeholder_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded in approved requirements. |
| Target state | Update flow prompts and validation gates. |
| Risk boundaries | No behavior outside flow prompt routing changes. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | PRD must include Intent. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | TODO. | review |
`, "utf-8");

    expect(validatePrdArtifact(prdFile)).toContain("prd.md must not contain placeholder text: TODO.");
  });

  function validResearchFactsBody(overrides = ""): string {
    if (overrides) {
      return overrides;
    }

    return `# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | fix | not_applicable | prd-only | Classification comes from PRD. |
| Why | Keep routing decisions grounded. | not_applicable | prd-only | User intent, not repository evidence. |
| Target state | Research traces concrete flow behavior. | confirmed | F1, S1 | Code is primary; spec is context. |
| Risk boundaries | No unrelated flow changes. | confirmed | F2 | Existing tests cover routing. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | S1 | none |
| SC1 | limited | F2 | none | Fixture criterion is partially evidenced. |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/index.ts:42\` | Current implementation routes approved changes. | R1 |
| F2 | code | \`test/parser.test.ts:12\` | Tests exercise parser behavior. | SC1 |
| S1 | spec | \`.phasedev/specs/flow/spec.md:8\` | Existing spec describes flow routing. | R1 |

## Research Gaps & Blockers

No non-blocking gaps.
`;
  }

  function writeResearchFixture(filePath: string, body = validResearchFactsBody()): void {
    fs.writeFileSync(filePath, body, "utf-8");
  }

  function writeResearchPrdFixture(filePath: string): void {
    fs.writeFileSync(filePath, `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded. |
| Target state | Research traces concrete flow behavior. |
| Risk boundaries | No unrelated flow changes. |

## Requirements
| ID | Requirement |
|---|---|
| R1 | First requirement. |
| R2 | Second requirement. |

## Success Criteria
| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | First criterion. | unit |
| SC2 | R2 | Second criterion. | review |
`, "utf-8");
  }

  test("validateResearchFacts accepts valid research with code and spec facts", () => {
    const researchFile = path.join(testTmpDir, "valid_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(researchFile);

    expect(validateResearchFacts(researchFile)).toEqual([]);
  });

  test("validateResearchFacts rejects missing tables, placeholders, and missing code facts", () => {
    const invalidResearchFile = path.join(testTmpDir, "invalid_research.md");
    fs.writeFileSync(invalidResearchFile, `# Research Facts

## PRD Intent Trace
Trace details here.

## Requirements & Success Criteria Trace
Trace details here.

## Source Facts
No line numbers here.

## Research Gaps & Blockers
TODO: find blockers.
`, "utf-8");

    const issues = validateResearchFacts(invalidResearchFile);
    expect(issues).toContain("research_facts.md must not contain placeholder text: TODO.");
    expect(issues).toContain("Section `## PRD Intent Trace` must contain a markdown table.");
    expect(issues).toContain("Section `## Requirements & Success Criteria Trace` must contain a markdown table.");
    expect(issues).toContain("Section `## Source Facts` must contain a markdown table.");
    expect(issues).toContain("Source Facts must include at least one `F#` code fact.");
  });

  test("validateResearchFacts rejects embedded template sample rows", () => {
    const researchFile = path.join(testTmpDir, "sample_rows_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(researchFile, `# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | fix | not_applicable | prd-only | Classification comes from PRD. |
| Why | Keep routing decisions grounded. | not_applicable | prd-only | User intent, not repository evidence. |
| Target state | Requested target from PRD. | limited | F1 | Current implementation partially supports the requested target; F1 records what exists and what does not yet fully support the target. |
| Risk boundaries | Requested risk boundary from PRD. | limited | F2 | Current tests or configuration partially cover this boundary; F2 records current enforcement gaps without claiming target completion. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | S1 | none |
| SC1 | limited | F2 | none | Fixture criterion is partially evidenced. |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`src/file.ts:42\` | Current implementation does X. | R1 |
| F2 | code | \`test/file.test.ts:12\` | Tests verify behavior X. | SC1 |
| S1 | spec | \`.phasedev/specs/foo/spec.md:12\` | Existing spec describes capability Y. | R1 |

## Research Gaps & Blockers

No non-blocking gaps.
`);

    const issues = validateResearchFacts(researchFile);
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Requested target from PRD.`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Requested risk boundary from PRD.`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Current implementation partially supports the requested target; F1 records what exists and what does not yet fully support the target.`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Current tests or configuration partially cover this boundary; F2 records current enforcement gaps without claiming target completion.`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `src/file.ts:42`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `test/file.test.ts:12`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `.phasedev/specs/foo/spec.md:12`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Current implementation does X.`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Tests verify behavior X.`.");
    expect(issues).toContain("research_facts.md must replace embedded template sample value `Existing spec describes capability Y.`.");
  });

  test("validateResearchFacts requires complete PRD trace IDs exactly once", () => {
    const prdFile = path.join(testTmpDir, "research_trace_prd.md");
    const researchFile = path.join(testTmpDir, "research_trace.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchPrdFixture(prdFile);
    writeResearchFixture(researchFile, validResearchFactsBody().replace(
      "| R1 | confirmed | F1 | S1 | none |\n| SC1 | limited | F2 | none | Fixture criterion is partially evidenced. |",
      [
        "| R1 | confirmed | F1 | S1 | none |",
        "| R1 | confirmed | F2 | none | Duplicate requirement traced. |",
        "| SC1 | confirmed | F2 | none | none |",
        "| SC3 | confirmed | F1 | none | Extra criterion traced. |"
      ].join("\n")
    ));

    const issues = validateResearchFacts(researchFile, prdFile);
    expect(issues).toContain("Requirements & Success Criteria Trace contains duplicate ID `R1`.");
    expect(issues).toContain("Requirements & Success Criteria Trace must include PRD ID `R2`.");
    expect(issues).toContain("Requirements & Success Criteria Trace must include PRD ID `SC2`.");
    expect(issues).toContain("Requirements & Success Criteria Trace contains unexpected ID `SC3`.");
  });

  test("validateResearchFacts rejects missing PRD Intent Trace rows", () => {
    const researchFile = path.join(testTmpDir, "missing_intent_row_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(researchFile, validResearchFactsBody().replace("| Why | Keep routing decisions grounded. | not_applicable | prd-only | User intent, not repository evidence. |\n", ""));

    expect(validateResearchFacts(researchFile)).toContain("PRD Intent Trace must include field `Why`.");
  });

  test("validateResearchFacts names empty PRD Intent Trace Notes cells", () => {
    const researchFile = path.join(testTmpDir, "empty_intent_notes_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(researchFile, validResearchFactsBody()
      .replace("| Change type | fix | not_applicable | prd-only | Classification comes from PRD. |", "| Change type | fix | not_applicable | prd-only |  |")
      .replace("| Why | Keep routing decisions grounded. | not_applicable | prd-only | User intent, not repository evidence. |", "| Why | Keep routing decisions grounded. | not_applicable | prd-only |  |"));

    const issues = validateResearchFacts(researchFile);
    expect(issues).toContain("PRD Intent Trace row 3 (Change type) has empty cell(s): Notes.");
    expect(issues).toContain("PRD Intent Trace row 4 (Why) has empty cell(s): Notes.");
    expect(issues).not.toContain("PRD Intent Trace row 3 must not contain empty cells.");
    expect(issues).not.toContain("PRD Intent Trace row 4 must not contain empty cells.");
  });

  test("validateResearchFacts requires PRD Intent Trace values to match prd.md", () => {
    const prdFile = path.join(testTmpDir, "research_intent_prd.md");
    const researchFile = path.join(testTmpDir, "mismatched_intent_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchPrdFixture(prdFile);
    writeResearchFixture(researchFile, validResearchFactsBody().replace(
      "| Target state | Research traces concrete flow behavior. | confirmed | F1, S1 | Code is primary; spec is context. |",
      "| Target state | Research invents a different target state. | confirmed | F1, S1 | Code is primary; spec is context. |"
    ));

    expect(validateResearchFacts(researchFile, prdFile)).toContain("PRD Intent Trace row 5 PRD Value for `Target state` must match prd.md value `Research traces concrete flow behavior.`.");
  });

  test("validateResearchFacts rejects invalid statuses", () => {
    const researchFile = path.join(testTmpDir, "invalid_research_status.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(researchFile, validResearchFactsBody().replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | investigating | F1 | S1 | none |"));

    expect(validateResearchFacts(researchFile)).toContain("Requirements & Success Criteria Trace row 3 has invalid Status `investigating`; expected confirmed, limited, blocked, or not_applicable.");
  });

  test("validateResearchFacts requires code evidence for concrete requirement statuses", () => {
    const confirmedWithoutCodeFile = path.join(testTmpDir, "confirmed_without_code_research.md");
    const limitedWithoutCodeFile = path.join(testTmpDir, "limited_without_code_research.md");
    const blockedWithoutCodeFile = path.join(testTmpDir, "blocked_without_code_research.md");
    cleanupTestDir();
    setupTestDir();

    writeResearchFixture(confirmedWithoutCodeFile, validResearchFactsBody().replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | confirmed | not_applicable | S1 | none |"));
    writeResearchFixture(limitedWithoutCodeFile, validResearchFactsBody().replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | limited | not_applicable | S1 | partial code evidence missing |"));
    writeResearchFixture(blockedWithoutCodeFile, validResearchFactsBody().replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | blocked | not_applicable | S1 | code evidence missing |"));

    expect(validateResearchFacts(confirmedWithoutCodeFile)).toContain("Requirements & Success Criteria Trace row 3 with Status `confirmed` must reference at least one `F#` code fact in Code Evidence.");
    expect(validateResearchFacts(limitedWithoutCodeFile)).toContain("Requirements & Success Criteria Trace row 3 with Status `limited` must reference at least one `F#` code fact in Code Evidence.");
    expect(validateResearchFacts(blockedWithoutCodeFile)).toContain("Requirements & Success Criteria Trace row 3 with Status `blocked` must reference at least one `F#` code fact in Code Evidence.");
  });

  test("validateResearchFacts restricts prd-only evidence to non-repository intent fields", () => {
    const targetPrdOnlyFile = path.join(testTmpDir, "target_prd_only_research.md");
    const riskPrdOnlyFile = path.join(testTmpDir, "risk_prd_only_research.md");
    cleanupTestDir();
    setupTestDir();

    writeResearchFixture(targetPrdOnlyFile, validResearchFactsBody().replace("| Target state | Research traces concrete flow behavior. | confirmed | F1, S1 | Code is primary; spec is context. |", "| Target state | Research traces concrete flow behavior. | confirmed | prd-only | Code evidence missing. |"));
    writeResearchFixture(riskPrdOnlyFile, validResearchFactsBody().replace("| Risk boundaries | No unrelated flow changes. | confirmed | F2 | Existing tests cover routing. |", "| Risk boundaries | No unrelated flow changes. | confirmed | prd-only | Code evidence missing. |"));

    expect(validateResearchFacts(targetPrdOnlyFile)).toContain("PRD Intent Trace row 5 Evidence may use `prd-only` only for `Change type` and `Why`.");
    expect(validateResearchFacts(riskPrdOnlyFile)).toContain("PRD Intent Trace row 6 Evidence may use `prd-only` only for `Change type` and `Why`.");
  });

  test("validateResearchFacts requires exact section heading case", () => {
    const researchFile = path.join(testTmpDir, "wrong_case_section_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(researchFile, validResearchFactsBody().replace("## PRD Intent Trace", "## prd intent trace"));

    expect(validateResearchFacts(researchFile)).toContain("research_facts.md must contain section `## PRD Intent Trace`.");
    expect(validateResearchFacts(researchFile)).toContain("research_facts.md contains unexpected section `## prd intent trace`.");
  });

  test("validateResearchFacts rejects references to missing code and spec facts", () => {
    const missingCodeFactFile = path.join(testTmpDir, "missing_code_fact_research.md");
    const missingSpecFactFile = path.join(testTmpDir, "missing_spec_fact_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(missingCodeFactFile, validResearchFactsBody().replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | confirmed | F99 | S1 | none |"));
    writeResearchFixture(missingSpecFactFile, validResearchFactsBody().replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | confirmed | F1 | S99 | none |"));

    expect(validateResearchFacts(missingCodeFactFile)).toContain("Requirements & Success Criteria Trace row 3 Code Evidence references unknown code fact `F99`.");
    expect(validateResearchFacts(missingSpecFactFile)).toContain("Requirements & Success Criteria Trace row 3 Spec Context references unknown spec fact `S99`.");
  });

  test("validateResearchFacts enforces Source Facts fact IDs, types, and source line numbers", () => {
    const wrongCodeTypeFile = path.join(testTmpDir, "wrong_code_type_research.md");
    const wrongSpecTypeFile = path.join(testTmpDir, "wrong_spec_type_research.md");
    const missingLineFile = path.join(testTmpDir, "missing_line_research.md");
    const specOnlyFile = path.join(testTmpDir, "spec_only_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(wrongCodeTypeFile, validResearchFactsBody().replace("| F1 | code |", "| F1 | spec |"));
    writeResearchFixture(wrongSpecTypeFile, validResearchFactsBody().replace("| S1 | spec |", "| S1 | code |"));
    writeResearchFixture(missingLineFile, validResearchFactsBody().replace("`src/index.ts:42`", "`src/index.ts`"));
    writeResearchFixture(specOnlyFile, validResearchFactsBody()
      .replace("| R1 | confirmed | F1 | S1 | none |", "| R1 | not_applicable | not_applicable | S1 | none |")
      .replace("| SC1 | limited | F2 | none | Fixture criterion is partially evidenced. |\n", "")
      .replace("| F1 | code | `src/index.ts:42` | Current implementation routes approved changes. | R1 |\n", "")
      .replace("| F2 | code | `test/parser.test.ts:12` | Tests exercise parser behavior. | SC1 |\n", ""));

    expect(validateResearchFacts(wrongCodeTypeFile)).toContain("Source Facts row 3 with Fact ID `F1` must have Type `code`.");
    expect(validateResearchFacts(wrongSpecTypeFile)).toContain("Source Facts row 5 with Fact ID `S1` must have Type `spec`.");
    expect(validateResearchFacts(missingLineFile)).toContain("Source Facts row 3 Source must contain a path with a line number.");
    expect(validateResearchFacts(specOnlyFile)).toContain("Source Facts must include at least one `F#` code fact.");
  });

  test("validateResearchFacts requires Source Facts Supports to reference trace IDs", () => {
    const unknownSupportFile = path.join(testTmpDir, "unknown_support_research.md");
    const invalidSupportFile = path.join(testTmpDir, "invalid_support_research.md");
    const invalidSpecSupportFile = path.join(testTmpDir, "invalid_spec_support_research.md");
    cleanupTestDir();
    setupTestDir();
    writeResearchFixture(unknownSupportFile, validResearchFactsBody().replace("| F1 | code | `src/index.ts:42` | Current implementation routes approved changes. | R1 |", "| F1 | code | `src/index.ts:42` | Current implementation routes approved changes. | R99 |"));
    writeResearchFixture(invalidSupportFile, validResearchFactsBody().replace("| F1 | code | `src/index.ts:42` | Current implementation routes approved changes. | R1 |", "| F1 | code | `src/index.ts:42` | Current implementation routes approved changes. | Target state |"));
    writeResearchFixture(invalidSpecSupportFile, validResearchFactsBody().replace("| S1 | spec | `.phasedev/specs/flow/spec.md:8` | Existing spec describes flow routing. | R1 |", "| S1 | spec | `.phasedev/specs/flow/spec.md:8` | Existing spec describes flow routing. | none |"));

    expect(validateResearchFacts(unknownSupportFile)).toContain("Source Facts row 3 Supports references unknown trace ID `R99`.");
    expect(validateResearchFacts(invalidSupportFile)).toContain("Source Facts row 3 (F1) Supports must reference only `R#` or `SC#` IDs.");
    expect(validateResearchFacts(invalidSpecSupportFile)).toContain("Source Facts row 5 (S1) Supports must reference only `R#` or `SC#` IDs.");
  });

  function validDesignBody(): string {
    return `# Design

## Executive Summary

| Area | Decision |
|---|---|
| Approval scope | Approve the flow routing design contract. |
| Out of scope | Unrelated product behavior. |
| Key decision | D1 keeps flow routing grounded in approved artifacts. |
| Validation | Review evidence covers R1 and SC1. |

## Traceability Mapping

| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |
|---|---|---|---|---|
| R1 | F1, S1 | D1 | Route selection uses approved artifacts as the design boundary. | Plan phase must implement routing updates. |
| SC1 | F2 | D1 | Prompt rendering remains the observable success path. | Plan checks must verify prompt rendering. |

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

  test("validateDesign accepts valid design and rejects invalid ones", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(designFile, `---
approved: true
approved_by: tester
date: 2026-06-02
---
${validDesignBody()}
`, "utf-8");

    expect(validateDesign(designFile)).toEqual([]);

    const invalidDesignFile = path.join(testTmpDir, "invalid_design.md");
    fs.writeFileSync(invalidDesignFile, `# Design

## Executive Summary
Summary.

## Traceability Mapping
Trace.

## Architecture Package Map
No table here.

## Key Design Decisions
TBD.

## Contracts, Interfaces & Boundaries
Contracts.

## Risks & Open Questions
None.
`, "utf-8");

    const issues = validateDesign(invalidDesignFile);
    expect(issues).toContain("design.md must start with YAML frontmatter.");
    expect(issues).toContain("Section `## Architecture Package Map` must contain a markdown table.");
    expect(issues).toContain("design.md must not contain placeholder text: TBD.");
  });

  test("validateDesign rejects non-canonical package map headers", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(designFile, `---
approved: true
approved_by: tester
date: 2026-06-02
---
# Design

## Executive Summary
Summary details.

## Traceability Mapping
Trace details.

## Architecture Package Map
| Component | Target Files | Responsibility |
|---|---|---|
| auth | src/auth | handle authentication |

## Key Design Decisions
Decisions.

## Contracts, Interfaces & Boundaries
Schemas.

## Risks & Open Questions
None.
`, "utf-8");

    expect(validateDesign(designFile)).toContain("Architecture Package Map columns must be exactly: File, Purpose, Visual content, Review priority.");
  });

  test("validateDesign names empty table cells by section, row identity, and column", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    const prdFile = path.join(testTmpDir, "design_empty_cells_prd.md");
    const researchFile = path.join(testTmpDir, "design_empty_cells_research.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(prdFile, `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded. |
| Target state | Research traces concrete flow behavior. |
| Risk boundaries | No unrelated flow changes. |

## Requirements
| ID | Requirement |
|---|---|
| R1 | First requirement. |

## Success Criteria
| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | First criterion. | review |
`, "utf-8");
    writeResearchFixture(researchFile);
    fs.writeFileSync(designFile, `---
approved: true
approved_by: tester
date: 2026-06-02
---
${validDesignBody()
  .replace("| R1 | F1, S1 | D1 | Route selection uses approved artifacts as the design boundary. | Plan phase must implement routing updates. |", "| R1 | F1, S1 | D1 |  | Plan phase must implement routing updates. |")
  .replace("| `architecture/design.md` | Entry point and approval summary for this design package. | approval snapshot, traceability map, decision table | high |", "| `architecture/design.md` | Entry point and approval summary for this design package. |  | high |")}
`, "utf-8");

    const issues = validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile });
    expect(issues).toContain("Traceability Mapping row 4 (R1) has empty cell(s): Design Coverage.");
    expect(issues).toContain("Architecture Package Map row 3 (`architecture/design.md`) has empty cell(s): Visual content.");
    expect(issues).not.toContain("Traceability Mapping row 4 must not contain empty cells.");
    expect(issues).not.toContain("Architecture Package Map row 3 must not contain empty cells.");
  });

  test("validateDesign enforces package map file paths, priority, and file coverage", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(path.join(testTmpDir, "architecture", "unlisted-detail.md"), "# Detail\n", "utf-8");
    fs.writeFileSync(designFile, `---
approved: true
approved_by: tester
date: 2026-06-02
---
# Design

## Executive Summary
Summary details.

## Traceability Mapping
Trace details.

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point. | package map | high |
| architecture/Bad_Name.md | Detail. | table | urgent |
| docs/outside.md | Outside. | table | low |
| architecture/missing-detail.md | Missing. | table | medium |

## Key Design Decisions
Decisions.

## Contracts, Interfaces & Boundaries
Schemas.

## Risks & Open Questions
None.
`, "utf-8");

    const issues = validateDesign(designFile);
    expect(issues).toContain("Architecture Package Map file `architecture/Bad_Name.md` must use kebab-case for architecture subdocuments.");
    expect(issues).toContain("Architecture Package Map file `docs/outside.md` must start with `architecture/`.");
    expect(issues).toContain("Architecture Package Map file `architecture/missing-detail.md` must exist.");
    expect(issues).toContain("Architecture Package Map row 4 has invalid Review priority `urgent`; expected high, medium, or low.");
    expect(issues).toContain("Architecture file `architecture/unlisted-detail.md` must be listed in Architecture Package Map.");
  });

  test("validateDesign requires a visual review surface for multi-file design packages", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    const detailFile = path.join(testTmpDir, "architecture", "runtime-layout.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(detailFile, "# Runtime Layout\n", "utf-8");
    fs.writeFileSync(designFile, `---
approved: true
approved_by: tester
date: 2026-06-02
---
# Design

## Executive Summary
Summary details.

## Traceability Mapping
Trace details.

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point. | package map | high |
| \`architecture/runtime-layout.md\` | Runtime details. | diagram | medium |

## Key Design Decisions
Decisions.

## Contracts, Interfaces & Boundaries
Schemas.

## Risks & Open Questions
None.
`, "utf-8");

    expect(validateDesign(designFile)).toContain("Multi-file design packages must include a Mermaid block or markdown table outside `## Architecture Package Map`.");
  });

  test("validateDesign accepts multi-file design packages with a Mermaid review surface", () => {
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    const detailFile = path.join(testTmpDir, "architecture", "runtime-layout.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(detailFile, "# Runtime Layout\n", "utf-8");
    fs.writeFileSync(designFile, `---
approved: true
approved_by: tester
date: 2026-06-02
---
# Design

## Executive Summary
Summary details.

\`\`\`mermaid
flowchart TD
  A[Design entrypoint] --> B[Runtime layout]
\`\`\`

## Traceability Mapping
Trace details.

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point. | package map and Mermaid diagram | high |
| \`architecture/runtime-layout.md\` | Runtime details. | diagram | medium |

## Key Design Decisions
Decisions.

## Contracts, Interfaces & Boundaries
Schemas.

## Risks & Open Questions
None.
`, "utf-8");

    expect(validateDesign(designFile)).toEqual([]);
  });

  test("validateDesign enforces semantic traceability when PRD and research are provided", () => {
    const prdFile = path.join(testTmpDir, "design_trace_prd.md");
    const researchFile = path.join(testTmpDir, "design_trace_research.md");
    const designFile = path.join(testTmpDir, "architecture", "design.md");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.dirname(designFile), { recursive: true });
    fs.writeFileSync(prdFile, `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep routing decisions grounded. |
| Target state | Research traces concrete flow behavior. |
| Risk boundaries | No unrelated flow changes. |

## Requirements
| ID | Requirement |
|---|---|
| R1 | First requirement. |

## Success Criteria
| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | First criterion. | review |
`, "utf-8");
    writeResearchFixture(researchFile);
    fs.writeFileSync(designFile, `---
approved: false
date: 2026-06-02
---
${validDesignBody()}
`, "utf-8");

    expect(validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile })).toEqual([]);

    fs.writeFileSync(designFile, `---
approved: false
date: 2026-06-02
---
${validDesignBody().replace("| SC1 | F2 | D1 | Prompt rendering remains the observable success path. | Plan checks must verify prompt rendering. |\n", "")}
`, "utf-8");
    expect(validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile })).toContain("Traceability Mapping must include PRD ID `SC1`.");

    fs.writeFileSync(designFile, `---
approved: false
date: 2026-06-02
---
${validDesignBody().replace("| SC1 | F2 | D1 |", "| SC1 | F2 | D9 |")}
`, "utf-8");
    expect(validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile })).toContain("Traceability Mapping row 5 references unknown design decision `D9`.");

    const decisionRow = "| D1 | Keep routing driven by approved artifacts. | This preserves the positive PRD contract. | R1, SC1 | flow route, plan decomposition |";
    fs.writeFileSync(designFile, `---
approved: false
date: 2026-06-02
---
${validDesignBody().replace(decisionRow, `${decisionRow}\n${decisionRow}`)}
`, "utf-8");
    expect(validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile })).toContain("Key Design Decisions contains duplicate Decision ID `D1`.");

    fs.writeFileSync(designFile, `---
approved: false
date: 2026-06-02
---
${validDesignBody().replace("| R1 | F1, S1 | D1 |", "| R1 | F99 | D1 |")}
`, "utf-8");
    expect(validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile })).toContain("Traceability Mapping row 4 Research Evidence references unknown fact `F99`.");

    fs.writeFileSync(designFile, `---
approved: false
date: 2026-06-02
---
${validDesignBody().replace("| R1 | F1, S1 | D1 |", "| R1 | not_applicable | D1 |")}
`, "utf-8");
    expect(validateDesign(designFile, { prdPath: prdFile, researchPath: researchFile })).toContain("Traceability Mapping row 4 Research Evidence `not_applicable` must include a short reason in the same cell.");
  });

  test("parseValidationVerdict extracts correct validation statuses", () => {
    const fileReady = path.join(testTmpDir, "ready.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(fileReady, "---\nverdict: ready\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdict(fileReady)).toBe("ready");

    const fileReadyRisks = path.join(testTmpDir, "ready_risks.md");
    fs.writeFileSync(fileReadyRisks, "---\nverdict: ready_with_risks\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdict(fileReadyRisks)).toBe("ready_with_risks");

    const fileRepaired = path.join(testTmpDir, "repaired.md");
    fs.writeFileSync(fileRepaired, "---\nverdict: repaired\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdict(fileRepaired)).toBe("repaired");

    const fileRepair = path.join(testTmpDir, "repair.md");
    fs.writeFileSync(fileRepair, "---\nverdict: repair_required\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdict(fileRepair)).toBe("repair_required");

    const fileUnknown = path.join(testTmpDir, "unknown.md");
    fs.writeFileSync(fileUnknown, "---\nverdict: some_invalid_status\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdict(fileUnknown)).toBe("unknown");

    const nonexistentPath = path.join(testTmpDir, "nonexistent.md");
    expect(parseValidationVerdict(nonexistentPath)).toBe("unknown");
  });

  test("parseValidationVerdictType extracts correct validation types", () => {
    const filePhase = path.join(testTmpDir, "phase_type.md");
    fs.writeFileSync(filePhase, "---\nverdict: ready\ntype: iteration\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdictType(filePhase)).toBe("iteration");

    const fileFinal = path.join(testTmpDir, "final_type.md");
    fs.writeFileSync(fileFinal, "---\nverdict: ready\ntype: final\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdictType(fileFinal)).toBe("final");

    const fileUnknownType = path.join(testTmpDir, "unknown_type.md");
    fs.writeFileSync(fileUnknownType, "---\nverdict: ready\ntype: something_else\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdictType(fileUnknownType)).toBe("unknown");

    const nonexistentPath = path.join(testTmpDir, "nonexistent.md");
    expect(parseValidationVerdictType(nonexistentPath)).toBe("unknown");
  });

  test("parseValidationFindingsArtifact accepts a strict single findings table", () => {
    const findingsFile = path.join(testTmpDir, "findings_table.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Iteration 1 | API response omits required error handling. | Add error mapping. |
| F2 | open | RECOMMENDED | implementation | Phase 1 | Non-blocking naming note. | Rename in a follow-up. |
| F3 | resolved | MUST-FIX | design | Phase 2 | Design does not cover retry behavior. | Document retry behavior. |
`, "utf-8");

    const artifact = parseValidationFindingsArtifact(findingsFile);
    const findings = parseBlockingValidationFindings(findingsFile);

    expect(artifact.issues).toEqual([]);
    expect(artifact.openBlockingRows.map(row => row.id)).toEqual(["F1"]);
    expect(artifact.openNonBlockingRows.map(row => row.id)).toEqual(["F2"]);
    expect(findings).toEqual([
      {
        id: "F1",
        status: "open",
        severity: "MUST-FIX",
        className: "implementation",
        phase: "Iteration 1",
        finding: "API response omits required error handling.",
        requiredFix: "Add error mapping.",
        signature: "iteration|iteration 1|implementation|api response omits required error handling"
      },
      {
        id: "F3",
        status: "resolved",
        severity: "MUST-FIX",
        className: "design",
        phase: "Phase 2",
        finding: "Design does not cover retry behavior.",
        requiredFix: "Document retry behavior.",
        signature: "iteration|phase 2|design|design does not cover retry behavior"
      }
    ]);
  });

  test("parseValidationFindingsArtifact accepts an empty strict findings table", () => {
    const findingsFile = path.join(testTmpDir, "empty_findings_table.md");
    fs.writeFileSync(findingsFile, `---
verdict: ready
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
`, "utf-8");

    const artifact = parseValidationFindingsArtifact(findingsFile);

    expect(artifact.issues).toEqual([]);
    expect(artifact.rows).toEqual([]);
    expect(artifact.openBlockingRows).toEqual([]);
  });

  test("parseValidationFindingsArtifact rejects missing or extra strict tables", () => {
    const noTableFile = path.join(testTmpDir, "no_table.md");
    fs.writeFileSync(noTableFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

No markdown finding table here.
`, "utf-8");

    const twoTablesFile = path.join(testTmpDir, "two_tables.md");
    fs.writeFileSync(twoTablesFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Iteration 1 | API response omits required error handling. | Add error mapping. |

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F2 | open | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |
`, "utf-8");

    expect(parseValidationFindingsArtifact(noTableFile).issues.map(i => i.message)).toContain("validation_findings.md must contain exactly one markdown table, found 0.");
    expect(parseValidationFindingsArtifact(noTableFile).issues.map(i => i.message)).toContain("validation_findings.md may contain only YAML frontmatter and one findings table.");
    expect(parseValidationFindingsArtifact(twoTablesFile).issues.map(i => i.message)).toContain("validation_findings.md must contain exactly one markdown table, found 2.");
  });

  test("parseValidationFindingsArtifact rejects invalid table shape", () => {
    const invalidFile = path.join(testTmpDir, "invalid_table.md");
    fs.writeFileSync(invalidFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

| ID | Signal | Status | Class | Blocks PR? | Phase | Description |
|---|---|---|---|---|---|---|
| F1 | red | open | implementation | Yes | Iteration 1 | API response omits required error handling. |
`, "utf-8");

    const issues = parseValidationFindingsArtifact(invalidFile).issues.map(i => i.message);

    expect(issues).toContain("Findings table columns must be exactly: ID, Status, Severity, Class, Iteration, Finding, Required Fix.");
  });

  test("parseValidationFindingsArtifact rejects duplicate IDs and invalid strict values", () => {
    const invalidFile = path.join(testTmpDir, "invalid_values.md");
    fs.writeFileSync(invalidFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | bad | bad | implementation | Iteration 1 | API response omits required error handling. | Add error mapping. |
| F1 | open | MUST-FIX | unknown | Phase 1 | Duplicate ID. | Fix duplicate. |
`, "utf-8");

    const issues = parseValidationFindingsArtifact(invalidFile).issues.map(i => i.message);

    expect(issues).toContain("Finding F1 has invalid Status `bad`.");
    expect(issues).toContain("Finding F1 has invalid Severity `bad`.");
    expect(issues).toContain("Findings table contains duplicate ID `F1`.");
    expect(issues).toContain("Finding F1 has invalid Class `unknown`.");
  });

  test("parseValidationFindingsArtifact accepts validation class for insufficient review evidence", () => {
    const findingsFile = path.join(testTmpDir, "validation_class.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | validation | Final | Review evidence is insufficient to safely confirm the change set. | Repeat validation with concrete review evidence. |
`, "utf-8");

    const artifact = parseValidationFindingsArtifact(findingsFile);

    expect(artifact.issues).toEqual([]);
    expect(artifact.openBlockingRows[0]?.className).toBe("validation");
  });

  test("parseValidationFindingsArtifact accepts security and code review classes", () => {
    const findingsFile = path.join(testTmpDir, "review_classes.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | security | Final | State-changing endpoint lacks an authorization check. | Add authorization before mutation. |
| F2 | open | MUST-FIX | code_review | Final | Error path can throw before returning the expected blocker prompt. | Handle the error path before returning. |
`, "utf-8");

    const artifact = parseValidationFindingsArtifact(findingsFile);

    expect(artifact.issues).toEqual([]);
    expect(artifact.openBlockingRows.map(row => row.className)).toEqual(["security", "code_review"]);
  });

  test("parseValidationFindingsArtifact requires every security finding to be MUST-FIX", () => {
    const findingsFile = path.join(testTmpDir, "security_not_must_fix.md");
    fs.writeFileSync(findingsFile, `---
verdict: ready_with_risks
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | RECOMMENDED | security | Final | State-changing endpoint has a defense-in-depth auth concern. | Harden authorization. |
| F2 | resolved | NIT | security | Final | Resolved secret handling note was classified as a nit. | Keep resolved security rows classified as MUST-FIX. |
`, "utf-8");

    const issues = parseValidationFindingsArtifact(findingsFile).issues.map(i => i.message);

    expect(issues).toContain("Finding F1 has Class `security`; security findings must use Severity `MUST-FIX`.");
    expect(issues).toContain("Finding F2 has Class `security`; security findings must use Severity `MUST-FIX`.");
  });

  test("parseValidationFindingsArtifact validates verdict consistency from severity", () => {
    const readyRisksBlockingFile = path.join(testTmpDir, "ready_risks_blocking.md");
    fs.writeFileSync(readyRisksBlockingFile, `---
verdict: ready_with_risks
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Final | Broken final check. | Repair final check. |
`, "utf-8");

    const repairWithoutBlockingFile = path.join(testTmpDir, "repair_without_blocking.md");
    fs.writeFileSync(repairWithoutBlockingFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | RECOMMENDED | implementation | Final | Minor follow-up. | Track as follow-up. |
`, "utf-8");

    expect(parseValidationFindingsArtifact(readyRisksBlockingFile).issues.map(i => i.message)).toContain("`verdict: ready_with_risks` is not allowed while open or reopened MUST-FIX findings exist.");
    expect(parseValidationFindingsArtifact(repairWithoutBlockingFile).issues.map(i => i.message)).toContain("`verdict: repair_required` requires at least one open or reopened MUST-FIX finding.");
  });

  test("parseValidationFindingsArtifact assigns typed issue codes for verdict/open-findings conflicts", () => {
    const readyWithOpenFile = path.join(testTmpDir, "ready_with_open.md");
    fs.writeFileSync(readyWithOpenFile, `---
verdict: ready
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | RECOMMENDED | implementation | Final | Minor follow-up. | Track as follow-up. |
`, "utf-8");

    const readyRisksBlockingFile = path.join(testTmpDir, "ready_risks_blocking_code.md");
    fs.writeFileSync(readyRisksBlockingFile, `---
verdict: ready_with_risks
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Final | Broken final check. | Repair final check. |
`, "utf-8");

    const repairedBlockingFile = path.join(testTmpDir, "repaired_blocking_code.md");
    fs.writeFileSync(repairedBlockingFile, `---
verdict: repaired
type: iteration
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Iteration 1 | Broken check. | Repair check. |
`, "utf-8");

    expect(parseValidationFindingsArtifact(readyWithOpenFile).issues.map(i => i.code)).toContain("verdict_ready_with_open_findings");
    expect(parseValidationFindingsArtifact(readyRisksBlockingFile).issues.map(i => i.code)).toContain("verdict_ready_with_risks_with_open_blocking");
    expect(parseValidationFindingsArtifact(repairedBlockingFile).issues.map(i => i.code)).toContain("verdict_repaired_with_open_blocking");
  });

  test("parseBlockingValidationFindings ignores IDs and status when building signatures", () => {
    const findingsFile = path.join(testTmpDir, "changed_ids.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F7 | reopened | MUST-FIX | implementation | Final | reopened/regression: API response omits required error handling!!! | Restore the error handling fix. |
`, "utf-8");

    const findings = parseBlockingValidationFindings(findingsFile);

    expect(findings).toHaveLength(1);
    expect(findings[0].signature).toBe("final|final|implementation|api response omits required error handling");
  });

  test("parseBlockingValidationFindings normalizes reopened prefix and hyphen variants", () => {
    const findingsFile = path.join(testTmpDir, "hyphen_variants.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F7 | reopened | MUST-FIX | implementation | Phase 1 | reopened/regression: API-response omits required error-handling!!! | Restore the error handling fix. |
`, "utf-8");

    const findings = parseBlockingValidationFindings(findingsFile);

    expect(findings).toHaveLength(1);
    expect(findings[0].signature).toBe("iteration|phase 1|implementation|api response omits required error handling");
  });

  test("parseBlockingValidationFindings keeps escaped pipes inside descriptions", () => {
    const findingsFile = path.join(testTmpDir, "escaped_pipe.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: iteration
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Phase 1 | Type guard misses \`A \\| B\` response. | Add union response coverage. |
`, "utf-8");

    const findings = parseBlockingValidationFindings(findingsFile);

    expect(findings).toHaveLength(1);
    expect(findings[0].finding).toBe("Type guard misses `A | B` response.");
    expect(findings[0].signature).toBe("iteration|phase 1|implementation|type guard misses a b response");
  });

  test("parseCurrentValidationFindings returns current strict registry rows", () => {
    const findingsFile = path.join(testTmpDir, "current_findings.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | resolved | MUST-FIX | implementation | Iteration 1 | API response omits required error handling. | Keep the error mapping fix. |
| F2 | open | RECOMMENDED | implementation | Final | Non-blocking naming note. | Rename in a follow-up. |
| F3 | reopened | MUST-FIX | test | Final | reopened/regression: Missing auth failure coverage!!! | Add auth failure coverage. |
`, "utf-8");

    const findings = parseCurrentValidationFindings(findingsFile);

    expect(findings).toEqual([
      {
        id: "F1",
        signature: "iteration|iteration 1|implementation|api response omits required error handling",
        latestStatus: "resolved",
        severity: "MUST-FIX",
        className: "implementation",
        blocksPr: true,
        phase: "Iteration 1",
        canonicalFinding: "API response omits required error handling.",
        requiredFix: "Keep the error mapping fix.",
        latestEvidence: "API response omits required error handling."
      },
      {
        id: "F2",
        signature: "final|final|implementation|non blocking naming note",
        latestStatus: "open",
        severity: "RECOMMENDED",
        className: "implementation",
        blocksPr: false,
        phase: "Final",
        canonicalFinding: "Non-blocking naming note.",
        requiredFix: "Rename in a follow-up.",
        latestEvidence: "Non-blocking naming note."
      },
      {
        id: "F3",
        signature: "final|final|test|missing auth failure coverage",
        latestStatus: "reopened",
        severity: "MUST-FIX",
        className: "test",
        blocksPr: true,
        phase: "Final",
        canonicalFinding: "Missing auth failure coverage!!!",
        requiredFix: "Add auth failure coverage.",
        latestEvidence: "reopened/regression: Missing auth failure coverage!!!"
      }
    ]);
  });

  test("parseTestCommands extracts unit, phase, and full commands from rules markdown", () => {
    const rulesFile = path.join(testTmpDir, "execution_contract.md");
    fs.writeFileSync(rulesFile, `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test test/parser.test.ts\` |
| phase | \`bun test\` |
| full | bun test && bun run typecheck |

## Other Rules
- Keep changes scoped.
`, "utf-8");

    const commands = parseTestCommands(rulesFile);

    expect(commands.commands.unit).toBe("bun test test/parser.test.ts");
    expect(commands.commands.phase).toBe("bun test");
    expect(commands.commands.full).toBe("bun test && bun run typecheck");
    expect(commands.missing).toEqual([]);
  });

  test("parseTestCommands reports missing commands", () => {
    const rulesFile = path.join(testTmpDir, "rules_missing.md");
    fs.writeFileSync(rulesFile, `
# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | bun test |
`, "utf-8");

    const commands = parseTestCommands(rulesFile);

    expect(commands.commands.unit).toBe("bun test");
    expect(commands.commands.phase).toBeUndefined();
    expect(commands.commands.full).toBeUndefined();
    expect(commands.missing).toEqual(["phase", "full"]);
  });

  test("validateRulesArtifact enforces strict rules contract", () => {
    const validRulesFile = path.join(testTmpDir, "valid_execution_contract.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(validRulesFile, `---
approved: true
date: 2026-06-02
---
# Rules

## Test Commands

| Gate | Command |
|---|---|
| unit | \`bun test test/parser.test.ts\` |
| phase | \`bun test test/controller.test.ts\` |
| full | \`bun test\` |

## Constraints
None.

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`, "utf-8");

    expect(validateRulesArtifact(validRulesFile)).toEqual([]);

    const invalidRulesFile = path.join(testTmpDir, "invalid_execution_contract.md");
    fs.writeFileSync(invalidRulesFile, `# Rules

<!-- leftover -->

## Test Commands

| Gate | Command |
|---|---|
| unit | \`bun test\` |
| full | TODO |
| phase |  |
| extra | nope |

## Constraints
None.

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.

## Notes
Not allowed.
`, "utf-8");

    const issues = validateRulesArtifact(invalidRulesFile);
    expect(issues).toContain("execution_contract.md must start with YAML frontmatter.");
    expect(issues).toContain("execution_contract.md must not contain HTML template comments.");
    expect(issues).toContain("execution_contract.md must not contain placeholder text: TODO.");
    expect(issues).toContain("execution_contract.md contains unexpected section `## Notes`.");
    expect(issues).toContain("Test Commands must contain exactly these gates in order: `unit`, `phase`, `full`.");
    expect(issues).toContain("Test Commands command `phase` must be non-empty.");
    expect(issues).toContain("Test Commands gate `extra` is not allowed; expected unit, phase, or full.");

    const extraTextRulesFile = path.join(testTmpDir, "extra_text_execution_contract.md");
    fs.writeFileSync(extraTextRulesFile, `---
approved: true
date: 2026-06-02
---
# Rules

## Test Commands

Use the local Bun commands below.
| Gate | Command |
|---|---|
| unit | \`bun test test/parser.test.ts\` |
| phase | \`bun test test/controller.test.ts\` |
| full | \`bun test\` |

## Constraints
None.

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`, "utf-8");

    expect(validateRulesArtifact(extraTextRulesFile)).toEqual([]);
  });

  test("validateExecutionContract ignores a ## Constraints heading inside a fenced code block", () => {
    setupTestDir();
    const contractFile = path.join(testTmpDir, "fenced_only_execution_contract.md");
    fs.writeFileSync(contractFile, `# Rules

Example of a section you should NOT include verbatim:

\`\`\`markdown
## Constraints
Fenced example only, not a real section.
\`\`\`

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`, "utf-8");

    const result = validateExecutionContract(contractFile);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("execution_contract.md is missing required section: ## Constraints.");
  });

  test("extractRequirementsAndCriteriaFromPrd ignores requirement IDs inside fenced code blocks", () => {
    setupTestDir();
    const prdFile = path.join(testTmpDir, "fenced_ids_prd.md");
    fs.writeFileSync(prdFile, `# PRD

## Requirements

| ID | Requirement |
|---|---|
| R1 | Real requirement. |

Example table format:

\`\`\`markdown
| ID | Requirement |
|---|---|
| R2 | Fenced example only, not a real requirement. |
\`\`\`

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Real criterion. | unit |
`, "utf-8");

    const { requirements, criteria } = extractRequirementsAndCriteriaFromPrd(prdFile);
    expect(requirements).toEqual(["R1"]);
    expect(criteria).toEqual(["SC1"]);
  });

  test("findActiveChangeDir ignores archive directory when selecting active change", () => {
    const changesDir = path.join(testTmpDir, ".phasedev", "changes");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.join(changesDir, "archive"), { recursive: true });
    fs.mkdirSync(path.join(changesDir, "sample-change"), { recursive: true });

    expect(findActiveChangeDir(testTmpDir)).toBe(path.join(changesDir, "sample-change"));
  });

  test("findActiveChangeDir throws error when multiple active changes exist", () => {
    const changesDir = path.join(testTmpDir, ".phasedev", "changes");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.join(changesDir, "change-1"), { recursive: true });
    fs.mkdirSync(path.join(changesDir, "change-2"), { recursive: true });

    expect(() => findActiveChangeDir(testTmpDir)).toThrow("Multiple active changes found in .phasedev/changes");
  });

  test("findActiveChangeDir propagates unrelated filesystem errors instead of masking them as null", () => {
    const changesDir = path.join(testTmpDir, ".phasedev", "changes");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(changesDir, { recursive: true });

    const originalReaddirSync = fs.readdirSync;
    const spy = spyOn(fs, "readdirSync").mockImplementation((...args: Parameters<typeof fs.readdirSync>) => {
      if (args[0] === changesDir) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      }
      return originalReaddirSync(...args);
    });

    try {
      expect(() => findActiveChangeDir(testTmpDir)).toThrow("EACCES");
    } finally {
      spy.mockRestore();
    }
  });

  afterAll(() => {
    cleanupTestDir();
  });
});
