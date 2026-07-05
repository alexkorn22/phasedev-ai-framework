import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { approveArtifact } from "../src/features/artifact-ops/approve-artifact";
import { isApproved, readFrontmatterValue } from "../src/shared/markdown/frontmatter";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-approval-hash-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeArtifact(body: string): string {
  const filePath = path.join(tmpDir, "prd.md");
  fs.writeFileSync(filePath, `---\napproved: false\napproved_by: ""\ndate: 2026-07-05\n---\n\n${body}`, "utf-8");
  return filePath;
}

describe("approval content hash", () => {
  test("approve stamps approved_hash and isApproved accepts unchanged body", () => {
    const filePath = writeArtifact("# PRD\n\nOriginal body.\n");

    const result = approveArtifact(filePath, "reviewer");

    expect(result.ok).toBe(true);
    expect(readFrontmatterValue(filePath, "approved_hash")).toMatch(/^[0-9a-f]{12}$/);
    expect(isApproved(filePath)).toBe(true);
  });

  test("isApproved returns false after the body changes post-approval", () => {
    const filePath = writeArtifact("# PRD\n\nOriginal body.\n");
    approveArtifact(filePath, "reviewer");

    const content = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, content.replace("Original body.", "Silently rewritten body."), "utf-8");

    expect(isApproved(filePath)).toBe(false);
  });

  test("legacy approved artifact without approved_hash is rejected", () => {
    const filePath = path.join(tmpDir, "legacy.md");
    fs.writeFileSync(filePath, `---\napproved: true\napproved_by: "human"\n---\n\n# PRD\n\nBody.\n`, "utf-8");

    expect(isApproved(filePath)).toBe(false);
  });

  test("frontmatter-only edits do not invalidate approval", () => {
    const filePath = writeArtifact("# PRD\n\nStable body.\n");
    approveArtifact(filePath, "reviewer");

    const content = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, content.replace('approved_by: "reviewer"', 'approved_by: "second reviewer"'), "utf-8");

    expect(isApproved(filePath)).toBe(true);
  });

  test("re-approving a changed artifact restores approval with a fresh hash", () => {
    const filePath = writeArtifact("# PRD\n\nFirst body.\n");
    approveArtifact(filePath, "reviewer");
    const firstHash = readFrontmatterValue(filePath, "approved_hash");

    const content = fs.readFileSync(filePath, "utf-8");
    fs.writeFileSync(filePath, content.replace("First body.", "Second body."), "utf-8");
    expect(isApproved(filePath)).toBe(false);

    approveArtifact(filePath, "reviewer");

    expect(isApproved(filePath)).toBe(true);
    expect(readFrontmatterValue(filePath, "approved_hash")).not.toBe(firstHash);
  });

  test("CRLF and LF bodies produce the same approval hash", () => {
    const lfPath = path.join(tmpDir, "lf.md");
    const crlfPath = path.join(tmpDir, "crlf.md");
    fs.writeFileSync(lfPath, `---\napproved: false\n---\n\n# PRD\n\nBody.\n`, "utf-8");
    fs.writeFileSync(crlfPath, `---\r\napproved: false\r\n---\r\n\r\n# PRD\r\n\r\nBody.\r\n`, "utf-8");

    approveArtifact(lfPath, "reviewer");
    approveArtifact(crlfPath, "reviewer");

    expect(readFrontmatterValue(lfPath, "approved_hash")).toBe(readFrontmatterValue(crlfPath, "approved_hash"));
  });
});
