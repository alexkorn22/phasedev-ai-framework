import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { addFinding, resolveFinding, isPlaceholderRequiredFix } from "../src/features/artifact-ops/manage-findings";
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

    const result = resolveFinding(filePath, "F0");
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

    const resolved = resolveFinding(filePath, "F1");
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
