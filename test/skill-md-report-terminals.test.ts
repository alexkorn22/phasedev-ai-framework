import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const skillMdPath = path.join(repoRoot, "skills", "phasedev-orchestrator", "SKILL.md");
const skillMd = fs.readFileSync(skillMdPath, "utf-8");

const NON_VALIDATION_HEADING = "### Canonical dispatch: non-validation phases";

function nonValidationSection(): string {
  const start = skillMd.indexOf(NON_VALIDATION_HEADING);
  expect(start).toBeGreaterThan(-1);
  const afterHeading = skillMd.slice(start + NON_VALIDATION_HEADING.length);
  const nextHeading = afterHeading.search(/\n## /);
  return nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
}

describe("phasedev-orchestrator SKILL.md ultra-lean prompt & reporting", () => {
  test("non-validation canonical dispatch prompt structure is directly copyable", () => {
    const section = nonValidationSection();
    const match = section.match(/```javascript\n([\s\S]*?)```/);
    expect(match).not.toBeNull();
    const prompt = match![1];

    expect(prompt).toContain('Execute the current PhaseDev phase for change "<change>".');
    expect(prompt).toContain("1. Run: phasedev phase --change <change> — to get the phase contract.");
    expect(prompt).toContain("2. Follow your role's mandatory skills and execute the phase contract.");
    expect(prompt).toContain("5. Self-validate via the contract's check command before reporting.");
    expect(prompt).toContain("6. Do NOT run phasedev advance. Report results, blockers, and applied skills.");
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
