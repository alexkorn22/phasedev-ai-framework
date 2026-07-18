import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  deltaSectionHeadings,
  isRuleCExempt,
  lintLiveSpecs,
  liveSpecsRootFor
} from "../src/features/phase-control/live-spec-lint";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "live-spec-lint-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeLiveSpec(root: string, capability: string, content: string): void {
  const dir = path.join(root, capability);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), content);
}

const CLEAN_SPEC = "# Reporting Specification\n\n## Purpose\n\nDescribes reporting.\n\n### Requirement: Render report\nThe system SHALL render.\n";

describe("liveSpecsRootFor", () => {
  test("derives <project>/.phasedev/specs from an archive path", () => {
    const archivePath = path.join(tmpDir, "proj", ".phasedev", "changes", "archive", "2026-07-18-my-change");
    expect(liveSpecsRootFor(archivePath)).toBe(path.join(tmpDir, "proj", ".phasedev", "specs"));
  });

  test("returns null when no .phasedev ancestor exists", () => {
    expect(liveSpecsRootFor(path.join(tmpDir, "elsewhere", "archive-dir"))).toBeNull();
  });
});

describe("deltaSectionHeadings / isRuleCExempt", () => {
  test("collects delta section headings outside code fences", () => {
    const content = "## ADDED Requirements\n\n```md\n## MODIFIED Requirements\n```\n\n## REMOVED Requirements\n";
    const sections = deltaSectionHeadings(content);
    expect(sections).toEqual(new Set(["## ADDED Requirements", "## REMOVED Requirements"]));
  });

  test("REMOVED-only and RENAMED-only deltas are Rule C exempt", () => {
    expect(isRuleCExempt(new Set(["## REMOVED Requirements"]))).toBe(true);
    expect(isRuleCExempt(new Set(["## REMOVED Requirements", "## RENAMED Requirements"]))).toBe(true);
  });

  test("deltas containing ADDED or MODIFIED sections are not exempt", () => {
    expect(isRuleCExempt(new Set(["## ADDED Requirements"]))).toBe(false);
    expect(isRuleCExempt(new Set(["## ADDED Requirements", "## REMOVED Requirements"]))).toBe(false);
    expect(isRuleCExempt(new Set())).toBe(false);
  });
});

describe("lintLiveSpecs", () => {
  test("clean corpus produces no errors or warnings", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", CLEAN_SPEC);
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("Rule A: delta heading in a touched live spec is an error", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", "## ADDED Requirements\n\n### Requirement: X\nThe system SHALL x.\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("## ADDED Requirements"))).toBe(true);
  });

  test("Rule A: delta heading in an untouched live spec is a warning only", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", CLEAN_SPEC);
    writeLiveSpec(root, "billing", "## MODIFIED Requirements\n\n### Requirement: Y\nThe system SHALL y.\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors).toEqual([]);
    expect(result.warnings.some(issue => issue.includes("billing/spec.md"))).toBe(true);
  });

  test("Rule A is fence-aware: delta heading inside a code fence passes", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", "## Purpose\n\nDelta format example:\n\n```md\n## ADDED Requirements\n```\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("Rule B: first ## heading must be ## Purpose; a single leading # title is allowed", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", "# Reporting Specification\n\n## Requirements\n\n### Requirement: X\nThe system SHALL x.\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("## Purpose"))).toBe(true);
  });

  test("Rule C: capability with a delta but no live spec file is an error", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    fs.mkdirSync(root, { recursive: true });
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("reporting"))).toBe(true);
  });

  test("Rule C exemption: exempt capability with no live spec passes", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    fs.mkdirSync(root, { recursive: true });
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set(["reporting"]));
    expect(result.errors).toEqual([]);
  });

  test("missing specs root: Rule C still applies, content lint is skipped", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("reporting"))).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
