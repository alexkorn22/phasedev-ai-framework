import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { validateWorklogArtifact, validateWorklogContent, isWorklogEmpty } from "../src/entities/worklog/validate-worklog";
import { validateArtifact } from "../src/features/artifact-ops/validate-artifact";

describe("validateWorklog", () => {
  it("detects empty or template-only worklog content", () => {
    expect(isWorklogEmpty("")).toBe(true);
    expect(isWorklogEmpty("   \n\n  ")).toBe(true);

    const templateContent = [
      "---",
      "date: 2026-09-03",
      "---",
      "",
      "# Worklog",
      "",
      "## Task",
      "",
      "<!-- Filled by the quick_plan subagent: what the task is, in the user's words. -->",
      "",
      "## Short Specification",
      "",
      "<!-- Filled by the quick_plan subagent: the short spec / expected behaviour. -->",
      "",
      "## Plan",
      "",
      "<!-- Filled by the quick_plan subagent: the concrete implementation plan. -->"
    ].join("\n");

    expect(isWorklogEmpty(templateContent)).toBe(true);
    const issues = validateWorklogContent(templateContent);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("missing or empty");
  });

  it("passes when sections have meaningful content", () => {
    const filledContent = [
      "# Worklog",
      "",
      "## Task",
      "Fix login error with redirect url parameter handling.",
      "",
      "## Short Specification",
      "Redirect URL must be decoded and validated before routing.",
      "",
      "## Plan",
      "1. Add unit test.\n2. Fix sanitizeRedirectUrl function."
    ].join("\n");

    expect(isWorklogEmpty(filledContent)).toBe(false);
    const issues = validateWorklogContent(filledContent, { requireAllSections: true });
    expect(issues).toEqual([]);
  });

  it("checks for verification section when requireVerification is true", () => {
    const contentWithoutVerification = [
      "# Worklog",
      "",
      "## Task",
      "Fix something quickly.",
      "",
      "## Short Specification",
      "Behave properly.",
      "",
      "## Plan",
      "1. Fix it."
    ].join("\n");

    const issues = validateWorklogContent(contentWithoutVerification, { requireVerification: true });
    expect(issues.some(i => i.includes("Verification"))).toBe(true);

    const contentWithVerification = contentWithoutVerification + "\n\n## Verification\n`bun test` exited with code 0.\n25 tests passed.";
    const validIssues = validateWorklogContent(contentWithVerification, { requireVerification: true });
    expect(validIssues).toEqual([]);
  });

  it("integrates with validateArtifact CLI dispatcher", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pd-worklog-"));
    const worklogFile = path.join(tmpDir, "worklog.md");
    fs.writeFileSync(worklogFile, [
      "# Worklog",
      "",
      "## Task",
      "Implement surgical fix for CLI parser."
    ].join("\n"));

    const result = validateArtifact(worklogFile);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("validation passed");
  });

  it("createChange with quick=true does not create architecture/ and populates ## Task in worklog.md", async () => {
    const { createChange } = await import("../src/features/phase-control/create-change");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-cc-quick-"));
    const res = createChange(root, "my-quick-change", "Fix the broken parser token handling", true);
    expect(res.ok).toBe(true);

    const changeDir = path.join(root, ".phasedev", "changes", "my-quick-change");
    expect(fs.existsSync(path.join(changeDir, "architecture"))).toBe(false);

    const worklogContent = fs.readFileSync(path.join(changeDir, "worklog.md"), "utf-8");
    expect(worklogContent).toContain("## Task\n\nFix the broken parser token handling");
    expect(worklogContent).not.toContain("what the task is, in the user's words");
  });
});
