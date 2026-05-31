import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { findActiveChangeDir } from "../src/entities/flow-change/active-change";
import { parsePlan } from "../src/entities/implementation-plan/parse-plan";
import { validatePlanStructure } from "../src/entities/implementation-plan/validate-plan";
import { parseTestCommands } from "../src/entities/test-commands/parse-test-commands";
import { parseValidationVerdict, parseValidationVerdictType } from "../src/entities/validation-findings/parse-validation-findings";
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
- [x] Create migration
- [x] Create user model

## Phase 2: Core Auth APIs [~]
- [x] Implement signup handler
- [ ] Implement login handler
- [ ] Add JWT middleware

## Phase 3: UI [ ]
- [ ] Layout
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
    expect(phases[1].tasks[0].status).toBe("completed");
    expect(phases[1].tasks[1].status).toBe("not_started");
  });

  test("parsePlan extracts optional phase additional checks", () => {
    const planFile = path.join(testTmpDir, "plan_checks.md");
    const planContent = `
# Plan

## Phase 1: API [~]
- [x] Implement endpoint

Additional checks:
- \`bun test:e2e auth\`
- Browser smoke for login flow

Definition of Done:
- Endpoint works.
`;
    fs.writeFileSync(planFile, planContent, "utf-8");
    const phases = parsePlan(planFile);

    expect(phases).toHaveLength(1);
    expect(phases[0].additionalChecks).toEqual(["`bun test:e2e auth`", "Browser smoke for login flow"]);
  });

  test("validatePlanStructure rejects empty and malformed phase plans", () => {
    expect(validatePlanStructure([])).toContain("implementation_plan.md must contain at least one phase heading.");

    const issues = validatePlanStructure([
      { id: 1, name: "API", status: "completed", tasks: [{ name: "Implement endpoint", status: "not_started" }], additionalChecks: [] },
      { id: 1, name: "UI", status: "in_progress", tasks: [], additionalChecks: [] },
      { id: 3, name: "Docs", status: "in_progress", tasks: [{ name: "Update docs", status: "completed" }], additionalChecks: [] }
    ]);

    expect(issues).toContain("Phase numbers must be unique; duplicate phase id(s): 1.");
    expect(issues).toContain("Phase numbers must be sequential starting at 1.");
    expect(issues).toContain("Phase 1: API is [x] but contains incomplete tasks.");
    expect(issues).toContain("Phase 1: UI must contain at least one task checkbox.");
    expect(issues).toContain("Only one phase may have [~] status at a time; active phases: Phase 1: UI, Phase 3: Docs.");
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
