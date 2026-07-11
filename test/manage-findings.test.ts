import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { addFinding, resolveFinding, reopenFinding, setFindingsVerdict, setFindingsType, isPlaceholderRequiredFix, deriveIterationLabel } from "../src/features/artifact-ops/manage-findings";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("manage-findings");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

function findingsPath(): string {
  return path.join(testTmpDir, "validation_findings.md");
}

const FM = (verdict: string) => `---\nverdict: ${verdict}\ntype: iteration\ndate: 2026-07-01\n---\n\n`;
const HDR7 = "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n|---|---|---|---|---|---|---|\n";
const CTX = { type: "iteration" as const, date: "2026-07-07" };

function writeFindings(content: string): string {
  const filePath = findingsPath();
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("addFinding frontmatter matching", () => {
  test("preserves an existing row when the document opens with a bare horizontal rule instead of real frontmatter", () => {
    const filePath = findingsPath();
    const content = [
      "---",
      "",
      "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |",
      "|---|---|---|---|---|---|---|",
      "| F0 | open | MUST-FIX | validation | Iteration 1 | Existing thing | Fix it |",
      ""
    ].join("\n");
    fs.writeFileSync(filePath, content, "utf-8");

    const result = addFinding(filePath, "F1", "New finding", "MUST-FIX", "Fix it now", undefined, "Iteration 1");
    expect(result.ok).toBe(true);

    const written = fs.readFileSync(filePath, "utf-8");
    expect(written).toContain("F0");
    expect(written).toContain("Existing thing");
    expect(written).toContain("F1");
    expect(written.match(/\| ID \| Status \|/g)?.length).toBe(1);
  });

  test("preserves an existing row on a CRLF document that opens with a bare horizontal rule", () => {
    const filePath = findingsPath();
    const content = [
      "---",
      "",
      "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |",
      "|---|---|---|---|---|---|---|",
      "| F0 | open | MUST-FIX | validation | Iteration 1 | Existing thing | Fix it |",
      ""
    ].join("\r\n");
    fs.writeFileSync(filePath, content, "utf-8");

    const result = resolveFinding(filePath, "F0", "Fixed the thing in src/x.ts; bun test -> pass");
    expect(result.ok).toBe(true);

    const written = fs.readFileSync(filePath, "utf-8");
    expect(written).toContain("F0");
    expect(written).toContain("resolved");
    expect(written).toContain("Existing thing");
    expect(written.match(/\| ID \| Status \|/g)?.length).toBe(1);
  });
});

describe("addFinding/resolveFinding with well-formed frontmatter", () => {
  function wellFormedContent(): string {
    return [
      "---",
      "verdict: repair_required",
      "type: iteration",
      "date: 2026-07-01",
      "---",
      "",
      "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |",
      "|---|---|---|---|---|---|---|",
      ""
    ].join("\n");
  }

  test("two consecutive addFinding calls both persist rows without duplicating the header", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const first = addFinding(filePath, "F1", "First finding", "MUST-FIX", "Fix the first thing", undefined, "Iteration 1");
    expect(first.ok).toBe(true);

    const second = addFinding(filePath, "F2", "Second finding", "RECOMMENDED", "Fix the second thing", undefined, "Iteration 1");
    expect(second.ok).toBe(true);

    const written = fs.readFileSync(filePath, "utf-8");
    expect(written).toContain("F1");
    expect(written).toContain("F2");
    expect(written.match(/\| ID \| Status \|/g)?.length).toBe(1);
    expect(written).toContain("---\n\n|");
  });

  test("addFinding then resolveFinding round-trip keeps frontmatter parseable and updates status", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const added = addFinding(filePath, "F1", "First finding", "MUST-FIX", "Fix the first thing", undefined, "Iteration 1");
    expect(added.ok).toBe(true);

    const resolved = resolveFinding(filePath, "F1", "Fixed the first thing in src/x.ts; bun test -> pass");
    expect(resolved.ok).toBe(true);

    const written = fs.readFileSync(filePath, "utf-8");
    expect(written).toContain("---\n\n|");
    expect(written).toMatch(/\| F1 \| resolved \|/);
  });

  test("body text between frontmatter and table is preserved without gluing", () => {
    const filePath = findingsPath();
    const content = [
      "---",
      "verdict: repair_required",
      "type: iteration",
      "date: 2026-07-01",
      "---",
      "",
      "Some prose describing the findings.",
      "",
      "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |",
      "|---|---|---|---|---|---|---|",
      ""
    ].join("\n");
    fs.writeFileSync(filePath, content, "utf-8");

    const result = addFinding(filePath, "F1", "First finding", "MUST-FIX", "Fix the first thing", undefined, "Iteration 1");
    expect(result.ok).toBe(true);

    const written = fs.readFileSync(filePath, "utf-8");
    expect(written).toContain("---\n\nSome prose describing the findings.\n\n|");
  });
});

describe("addFinding severity/class validation", () => {
  function wellFormedContent(): string {
    return [
      "---",
      "verdict: repair_required",
      "type: iteration",
      "date: 2026-07-01",
      "---",
      "",
      "| ID | Status | Severity | Class | Iteration | Finding | Required Fix |",
      "|---|---|---|---|---|---|---|",
      ""
    ].join("\n");
  }

  test("accepts lowercase severity 'must-fix' (normalized to uppercase)", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "must-fix", "Fix it now", undefined, "Iteration 1");
    expect(result.ok).toBe(true);
  });

  test("rejects unknown severity", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "CRITICAL", "Fix it now", undefined, "Iteration 1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("severity");
  });

  test("rejects invalid class name", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "MUST-FIX", "Fix it now", "invalid_class", "Iteration 1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("class");
  });

  test("accepts valid severity MUST-FIX", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "MUST-FIX", "Fix it now", "validation", "Iteration 1");
    expect(result.ok).toBe(true);
  });

  test("accepts class with different casing", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "MUST-FIX", "Fix it now", "Implementation", "Iteration 1");
    expect(result.ok).toBe(true);
  });

  test("accepts valid severity RECOMMENDED", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "RECOMMENDED", "Fix it now", "test", "Iteration 1");
    expect(result.ok).toBe(true);
  });

  test("accepts valid severity NIT", () => {
    const filePath = findingsPath();
    fs.writeFileSync(filePath, wellFormedContent(), "utf-8");

    const result = addFinding(filePath, "F1", "Test finding", "NIT", "Fix it now", "design", "Iteration 1");
    expect(result.ok).toBe(true);
  });
});

describe("isPlaceholderRequiredFix", () => {
  test("treats whitespace-only values as placeholders", () => {
    expect(isPlaceholderRequiredFix("   ")).toBe(true);
  });

  test("treats known placeholder tokens as placeholders", () => {
    expect(isPlaceholderRequiredFix("TBD")).toBe(true);
    expect(isPlaceholderRequiredFix("n/a")).toBe(true);
  });

  test("treats a concrete required fix as not a placeholder", () => {
    expect(isPlaceholderRequiredFix("Add missing guard clause")).toBe(false);
  });
});

describe("addFinding CLI-owned mutations", () => {
  test("addFinding writes 8-column row with empty resolution at the top of the table body", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Old finding | Fix old |\n");
    const result = addFinding(file, "F2", "New finding", "MUST-FIX", "Fix new", "implementation", "Iteration 1");
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("| Resolution |");
    const f2Index = written.indexOf("| F2 |");
    const f1Index = written.indexOf("| F1 |");
    expect(f2Index).toBeGreaterThan(-1);
    expect(f2Index).toBeLessThan(f1Index); // new rows at the top
  });

  test("addFinding refuses a semantically duplicate finding with the existing ID hint", () => {
    const file = writeFindings(FM("repair_required") + HDR7);
    addFinding(file, "F1", "Missing null guard in parser", "MUST-FIX", "Add guard", "implementation", "Iteration 1");
    const result = addFinding(file, "F2", "missing   NULL guard in parser", "MUST-FIX", "Add guard", "implementation", "Iteration 1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("F1");
  });

  test("addFinding refuses a duplicate of a RESOLVED row", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Missing null guard | Add guard |\n" +
      "| F2 | open | MUST-FIX | implementation | Iteration 1 | Another defect | Fix it |\n");
    const result = addFinding(file, null, "Missing null guard", "MUST-FIX", "Add guard", "implementation", "Iteration 1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("F1");
  });

  test("addFinding with id=null allocates next F<number> and reports it", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | First | Fix 1 |\n" +
      "| F3 | open | MUST-FIX | implementation | Iteration 1 | Third | Fix 3 |\n");
    const result = addFinding(file, null, "Fourth", "MUST-FIX", "Fix 4", "implementation", "Iteration 1");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("F4"); // max существующих + 1, дыры не переиспользуются
  });

  test("addFinding creates the file when missing and a create context is given", () => {
    const file = findingsPath();
    const result = addFinding(file, null, "Late feedback defect", "MUST-FIX", "Fix it", "implementation", "Final", { type: "final", date: "2026-07-07" });
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("verdict: repair_required"); // консистентен с open MUST-FIX
    expect(written).toContain("type: final");
    expect(written).toContain("date: 2026-07-07");
    expect(written).toContain("| F1 |");
  });

  test("addFinding creating a file for a non-blocking finding uses ready_with_risks", () => {
    const file = findingsPath();
    const result = addFinding(file, null, "Minor nit", "NIT", "Polish it", "test", "Final", { type: "final", date: "2026-07-07" });
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: ready_with_risks");
  });

  test("addFinding without create context still refuses a missing file", () => {
    const result = addFinding(findingsPath(), "F1", "X", "MUST-FIX", "Fix", "implementation", "Iteration 1");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("File not found");
  });

  test("resolveFinding requires concrete resolution evidence", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    expect(resolveFinding(file, "F1", "TBD").ok).toBe(false);
    const result = resolveFinding(file, "F1", "Fixed in src/x.ts; bun test x -> pass");
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("| resolved |");
    expect(written).toContain("Fixed in src/x.ts; bun test x -> pass");
  });

  test("resolveFinding refuses a resolved finding", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
    expect(resolveFinding(file, "F1", "Fixed again").ok).toBe(false);
  });

  test("reopenFinding flips resolved to reopened and appends evidence to Resolution", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n" +
      "| F2 | open | MUST-FIX | implementation | Iteration 1 | Other | Fix other |\n");
    resolveFinding(file, "F1", "Fixed in src/x.ts; bun test x -> pass");
    const result = reopenFinding(file, "F1", "guard still missing for empty string input");
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("| reopened |");
    expect(written).toContain("reopened: guard still missing for empty string input");
    expect(written).toContain("Fixed in src/x.ts"); // прежний Resolution сохранён
  });

  test("reopenFinding refuses an open finding and placeholder evidence", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    expect(reopenFinding(file, "F1", "still broken").ok).toBe(false); // не resolved
    resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
    expect(reopenFinding(file, "F1", "TBD").ok).toBe(false); // placeholder
  });

  test("mutation migrates a legacy 7-column table to 8 columns", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | resolved | NIT | test | Iteration 1 | Weak assertion | Strengthen |\n" +
      "| F2 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    addFinding(file, null, "New defect", "MUST-FIX", "Fix new", "implementation", "Iteration 1");
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("| Resolution |");
    expect(written).toContain("legacy: resolved before Resolution column"); // у F1
    expect(written.split("\n").find(l => l.startsWith("| F2 |"))).toMatch(/\|\s*\|$/); // F2 Resolution пуст
  });

  test("addFinding flips verdict ready -> repair_required when adding an open MUST-FIX", () => {
    const file = writeFindings(FM("ready") + HDR7);
    const result = addFinding(file, null, "Late defect", "MUST-FIX", "Fix it", "implementation", "Iteration 1");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("verdict updated to repair_required");
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: repair_required");
  });

  test("addFinding flips verdict ready -> ready_with_risks when adding a NIT", () => {
    const file = writeFindings(FM("ready") + HDR7);
    addFinding(file, null, "Minor nit", "NIT", "Polish", "test", "Iteration 1");
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: ready_with_risks");
  });

  test("addFinding keeps verdict repair_required unchanged", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    const result = addFinding(file, null, "Another defect", "MUST-FIX", "Fix it too", "implementation", "Iteration 1");
    expect(result.message).not.toContain("verdict updated");
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: repair_required");
  });

  test("addFinding skips verdict correction when the verdict line is a template placeholder", () => {
    const file = writeFindings("---\nverdict: <set_after_review>\ntype: iteration\ndate: 2026-07-01\n---\n\n" + HDR7);
    const result = addFinding(file, null, "Defect during review", "MUST-FIX", "Fix it", "implementation", "Iteration 1");
    expect(result.ok).toBe(true);
    expect(result.message).not.toContain("verdict updated");
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: <set_after_review>"); // не тронут
  });

  test("addFinding preserves type and date frontmatter fields", () => {
    const file = writeFindings(FM("ready") + HDR7);
    addFinding(file, null, "Defect", "MUST-FIX", "Fix", "implementation", "Iteration 1");
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("type: iteration");
    expect(written).toContain("date: 2026-07-01");
  });

  test("reopenFinding applies the same verdict correction", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
    setFindingsVerdict(file, "repaired", CTX);
    const result = reopenFinding(file, "F1", "defect is still reproducible");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("verdict updated to repair_required");
  });

  test("setFindingsVerdict validates the value and consistency with rows", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Defect | Fix it |\n");
    expect(setFindingsVerdict(file, "done", CTX).ok).toBe(false);          // невалидное значение
    expect(setFindingsVerdict(file, "ready", CTX).ok).toBe(false);         // open строки существуют
    resolveFinding(file, "F1", "Fixed in src/x.ts; bun test -> pass");
    expect(setFindingsVerdict(file, "repair_required", CTX).ok).toBe(false); // нет open MUST-FIX
    const result = setFindingsVerdict(file, "repaired", CTX);
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(file, "utf-8");
    expect(written).toContain("verdict: repaired");
    expect(written).toContain("date: 2026-07-07"); // date обновлён командой
  });

  test("setFindingsType promotes iteration to final, leaving other frontmatter keys and row data unchanged", () => {
    const file = writeFindings(FM("ready") + HDR7 +
      "| F1 | open | NIT | implementation | Iteration 1 | Defect | Fix it |\n");

    setFindingsType(file, "final");

    const after = fs.readFileSync(file, "utf-8");
    expect(after).toContain("type: final");
    expect(after).not.toContain("type: iteration");
    expect(after).toContain("verdict: ready");
    expect(after).toContain("date: 2026-07-01");
    expect(after).toContain("F1");
    expect(after).toContain("open");
    expect(after).toContain("NIT");
    expect(after).toContain("Defect");
    expect(after).toContain("Fix it");
  });

  test("setFindingsType is idempotent when already final", () => {
    const file = writeFindings(FM("ready").replace("type: iteration", "type: final") + HDR7);
    setFindingsType(file, "final");
    const after = fs.readFileSync(file, "utf-8");
    expect(after).toContain("type: final");
    expect((after.match(/type: final/g) ?? []).length).toBe(1);
  });

  test("setFindingsType is a no-op when the file does not exist", () => {
    const missing = findingsPath();
    expect(fs.existsSync(missing)).toBe(false);
    setFindingsType(missing, "final");
    expect(fs.existsSync(missing)).toBe(false);
  });

  test("setFindingsVerdict creates the file with an empty table when missing", () => {
    const result = setFindingsVerdict(findingsPath(), "ready", { type: "final", date: "2026-07-07" });
    expect(result.ok).toBe(true);
    const written = fs.readFileSync(findingsPath(), "utf-8");
    expect(written).toContain("verdict: ready");
    expect(written).toContain("type: final");
    expect(written).toContain("| Resolution |");
  });
});

describe("blockingSeverity-aware verdict correction", () => {
  test("recommended threshold: adding a RECOMMENDED finding downgrades ready to repair_required", () => {
    const file = writeFindings(FM("ready") + HDR7);

    const result = addFinding(file, null, "New concern", "RECOMMENDED", "Fix later", undefined, "Iteration 1", undefined, "recommended");

    expect(result.ok).toBe(true);
    expect(result.message).toContain("verdict updated to repair_required");
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: repair_required");
  });

  test("must_fix (default): adding a RECOMMENDED finding to ready yields ready_with_risks", () => {
    const file = writeFindings(FM("ready") + HDR7);

    const result = addFinding(file, null, "New concern", "RECOMMENDED", "Fix later", undefined, "Iteration 1");

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(file, "utf-8")).toContain("verdict: ready_with_risks");
  });

  test("recommended threshold: set-verdict rejects ready_with_risks while an open RECOMMENDED exists", () => {
    const file = writeFindings(FM("repair_required") + HDR7 +
      "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Concern | Fix it |\n");

    const result = setFindingsVerdict(file, "ready_with_risks", CTX, "recommended");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("MUST-FIX or RECOMMENDED");
  });
});

describe("deriveIterationLabel", () => {
  function writeState(changeName: string, state: Record<string, unknown>): void {
    const changeDir = path.join(testTmpDir, ".phasedev", "changes", changeName);
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify(state), "utf-8");
  }

  test("active iteration yields \"Iteration N\"", () => {
    writeState("c", { activePhase: "finding_repair", activeIteration: 3, repairCycleCount: 0 });
    expect(deriveIterationLabel(testTmpDir, findingsPath())).toBe("Iteration 3");
  });

  test("final_validation phase yields \"Final\"", () => {
    writeState("c", { activePhase: "final_validation", activeIteration: null, repairCycleCount: 0 });
    expect(deriveIterationLabel(testTmpDir, findingsPath())).toBe("Final");
  });

  test("finding_repair with type: final frontmatter yields \"Final\"", () => {
    writeState("c", { activePhase: "finding_repair", activeIteration: null, repairCycleCount: 0 });
    const target = writeFindings(FM("repair_required").replace("type: iteration", "type: final") + HDR7);
    expect(deriveIterationLabel(testTmpDir, target)).toBe("Final");
  });

  test("returns undefined when no iteration can be derived", () => {
    writeState("c", { activePhase: "finding_repair", activeIteration: null, repairCycleCount: 0 });
    const target = writeFindings(FM("repair_required") + HDR7);
    expect(deriveIterationLabel(testTmpDir, target)).toBeUndefined();
  });
});
