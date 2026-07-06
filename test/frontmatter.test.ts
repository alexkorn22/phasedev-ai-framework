import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { approvalContentHash, matchFrontmatterBlock, readFrontmatterValue } from "../src/shared/markdown/frontmatter";
import { bodyAfterFrontmatter } from "../src/shared/markdown/headings";

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
});

describe("approvalContentHash iteration heading normalization", () => {
  function makeContent(status: string): string {
    return `---
approved: true
---

## Iteration 1: Test [${status}]

Some body content here.
`;
  }

  test("all status markers ([x], [~], [ ], [/]) normalize to the same hash", () => {
    const hashX = approvalContentHash(makeContent("x"));
    const hashTilde = approvalContentHash(makeContent("~"));
    const hashSpace = approvalContentHash(makeContent(" "));
    const hashSlash = approvalContentHash(makeContent("/"));

    expect(hashTilde).toBe(hashX);
    expect(hashSpace).toBe(hashX);
    expect(hashSlash).toBe(hashX);
  });

  test("different body text produces different hash", () => {
    const hash1 = approvalContentHash(makeContent("x"));
    const differentContent = makeContent("x").replace(
      "Some body content here.",
      "Different body content here.",
    );
    const hash2 = approvalContentHash(differentContent);
    expect(hash1).not.toBe(hash2);
  });

  test("content with no iteration headings produces consistent hash", () => {
    const content = `---
approved: true
---

# Just a title

Some text.
`;
    expect(approvalContentHash(content)).toBe(approvalContentHash(content));
  });
});
