import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { checkFindingsAgainstBaseline } from "../src/entities/validation-findings/findings-baseline";
import type { FindingsBaseline } from "../src/entities/change/flow-state";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("findings-baseline");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

function findingsPath(): string {
  return path.join(testTmpDir, "validation_findings.md");
}

const FM = (verdict: string) =>
  `---\nverdict: ${verdict}\ntype: iteration\ndate: 2026-07-01\n---\n\n`;
const HDR8 = "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n|---|---|---|---|---|---|---|---|\n";

function writeFindings(content: string): string {
  const filePath = findingsPath();
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function baselineOf(rows: FindingsBaseline["rows"]): FindingsBaseline {
  return { rows };
}

describe("checkFindingsAgainstBaseline", () => {
  test("no issues when rows are only appended or statuses legally advanced", () => {
    const baseline = baselineOf([
      { id: "F1", status: "open", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Finding 1", requiredFix: "Fix it" }
    ]);

    const advanced = FM("ready") +
      HDR8 +
      "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | Fixed in PR #123 |\n" +
      "| F2 | open | RECOMMENDED | design | Iteration 2 | Finding 2 | Review design | |\n";
    const filePath = writeFindings(advanced);

    const issues = checkFindingsAgainstBaseline(filePath, baseline);
    expect(issues).toEqual([]);
  });

  test("deleted baseline row is reported with its ID", () => {
    const baseline = baselineOf([
      { id: "F1", status: "open", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Finding 1", requiredFix: "Fix it" },
      { id: "F2", status: "open", severity: "RECOMMENDED", className: "design", iteration: "Iteration 1", finding: "Finding 2", requiredFix: "Review" }
    ]);

    const modified = FM("ready") +
      HDR8 +
      "| F2 | open | RECOMMENDED | design | Iteration 1 | Finding 2 | Review | |\n";
    const filePath = writeFindings(modified);

    const issues = checkFindingsAgainstBaseline(filePath, baseline);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("F1");
    expect(issues[0]).toContain("was deleted");
  });

  test("changed stable field is reported", () => {
    const baseline = baselineOf([
      { id: "F1", status: "open", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Finding 1", requiredFix: "Fix it" }
    ]);

    const modified = FM("ready") +
      HDR8 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it differently | |\n";
    const filePath = writeFindings(modified);

    const issues = checkFindingsAgainstBaseline(filePath, baseline);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("F1");
    expect(issues[0]).toContain("stable fields");
  });

  test("resolved -> open transition is reported (only reopened is allowed)", () => {
    const baseline = baselineOf([
      { id: "F1", status: "resolved", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Finding 1", requiredFix: "Fix it" }
    ]);

    const modified = FM("ready") +
      HDR8 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n";
    const filePath = writeFindings(modified);

    const issues = checkFindingsAgainstBaseline(filePath, baseline);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("F1");
    expect(issues[0]).toContain("resolved -> open");
  });

  test("empty baseline yields no issues", () => {
    const filePath = writeFindings(
      FM("ready") +
        HDR8 +
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n"
    );

    const issues = checkFindingsAgainstBaseline(filePath, baselineOf([]));
    expect(issues).toEqual([]);
  });

  test("adding the reopened prefix to Finding is tolerated", () => {
    const baseline = baselineOf([
      { id: "F1", status: "resolved", severity: "MUST-FIX", className: "implementation", iteration: "Iteration 1", finding: "Finding 1", requiredFix: "Fix it" }
    ]);

    const reopened = FM("ready") +
      HDR8 +
      "| F1 | reopened | MUST-FIX | implementation | Iteration 1 | Reopened / regression: Finding 1 | Fix it | Evidence in PR #456 |\n";
    const filePath = writeFindings(reopened);

    const issues = checkFindingsAgainstBaseline(filePath, baseline);
    expect(issues).toEqual([]);
  });
});
