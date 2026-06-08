import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { findActiveChangeDir } from "../src/entities/flow-change/active-change";
import { parsePlan } from "../src/entities/implementation-plan/parse-plan";
import { validatePlanArtifact } from "../src/entities/implementation-plan/validate-plan-artifact";
import { validatePlanStructure } from "../src/entities/implementation-plan/validate-plan";
import { validatePrdArtifact } from "../src/entities/prd/validate-prd";
import { validateResearchFacts } from "../src/entities/research-facts/validate-research";
import { validateRulesArtifact } from "../src/entities/rules/validate-rules";
import { validateDesign } from "../src/entities/design/validate-design";
import { parseTestCommands } from "../src/entities/test-commands/parse-test-commands";
import { parseBlockingValidationFindings, parseCurrentValidationFindings, parseValidationFindingsArtifact, parseValidationVerdict, parseValidationVerdictType } from "../src/entities/validation-findings/parse-validation-findings";
import { isApproved } from "../src/shared/markdown/frontmatter";
import { normalizeLineEndings } from "../src/shared/markdown/normalize-line-endings";

const testTmpDir = path.resolve(__dirname, "..", "test-temp");

function setupTestDir() {
  if (!fs.existsSync(testTmpDir)) {
    fs.mkdirSync(testTmpDir, { recursive: true });
  }
}

function cleanupTestDir() {
  if (fs.existsSync(testTmpDir)) {
    fs.rmSync(testTmpDir, { recursive: true, force: true });
  }
}

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

  test("parsePlan extracts phases and task list statuses correctly", () => {
    const planFile = path.join(testTmpDir, "plan.md");
    const planContent = `
# Plan

## Phase 1: Database Setup [x]
- [x] 1.1 Create migration
- [x] 1.2 Create user model

## Phase 2: Core Auth APIs [~]
- [x] 2.1 Implement signup handler
  - [x] 2.1.1 Add validation
- [ ] 2.2 Implement login handler
- [ ] 2.3 Add JWT middleware

## Phase 3: UI [ ]
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

  test("parsePlan extracts optional phase additional checks", () => {
    const planFile = path.join(testTmpDir, "plan_checks.md");
    const planContent = `
# Plan

## Phase 1: API [~]
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

## Phase 1: Prompt Updates [~]

### Goal

Update prompts.

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

  test("validatePlanStructure enforces generation bundle and check evidence contract for parsed plans", () => {
    const invalidPlanFile = path.join(testTmpDir, "invalid_plan_contract.md");
    fs.writeFileSync(invalidPlanFile, `
# Plan

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | maybe |  |
| Tests | yes | Add tests. |

## Phase 1: Prompt Updates [~]

### Goal

Update prompts.

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
    expect(issues).toContain("Phase 1: Prompt Updates Check Evidence row 1 has an empty Command Or Method.");
    expect(issues).toContain("Phase 1: Prompt Updates Check Evidence row 1 with Result `passed` must have non-empty Evidence.");
    expect(issues).toContain("Phase 1: Prompt Updates Check Evidence row 2 has invalid Result `unknown`; expected pending, passed, failed, blocked, or not_applicable.");
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

## Phase Overview

| Phase | Goal | Main work items | Required checks |
|---|---|---|---|
| Phase 1 | Update prompts. | 1.1 | unit |

## Phase 1: Prompt Updates [~]

### Goal

Update prompts.

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

## Phase 1: Prompt Updates [~]
- [x] 1.1 Update setup prompt
`, "utf-8");

    const issues = validatePlanArtifact(invalidPlanFile);
    expect(issues).toContain("implementation_plan.md must not contain HTML template comments.");
    expect(issues).toContain("implementation_plan.md must not contain placeholder text: TODO.");
    expect(issues).toContain("implementation_plan.md must contain exactly one top-level heading: `# Implementation Plan`.");
    expect(issues).toContain("implementation_plan.md contains unexpected section `## Notes`.");
    expect(issues).toContain("implementation_plan.md non-phase `##` sections must exactly match this order: `## Approval Summary`, `## Generation Bundle`, `## Phase Overview`.");
    expect(issues).toContain("Section `## Approval Summary` must contain a markdown table.");
    expect(issues).toContain("Section `## Phase Overview` must contain a markdown table.");
  });

  test("validatePlanStructure rejects empty and malformed phase plans", () => {
    expect(validatePlanStructure([])).toContain("implementation_plan.md must contain at least one phase heading.");

    const issues = validatePlanStructure([
      { id: 1, name: "API", status: "completed", tasks: [{ id: "1.1", name: "Implement endpoint", status: "not_started", children: [] }], additionalChecks: [] },
      { id: 1, name: "UI", status: "in_progress", tasks: [], additionalChecks: [] },
      { id: 3, name: "Docs", status: "in_progress", tasks: [{ id: "3.1", name: "Update docs", status: "completed", children: [] }], additionalChecks: [] }
    ]);

    expect(issues).toContain("Phase numbers must be unique; duplicate phase id(s): 1.");
    expect(issues).toContain("Phase numbers must be sequential starting at 1.");
    expect(issues).toContain("Phase 1: API is [x] but contains incomplete tasks.");
    expect(issues).toContain("Phase 1: UI must contain at least one task checkbox.");
    expect(issues).toContain("Only one phase may have [~] status at a time; active phases: Phase 1: UI, Phase 3: Docs.");
  });

  test("validatePlanStructure rejects empty phase names", () => {
    const issues = validatePlanStructure([
      { id: 1, name: "", status: "not_started", tasks: [{ id: "1.1", name: "Implement prompt", status: "not_started", children: [] }], additionalChecks: [] }
    ]);

    expect(issues).toContain("Phase 1 must have a non-empty name.");
  });

  test("validatePlanStructure rejects unstarted phases containing completed tasks or non-pending evidence", () => {
    const issues = validatePlanStructure([
      {
        id: 1,
        name: "API",
        status: "not_started",
        tasks: [
          { id: "1.1", name: "Task 1", status: "completed", children: [] }
        ],
        additionalChecks: [],
        rawContent: "### Goal\nGoal\n### Tasks\n- [x] 1.1 Task 1\n### Checks\nchecks\n### Check Evidence\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | cmd | passed | ok | none |\n",
        checkEvidence: [
          { check: "unit", commandOrMethod: "cmd", result: "passed", evidence: "ok", notes: "none" }
        ]
      }
    ]);

    expect(issues).toContain("Phase 1: API is not started [ ] but contains completed tasks: 1.1.");
    expect(issues).toContain("Phase 1: API is not started [ ] but contains non-pending evidence results.");
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
- R1: Require auth
- R2: Require log
## Success Criteria
- SC1: Auth is tested
- SC2: Log is tested
`, "utf-8");

    const phases = [
      {
        id: 1,
        name: "Auth",
        status: "in_progress",
        tasks: [{ id: "1.1", name: "Implement auth", status: "not_started", children: [] }],
        additionalChecks: [],
        rawContent: "### Goal\nGoal\n### Tasks\n- [ ] 1.1 Implement auth (implements R1)\n### Checks\nunit\n### Check Evidence\n| Check | Command Or Method | Result | Evidence | Notes |\n|---|---|---|---|---|\n| unit | cmd | pending | | | /* verifies SC1 */\n"
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
    ]);

    expect(issues).toContain("Phase 1: API has a task without a numbered ID: Missing task id.");
    expect(issues).toContain("Task 2.1 must start with phase number 1.");
    expect(issues).toContain("Task 1.2 is [x] but contains incomplete subtasks.");
    expect(issues).toContain("Task IDs must be unique; duplicate task id `1.2` in Phase 1: API and Phase 1: API.");
    expect(issues).toContain("Phase 1: API is [x] but contains incomplete tasks.");
  });

  test("validatePrdArtifact accepts required PRD Intent Card contract", () => {
    const prdFile = path.join(testTmpDir, "valid_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
approved_by: "tester"
date: 2026-06-02
---

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep routing decisions grounded in approved requirements. |
| Generation target | Update flow prompts and validation gates. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | No behavior outside flow prompt routing changes. |

## Approval Summary

Approve the flow contract update.

## Requirements

- R1: PRD must include Intent Card.

## Scope Boundaries

- In scope: flow prompts.
- Out of scope: product code changes.

## Success Criteria

- SC1: Downstream stages consume PRD intent.

## Accepted Assumptions

None.

## Deferred Decisions

None.
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

## Intent Card

| Field | Value |
|---|---|
| Change type | bug |
| User or business intent |  |
| Generation target | not_applicable |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope |  |

## Requirements
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("prd.md must not contain HTML template comments.");
    expect(issues).toContain("prd.md must contain section `## Scope Boundaries`.");
    expect(issues).toContain("Intent Card field `Change type` must be one of: feature, fix, refactor, infra, experiment.");
    expect(issues).toContain("Intent Card field `User or business intent` must be present and non-empty.");
    expect(issues).toContain("Intent Card field `Risk envelope` must be present and non-empty.");
    expect(issues).toContain("Intent Card field `Generation target` must not be not_applicable.");
    expect(issues).toContain("Section `## Requirements` must not be empty.");
  });

  test("validatePrdArtifact rejects unexpected PRD sections", () => {
    const prdFile = path.join(testTmpDir, "unexpected_section_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep routing decisions grounded in approved requirements. |
| Generation target | Update flow prompts and validation gates. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | No behavior outside flow prompt routing changes. |

## Approval Summary

Approve the flow contract update.

## Requirements

- R1: PRD must include Intent Card.

## Notes

Extra notes are not allowed as a PRD section.

## Scope Boundaries

- In scope: flow prompts.
- Out of scope: product code changes.

## Success Criteria

- SC1: Downstream stages consume PRD intent.

## Accepted Assumptions

None.

## Deferred Decisions

None.
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("prd.md contains unexpected section `## Notes`.");
    expect(issues).toContain("prd.md `##` sections must exactly match this order: `## Intent Card`, `## Approval Summary`, `## Requirements`, `## Scope Boundaries`, `## Success Criteria`, `## Accepted Assumptions`, `## Deferred Decisions`.");
  });

  test("validatePrdArtifact rejects hidden deeper PRD sections", () => {
    const prdFile = path.join(testTmpDir, "deep_heading_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep routing decisions grounded in approved requirements. |
| Generation target | Update flow prompts and validation gates. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | No behavior outside flow prompt routing changes. |

## Approval Summary

Approve the flow contract update.

## Requirements

- R1: PRD must include Intent Card.

### Risks

Hidden section.

## Scope Boundaries

- In scope: flow prompts.
- Out of scope: product code changes.

## Success Criteria

- SC1: Downstream stages consume PRD intent.

## Accepted Assumptions

None.

## Deferred Decisions

None.
`, "utf-8");

    expect(validatePrdArtifact(prdFile)).toContain("prd.md must not contain headings deeper than `##`: `### Risks`.");
  });

  test("validatePrdArtifact rejects extra Intent Card rows", () => {
    const prdFile = path.join(testTmpDir, "extra_intent_row_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep routing decisions grounded in approved requirements. |
| Generation target | Update flow prompts and validation gates. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | No behavior outside flow prompt routing changes. |
| Extra | Not allowed. |

## Approval Summary

Approve the flow contract update.

## Requirements

- R1: PRD must include Intent Card.

## Scope Boundaries

- In scope: flow prompts.
- Out of scope: product code changes.

## Success Criteria

- SC1: Downstream stages consume PRD intent.

## Accepted Assumptions

None.

## Deferred Decisions

None.
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("Intent Card field `Extra` is not allowed.");
    expect(issues).toContain("Intent Card fields must exactly match this order: `Change type`, `User or business intent`, `Generation target`, `Resolution signal`, `Decision deadline`, `Risk envelope`.");
  });

  test("validatePrdArtifact rejects missing requirement ids, success ids, and scope labels", () => {
    const prdFile = path.join(testTmpDir, "missing_ids_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep routing decisions grounded in approved requirements. |
| Generation target | Update flow prompts and validation gates. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | No behavior outside flow prompt routing changes. |

## Approval Summary

Approve the flow contract update.

## Requirements

- PRD must include Intent Card.

## Scope Boundaries

- Flow prompts only.

## Success Criteria

- Downstream stages consume PRD intent.

## Accepted Assumptions

None.

## Deferred Decisions

None.
`, "utf-8");

    const issues = validatePrdArtifact(prdFile);
    expect(issues).toContain("Section `## Requirements` must contain at least one requirement item like `R1: ...`.");
    expect(issues).toContain("Section `## Success Criteria` must contain at least one success criterion item like `SC1: ...`.");
    expect(issues).toContain("Section `## Scope Boundaries` must contain `In scope:`.");
    expect(issues).toContain("Section `## Scope Boundaries` must contain `Out of scope:`.");
  });

  test("validatePrdArtifact rejects placeholder text", () => {
    const prdFile = path.join(testTmpDir, "placeholder_prd.md");
    fs.writeFileSync(prdFile, `---
approved: true
date: 2026-06-02
---

# PRD

## Intent Card

| Field | Value |
|---|---|
| Change type | fix |
| User or business intent | Keep routing decisions grounded in approved requirements. |
| Generation target | Update flow prompts and validation gates. |
| Resolution signal | not_applicable |
| Decision deadline | not_applicable |
| Risk envelope | No behavior outside flow prompt routing changes. |

## Approval Summary

Approve the flow contract update.

## Requirements

- R1: PRD must include Intent Card.

## Scope Boundaries

- In scope: flow prompts.
- Out of scope: product code changes.

## Success Criteria

- SC1: TODO.

## Accepted Assumptions

None.

## Deferred Decisions

None.
`, "utf-8");

    expect(validatePrdArtifact(prdFile)).toContain("prd.md must not contain placeholder text: TODO.");
  });

  test("validateResearchFacts accepts valid research facts and rejects invalid ones", () => {
    const researchFile = path.join(testTmpDir, "valid_research.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(researchFile, `# Research Facts

## PRD Intent Trace
Trace details here.

## Requirements & Success Criteria Trace

| ID | Status | Evidence | Gaps/Blockers |
|---|---|---|---|
| R1 | confirmed | Requirement traced. | none |
| SC1 | confirmed | Success criterion traced. | none |

## Source Facts
- \`src/index.ts:42\` -- verified fact.

## Research Gaps & Blockers
No blockers.
`, "utf-8");

    expect(validateResearchFacts(researchFile)).toEqual([]);

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
    expect(issues).toContain("Section `## Source Facts` must contain at least one file path with a line number in the format `file:line` (e.g., `src/index.ts:42`).");
    expect(issues).toContain("research_facts.md must not contain placeholder text: TODO.");
    expect(issues).toContain("Section `## Requirements & Success Criteria Trace` must contain a markdown table.");
  });

  test("validateResearchFacts requires complete PRD trace IDs exactly once", () => {
    const prdFile = path.join(testTmpDir, "research_trace_prd.md");
    const researchFile = path.join(testTmpDir, "research_trace.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(prdFile, `# PRD

## Requirements
- R1: First requirement.
- R2: Second requirement.

## Success Criteria
- SC1: First criterion.
- SC2: Second criterion.
`, "utf-8");
    fs.writeFileSync(researchFile, `# Research Facts

## PRD Intent Trace
Trace details here.

## Requirements & Success Criteria Trace

| ID | Status | Evidence | Gaps/Blockers |
|---|---|---|---|
| R1 | confirmed | First requirement traced. | none |
| R1 | confirmed | Duplicate requirement traced. | none |
| SC1 | confirmed | First criterion traced. | none |
| SC3 | confirmed | Extra criterion traced. | none |

## Source Facts
- \`src/index.ts:42\` -- verified fact.

## Research Gaps & Blockers
No blockers.
`, "utf-8");

    const issues = validateResearchFacts(researchFile, prdFile);
    expect(issues).toContain("Requirements & Success Criteria Trace contains duplicate ID `R1`.");
    expect(issues).toContain("Requirements & Success Criteria Trace must include PRD ID `R2`.");
    expect(issues).toContain("Requirements & Success Criteria Trace must include PRD ID `SC2`.");
    expect(issues).toContain("Requirements & Success Criteria Trace contains unexpected ID `SC3`.");
  });

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
# Design

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

## Database Schemas & API Contracts
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

## Database Schemas & API Contracts
Schemas.

## Risks & Open Questions
None.
`, "utf-8");

    expect(validateDesign(designFile)).toContain("Architecture Package Map columns must be exactly: File, Purpose, Visual content, Review priority.");
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

## Database Schemas & API Contracts
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

## Database Schemas & API Contracts
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

## Database Schemas & API Contracts
Schemas.

## Risks & Open Questions
None.
`, "utf-8");

    expect(validateDesign(designFile)).toEqual([]);
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
    fs.writeFileSync(filePhase, "---\nverdict: ready\ntype: phase\ndate: 2026-05-28\n---\n", "utf-8");
    expect(parseValidationVerdictType(filePhase)).toBe("phase");

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
type: phase
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |
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
        phase: "Phase 1",
        finding: "API response omits required error handling.",
        requiredFix: "Add error mapping.",
        signature: "phase|phase 1|implementation|api response omits required error handling"
      },
      {
        id: "F3",
        status: "resolved",
        severity: "MUST-FIX",
        className: "design",
        phase: "Phase 2",
        finding: "Design does not cover retry behavior.",
        requiredFix: "Document retry behavior.",
        signature: "phase|phase 2|design|design does not cover retry behavior"
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

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
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
type: phase
date: 2026-05-30
---

No markdown finding table here.
`, "utf-8");

    const twoTablesFile = path.join(testTmpDir, "two_tables.md");
    fs.writeFileSync(twoTablesFile, `---
verdict: repair_required
type: phase
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F2 | open | MUST-FIX | test | Phase 1 | Missing regression coverage. | Add regression coverage. |
`, "utf-8");

    expect(parseValidationFindingsArtifact(noTableFile).issues).toContain("validation_findings.md must contain exactly one markdown table, found 0.");
    expect(parseValidationFindingsArtifact(noTableFile).issues).toContain("validation_findings.md may contain only YAML frontmatter and one findings table.");
    expect(parseValidationFindingsArtifact(twoTablesFile).issues).toContain("validation_findings.md must contain exactly one markdown table, found 2.");
  });

  test("parseValidationFindingsArtifact rejects invalid table shape", () => {
    const invalidFile = path.join(testTmpDir, "invalid_table.md");
    fs.writeFileSync(invalidFile, `---
verdict: repair_required
type: phase
date: 2026-05-30
---

| ID | Signal | Status | Class | Blocks PR? | Phase | Description |
|---|---|---|---|---|---|---|
| F1 | red | open | implementation | Yes | Phase 1 | API response omits required error handling. |
`, "utf-8");

    const issues = parseValidationFindingsArtifact(invalidFile).issues;

    expect(issues).toContain("Findings table columns must be exactly: ID, Status, Severity, Class, Phase, Finding, Required Fix.");
  });

  test("parseValidationFindingsArtifact rejects duplicate IDs and invalid strict values", () => {
    const invalidFile = path.join(testTmpDir, "invalid_values.md");
    fs.writeFileSync(invalidFile, `---
verdict: repair_required
type: phase
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | bad | bad | implementation | Phase 1 | API response omits required error handling. | Add error mapping. |
| F1 | open | MUST-FIX | unknown | Phase 1 | Duplicate ID. | Fix duplicate. |
`, "utf-8");

    const issues = parseValidationFindingsArtifact(invalidFile).issues;

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

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | validation | Final | Review evidence is insufficient to safely confirm the change set. | Repeat validation with concrete review evidence. |
`, "utf-8");

    const artifact = parseValidationFindingsArtifact(findingsFile);

    expect(artifact.issues).toEqual([]);
    expect(artifact.openBlockingRows[0]?.className).toBe("validation");
  });

  test("parseValidationFindingsArtifact validates verdict consistency from severity", () => {
    const readyRisksBlockingFile = path.join(testTmpDir, "ready_risks_blocking.md");
    fs.writeFileSync(readyRisksBlockingFile, `---
verdict: ready_with_risks
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Final | Broken final check. | Repair final check. |
`, "utf-8");

    const repairWithoutBlockingFile = path.join(testTmpDir, "repair_without_blocking.md");
    fs.writeFileSync(repairWithoutBlockingFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | RECOMMENDED | implementation | Final | Minor follow-up. | Track as follow-up. |
`, "utf-8");

    expect(parseValidationFindingsArtifact(readyRisksBlockingFile).issues).toContain("`verdict: ready_with_risks` is not allowed while open or reopened MUST-FIX findings exist.");
    expect(parseValidationFindingsArtifact(repairWithoutBlockingFile).issues).toContain("`verdict: repair_required` requires at least one open or reopened MUST-FIX finding.");
  });

  test("parseBlockingValidationFindings ignores IDs and status when building signatures", () => {
    const findingsFile = path.join(testTmpDir, "changed_ids.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
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
type: phase
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F7 | reopened | MUST-FIX | implementation | Phase 1 | reopened/regression: API-response omits required error-handling!!! | Restore the error handling fix. |
`, "utf-8");

    const findings = parseBlockingValidationFindings(findingsFile);

    expect(findings).toHaveLength(1);
    expect(findings[0].signature).toBe("phase|phase 1|implementation|api response omits required error handling");
  });

  test("parseBlockingValidationFindings keeps escaped pipes inside descriptions", () => {
    const findingsFile = path.join(testTmpDir, "escaped_pipe.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: phase
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | MUST-FIX | implementation | Phase 1 | Type guard misses \`A \\| B\` response. | Add union response coverage. |
`, "utf-8");

    const findings = parseBlockingValidationFindings(findingsFile);

    expect(findings).toHaveLength(1);
    expect(findings[0].finding).toBe("Type guard misses `A | B` response.");
    expect(findings[0].signature).toBe("phase|phase 1|implementation|type guard misses a b response");
  });

  test("parseCurrentValidationFindings returns current strict registry rows", () => {
    const findingsFile = path.join(testTmpDir, "current_findings.md");
    fs.writeFileSync(findingsFile, `---
verdict: repair_required
type: final
date: 2026-05-30
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | resolved | MUST-FIX | implementation | Phase 1 | API response omits required error handling. | Keep the error mapping fix. |
| F2 | open | RECOMMENDED | implementation | Final | Non-blocking naming note. | Rename in a follow-up. |
| F3 | reopened | MUST-FIX | test | Final | reopened/regression: Missing auth failure coverage!!! | Add auth failure coverage. |
`, "utf-8");

    const findings = parseCurrentValidationFindings(findingsFile);

    expect(findings).toEqual([
      {
        id: "F1",
        signature: "phase|phase 1|implementation|api response omits required error handling",
        latestStatus: "resolved",
        severity: "MUST-FIX",
        className: "implementation",
        blocksPr: true,
        phase: "Phase 1",
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
    const rulesFile = path.join(testTmpDir, "rules.md");
    fs.writeFileSync(rulesFile, `
# Rules

## Test Commands
- unit: \`bun test test/parser.test.ts\`
- phase: \`bun test\`
- full: bun test && bun run typecheck

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
- unit: bun test
`, "utf-8");

    const commands = parseTestCommands(rulesFile);

    expect(commands.commands.unit).toBe("bun test");
    expect(commands.commands.phase).toBeUndefined();
    expect(commands.commands.full).toBeUndefined();
    expect(commands.missing).toEqual(["phase", "full"]);
  });

  test("validateRulesArtifact enforces strict rules contract", () => {
    const validRulesFile = path.join(testTmpDir, "valid_rules.md");
    cleanupTestDir();
    setupTestDir();
    fs.writeFileSync(validRulesFile, `---
approved: true
date: 2026-06-02
---
# Rules

## Test Commands

- unit: \`bun test test/parser.test.ts\`
- phase: \`bun test test/flow-controller.test.ts\`
- full: \`bun test\`
`, "utf-8");

    expect(validateRulesArtifact(validRulesFile)).toEqual([]);

    const invalidRulesFile = path.join(testTmpDir, "invalid_rules.md");
    fs.writeFileSync(invalidRulesFile, `# Rules

<!-- leftover -->

## Test Commands

- unit: \`bun test\`
- full: TODO
- phase:
- extra: nope

## Notes
Not allowed.
`, "utf-8");

    const issues = validateRulesArtifact(invalidRulesFile);
    expect(issues).toContain("rules.md must start with YAML frontmatter.");
    expect(issues).toContain("rules.md must not contain HTML template comments.");
    expect(issues).toContain("rules.md must not contain placeholder text: TODO.");
    expect(issues).toContain("rules.md contains unexpected section `## Notes`.");
    expect(issues).toContain("Test Commands must contain exactly these command rows in order: `unit`, `phase`, `full`.");
    expect(issues).toContain("Test Commands row `- phase:` must use `- unit|phase|full: command` format.");
    expect(issues).toContain("Test Commands row `- extra: nope` must use `- unit|phase|full: command` format.");

    const extraTextRulesFile = path.join(testTmpDir, "extra_text_rules.md");
    fs.writeFileSync(extraTextRulesFile, `---
approved: true
date: 2026-06-02
---
# Rules

## Test Commands

Use the local Bun commands below.
- unit: \`bun test test/parser.test.ts\`
- phase: \`bun test test/flow-controller.test.ts\`
- full: \`bun test\`
`, "utf-8");

    expect(validateRulesArtifact(extraTextRulesFile)).toContain("Test Commands row `Use the local Bun commands below.` is not allowed; only `- unit|phase|full: command` rows are permitted.");
  });

  test("findActiveChangeDir ignores archive directory when selecting active change", () => {
    const changesDir = path.join(testTmpDir, "openspec", "changes");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.join(changesDir, "archive"), { recursive: true });
    fs.mkdirSync(path.join(changesDir, "sample-change"), { recursive: true });

    expect(findActiveChangeDir(testTmpDir)).toBe(path.join(changesDir, "sample-change"));
  });

  test("findActiveChangeDir throws error when multiple active changes exist", () => {
    const changesDir = path.join(testTmpDir, "openspec", "changes");
    cleanupTestDir();
    setupTestDir();
    fs.mkdirSync(path.join(changesDir, "change-1"), { recursive: true });
    fs.mkdirSync(path.join(changesDir, "change-2"), { recursive: true });

    expect(() => findActiveChangeDir(testTmpDir)).toThrow("Multiple active changes found in openspec/changes");
  });

  afterAll(() => {
    cleanupTestDir();
  });
});
