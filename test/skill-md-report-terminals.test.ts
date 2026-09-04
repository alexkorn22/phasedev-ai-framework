import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const skillMdPath = path.join(repoRoot, "skills", "phasedev-orchestrator", "SKILL.md");
const skillMd = fs.readFileSync(skillMdPath, "utf-8");

describe("phasedev-orchestrator SKILL.md ultra-lean prompt & reporting", () => {
  test("contains the ultra-lean canonical dispatch prompt structure", () => {
    expect(skillMd).toContain('Execute the current PhaseDev phase for change "<change>".');
    expect(skillMd).toContain("1. Run: phasedev phase --change <change> — to get the phase contract.");
    expect(skillMd).toContain("2. Follow your role's mandatory skills and execute the phase contract.");
    expect(skillMd).toContain("5. Self-validate via the contract's check command before reporting.");
    expect(skillMd).toContain("6. Do NOT run phasedev advance. Report results, blockers, and applied skills.");
  });

  test("references concise skill reporting format in surrounding prose", () => {
    expect(skillMd).toContain("Skills: <skill> (APPLIED)");
    expect(skillMd).toContain("Skills: <skill> (N/A: reason)");
  });

  test("does not contain obsolete verbose fallback terminal strings", () => {
    expect(skillMd).not.toContain('"no role assigned"');
    expect(skillMd).not.toContain('"no skill applies"');
  });
});
