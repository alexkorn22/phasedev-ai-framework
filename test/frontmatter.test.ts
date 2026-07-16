import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { isApproved, matchFrontmatterBlock, readApprovalEnvelope, readFrontmatterValue } from "../src/shared/markdown/frontmatter";
import { bodyAfterFrontmatter } from "../src/shared/markdown/headings";
import { buildApprovalFrontmatter } from "../src/shared/markdown/approval-frontmatter";
import { renderTemplate } from "../src/shared/templates/render-template";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-frontmatter-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(content: string): string {
  const filePath = path.join(tmpDir, "artifact.md");
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("unified frontmatter policy", () => {
  test("leading blank line before --- still yields frontmatter values", () => {
    const filePath = writeFile("\n---\nverdict: ready\n---\n\n| ID |\n");
    expect(readFrontmatterValue(filePath, "verdict")).toBe("ready");
    expect(bodyAfterFrontmatter(fs.readFileSync(filePath, "utf-8")).hasFrontmatter).toBe(true);
  });

  test("BOM before frontmatter is tolerated", () => {
    const filePath = writeFile("﻿---\napproved: true\n---\n\nBody\n");
    expect(readFrontmatterValue(filePath, "approved")).toBe("true");
  });

  test("CRLF frontmatter parses", () => {
    const filePath = writeFile("---\r\nverdict: ready\r\n---\r\n\r\nBody\r\n");
    expect(readFrontmatterValue(filePath, "verdict")).toBe("ready");
  });

  test("a --- horizontal rule inside the body does not truncate frontmatter", () => {
    const content = "---\nverdict: ready\n---\n\nIntro\n\n---\n\nOutro\n";
    const block = matchFrontmatterBlock(content);
    expect(block).not.toBeNull();
    expect(block?.yaml).toBe("verdict: ready");
    expect(bodyAfterFrontmatter(content).body).toContain("Outro");
  });

  test("content without frontmatter returns null / passthrough", () => {
    expect(matchFrontmatterBlock("# Title\n")).toBeNull();
    expect(bodyAfterFrontmatter("# Title\n")).toEqual({ body: "# Title\n", hasFrontmatter: false });
  });

  test("approved: true survives a body edit made after approval", () => {
    const filePath = writeFile("---\napproved: true\n---\n\nOriginal body.\n");
    expect(isApproved(filePath)).toBe(true);

    fs.writeFileSync(filePath, "---\napproved: true\n---\n\nBody changed after approval.\n", "utf-8");
    expect(isApproved(filePath)).toBe(true);
  });
});

describe("approval envelope", () => {
  test("readApprovalEnvelope reads approved/approved_by/date", () => {
    const p = writeFile("---\napproved: true\napproved_by: \"alice\"\ndate: 2026-07-16\n---\n# X\n");
    expect(readApprovalEnvelope(p)).toEqual({ approved: true, approvedBy: "alice", date: "2026-07-16" });
  });

  test("readApprovalEnvelope: missing file and empty approver", () => {
    expect(readApprovalEnvelope("/no/such")).toEqual({ approved: false, approvedBy: null, date: null });
    const p = writeFile("---\napproved: false\napproved_by: \"\"\ndate: 2026-07-16\n---\n");
    expect(readApprovalEnvelope(p).approvedBy).toBeNull();
  });

  test("isApproved delegates to readApprovalEnvelope", () => {
    const p = writeFile("---\napproved: \"true\"\napproved_by: \"x\"\ndate: 2026-07-16\n---\n");
    expect(isApproved(p)).toBe(true);
  });

  test("buildApprovalFrontmatter renders the frozen 3-line envelope", () => {
    expect(buildApprovalFrontmatter("2026-07-16")).toBe("approved: false\napproved_by: \"\"\ndate: 2026-07-16");
  });

  test("rendered prd frontmatter is the canonical approval envelope", () => {
    const out = renderTemplate("artifacts/prd", { date: "2026-07-16", approval_frontmatter: buildApprovalFrontmatter("2026-07-16") });
    expect(out.startsWith("---\napproved: false\napproved_by: \"\"\ndate: 2026-07-16\n---")).toBe(true);
  });
});
