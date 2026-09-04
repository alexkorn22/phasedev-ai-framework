import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { addFinding, resolveFinding } from "../src/features/artifact-ops/manage-findings";

describe("addFinding nit limit", () => {
  let tmpDir: string;
  let findingsFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nit-limit-"));
    findingsFile = path.join(tmpDir, "validation_findings.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("enforces maxOpenNits limit", () => {
    const ctx = { type: "iteration" as const, date: "2026-09-03" };
    // Add 2 nits with maxOpenNits = 2
    const r1 = addFinding(findingsFile, null, "Nit 1", "nit", "Fix style 1", "code_review", "Iteration 1", ctx, "must_fix", 2);
    expect(r1.ok).toBe(true);
    const r2 = addFinding(findingsFile, null, "Nit 2", "nit", "Fix style 2", "code_review", "Iteration 1", ctx, "must_fix", 2);
    expect(r2.ok).toBe(true);

    // Third nit should be blocked
    const r3 = addFinding(findingsFile, null, "Nit 3", "nit", "Fix style 3", "code_review", "Iteration 1", ctx, "must_fix", 2);
    expect(r3.ok).toBe(false);
    expect(r3.message).toContain("Maximum open NIT findings limit (2) reached");

    // But adding a MUST-FIX is allowed
    const rMustFix = addFinding(findingsFile, null, "Bug 1", "must-fix", "Fix bug", "implementation", "Iteration 1", ctx, "must_fix", 2);
    expect(rMustFix.ok).toBe(true);

    // Resolving one nit frees up quota
    const res = resolveFinding(findingsFile, "F1", "Resolved nit 1");
    expect(res.ok).toBe(true);

    // Now adding another nit succeeds
    const r4 = addFinding(findingsFile, null, "Nit 4", "nit", "Fix style 4", "code_review", "Iteration 1", ctx, "must_fix", 2);
    expect(r4.ok).toBe(true);
  });
});
