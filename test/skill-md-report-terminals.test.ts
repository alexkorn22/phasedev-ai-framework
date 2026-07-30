import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const skillMdPath = path.join(repoRoot, "skills", "phasedev-orchestrator", "SKILL.md");
const skillMd = fs.readFileSync(skillMdPath, "utf-8");

const NO_ROLE_LABEL = `"no role assigned"`;
const NO_SKILL_LABEL = `"no skill applies"`;
function occurrenceIndexes(needle: string): number[] {
  const indexes: number[] = [];
  let index = skillMd.indexOf(needle);
  while (index !== -1) {
    indexes.push(index);
    index = skillMd.indexOf(needle, index + 1);
  }
  return indexes;
}

// Each label's own guard clause runs from the label up to the next clause
// boundary (";" or the closing ")"/"." of the enclosing sentence) — stopping
// there keeps the neighboring label's clause out of the extracted window.
function guardClauseAfter(index: number): string {
  const rest = skillMd.slice(index, index + 400);
  const boundary = rest.search(/[;.)]/);
  return boundary === -1 ? rest : rest.slice(0, boundary);
}

function guardWindowsAfter(indexes: number[]): string[] {
  return indexes.map(guardClauseAfter);
}

describe("phasedev-orchestrator SKILL.md report terminal guards", () => {
  test("names both terminal labels at the report step and the feedback-dispatch instruction", () => {
    const roleAssignedIndexes = occurrenceIndexes(NO_ROLE_LABEL);
    const skillAppliesIndexes = occurrenceIndexes(NO_SKILL_LABEL);

    expect(roleAssignedIndexes.length).toBe(2);
    expect(skillAppliesIndexes.length).toBe(2);
  });

  test("guards 'no role assigned' with the role-line-absent condition, at both sites", () => {
    const windows = guardWindowsAfter(occurrenceIndexes(NO_ROLE_LABEL));
    expect(windows.length).toBe(2);
    for (const window of windows) {
      expect(window).toMatch(/only when the role line was (absent|omitted) AND no such skill was visible in your environment either/);
    }
  });

  test("guards 'no skill applies' with the role-assigned-but-empty-list condition, at both sites", () => {
    const windows = guardWindowsAfter(occurrenceIndexes(NO_SKILL_LABEL));
    expect(windows.length).toBe(2);
    for (const window of windows) {
      expect(window).toMatch(
        /instead when the role line named a role but listed no skill AND no such skill was visible in your environment either/
      );
      expect(window).toContain("your role still applies but no skill does");
    }
  });

  test("exclusivity: the two terminal labels are distinct, and their guard conditions describe mutually exclusive role-line states", () => {
    expect(NO_ROLE_LABEL).not.toBe(NO_SKILL_LABEL);

    const roleAssignedWindows = guardWindowsAfter(occurrenceIndexes(NO_ROLE_LABEL));
    const skillAppliesWindows = guardWindowsAfter(occurrenceIndexes(NO_SKILL_LABEL));

    // "no role assigned" requires the role line to be missing (absent/omitted) and must
    // never also require a role to have been named — that would overlap the other terminal.
    for (const window of roleAssignedWindows) {
      expect(window).toMatch(/role line was (absent|omitted)/);
      expect(window).not.toContain("named a role but listed no skill");
    }

    // "no skill applies" requires a role to have been named (role line present) and must
    // never also accept the role line being absent/omitted — that would overlap the other terminal.
    for (const window of skillAppliesWindows) {
      expect(window).toContain("named a role but listed no skill");
      expect(window).not.toMatch(/role line was (absent|omitted)/);
    }
  });
});
