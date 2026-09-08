import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const skillPath = path.resolve(__dirname, "..", "skills", "test-quality-method", "SKILL.md");
const skillMd = fs.readFileSync(skillPath, "utf-8");

describe("test-quality-method assertion gates", () => {
  test("does not impose an assertion-level percentage quota", () => {
    expect(skillMd).not.toMatch(/at least 60% of a file's assertions at level 3\+/);
    expect(skillMd).not.toMatch(/Gate:\s*at least 60%/);
    expect(skillMd).not.toMatch(/more than 60% is weak\+tautological\+dead/);
  });

  test("keeps oracle independence and qualitative assertion strength", () => {
    expect(skillMd).toContain("## Oracle Independence");
    expect(skillMd).toContain("copied from the implementation — reject");
    expect(skillMd).toContain("Do not score a file by assertion-level percentages");
    expect(skillMd).toContain("oracle-independent assertion");
  });
});
