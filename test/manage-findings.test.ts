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
