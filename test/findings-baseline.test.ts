import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { writeFindingsBaseline, checkFindingsAgainstBaseline } from "../src/entities/validation-findings/findings-baseline";
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

function baselinePath(): string {
  return path.join(testTmpDir, ".findings-baseline.json");
}

const FM = (verdict: string) =>
  `---\nverdict: ${verdict}\ntype: iteration\ndate: 2026-07-01\n---\n\n`;
const HDR8 = "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n|---|---|---|---|---|---|---|---|\n";

function writeFindings(content: string): string {
  const filePath = findingsPath();
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("writeFindingsBaseline", () => {
  test("snapshots current rows and writes empty rows when the file is missing", () => {
    const filePath = writeFindings(
      FM("ready") +
        HDR8 +
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Missing validation | Fix it | |\n"
    );

    writeFindingsBaseline(filePath, baselinePath());

    expect(fs.existsSync(baselinePath())).toBe(true);
    const baseline = JSON.parse(fs.readFileSync(baselinePath(), "utf-8"));
    expect(baseline.rows).toEqual([
      {
        id: "F1",
        status: "open",
        severity: "MUST-FIX",
        className: "implementation",
        iteration: "Iteration 1",
        finding: "Missing validation",
        requiredFix: "Fix it"
      }
    ]);
  });

  test("writes empty rows array when the findings file does not exist", () => {
    writeFindingsBaseline(findingsPath(), baselinePath());

    expect(fs.existsSync(baselinePath())).toBe(true);
    const baseline = JSON.parse(fs.readFileSync(baselinePath(), "utf-8"));
    expect(baseline.rows).toEqual([]);
  });
});

describe("checkFindingsAgainstBaseline", () => {
  test("no issues when rows are only appended or statuses legally advanced", () => {
    // Create initial findings
    const initial = FM("ready") + HDR8 + "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n";
    writeFindings(initial);

    // Take baseline snapshot
    writeFindingsBaseline(findingsPath(), baselinePath());

    // Now advance F1 to resolved and add F2
    const advanced = FM("ready") +
      HDR8 +
      "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | Fixed in PR #123 |\n" +
      "| F2 | open | RECOMMENDED | design | Iteration 2 | Finding 2 | Review design | |\n";
    writeFindings(advanced);

    const issues = checkFindingsAgainstBaseline(findingsPath(), baselinePath());
    expect(issues).toEqual([]);
  });

  test("deleted baseline row is reported with its ID", () => {
    // Create initial findings with F1 and F2
    const initial = FM("ready") +
      HDR8 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n" +
      "| F2 | open | RECOMMENDED | design | Iteration 1 | Finding 2 | Review | |\n";
    writeFindings(initial);

    // Take baseline snapshot
    writeFindingsBaseline(findingsPath(), baselinePath());

    // Delete F1 from findings
    const modified = FM("ready") +
      HDR8 +
      "| F2 | open | RECOMMENDED | design | Iteration 1 | Finding 2 | Review | |\n";
    writeFindings(modified);

    const issues = checkFindingsAgainstBaseline(findingsPath(), baselinePath());
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("F1");
    expect(issues[0]).toContain("was deleted");
  });

  test("changed stable field is reported", () => {
    // Create initial findings
    const initial = FM("ready") +
      HDR8 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n";
    writeFindings(initial);

    // Take baseline snapshot
    writeFindingsBaseline(findingsPath(), baselinePath());

    // Change Required Fix (stable field)
    const modified = FM("ready") +
      HDR8 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it differently | |\n";
    writeFindings(modified);

    const issues = checkFindingsAgainstBaseline(findingsPath(), baselinePath());
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("F1");
    expect(issues[0]).toContain("stable fields");
  });

  test("resolved -> open transition is reported (only reopened is allowed)", () => {
    // Create initial findings with F1 resolved
    const initial = FM("ready") +
      HDR8 +
      "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | Fixed in PR #123 |\n";
    writeFindings(initial);

    // Take baseline snapshot
    writeFindingsBaseline(findingsPath(), baselinePath());

    // Revert F1 to open (not reopened)
    const modified = FM("ready") +
      HDR8 +
      "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n";
    writeFindings(modified);

    const issues = checkFindingsAgainstBaseline(findingsPath(), baselinePath());
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("F1");
    expect(issues[0]).toContain("resolved -> open");
  });

  test("missing baseline file yields no issues", () => {
    const filePath = writeFindings(
      FM("ready") +
        HDR8 +
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n"
    );

    const issues = checkFindingsAgainstBaseline(filePath, baselinePath());
    expect(issues).toEqual([]);
  });

  test("unreadable baseline JSON yields a single recovery issue", () => {
    const filePath = writeFindings(
      FM("ready") +
        HDR8 +
        "| F1 | open | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | |\n"
    );

    // Write invalid JSON to baseline
    fs.writeFileSync(baselinePath(), "{ invalid json }", "utf-8");

    const issues = checkFindingsAgainstBaseline(filePath, baselinePath());
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("unreadable");
  });

  test("adding the reopened prefix to Finding is tolerated", () => {
    // Create initial findings
    const initial = FM("ready") +
      HDR8 +
      "| F1 | resolved | MUST-FIX | implementation | Iteration 1 | Finding 1 | Fix it | Fixed in PR #123 |\n";
    writeFindings(initial);

    // Take baseline snapshot
    writeFindingsBaseline(findingsPath(), baselinePath());

    // Reopen with prefix
    const reopened = FM("ready") +
      HDR8 +
      "| F1 | reopened | MUST-FIX | implementation | Iteration 1 | Reopened / regression: Finding 1 | Fix it | Evidence in PR #456 |\n";
    writeFindings(reopened);

    const issues = checkFindingsAgainstBaseline(findingsPath(), baselinePath());
    expect(issues).toEqual([]);
  });
});
