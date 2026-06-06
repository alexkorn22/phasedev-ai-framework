import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { findActiveChangeDir } from "../src/entities/flow-change/active-change";
import { parsePlan } from "../src/entities/implementation-plan/parse-plan";
import { validatePlanStructure } from "../src/entities/implementation-plan/validate-plan";
import { validatePrdArtifact } from "../src/entities/prd/validate-prd";
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

  test("parseValidationVerdict extracts correct validation statuses", () => {
    const fileReady = path.join(testTmpDir, "ready.md");
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

  test("findActiveChangeDir ignores archive directory when selecting active change", () => {
    const changesDir = path.join(testTmpDir, "openspec", "changes");
    fs.mkdirSync(path.join(changesDir, "archive"), { recursive: true });
    fs.mkdirSync(path.join(changesDir, "sample-change"), { recursive: true });

    expect(findActiveChangeDir(testTmpDir)).toBe(path.join(changesDir, "sample-change"));
  });

  afterAll(() => {
    cleanupTestDir();
  });
});
