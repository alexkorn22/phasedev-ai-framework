import { describe, test, expect } from "bun:test";
import { renderSkillPolicy, renderSkillComplianceLine } from "../src/features/phase-control/skill-policy";

describe("renderSkillPolicy", () => {
  test("states the mandatory case for a named role skill", () => {
    const text = renderSkillPolicy();
    expect(text).toContain("Your role and the skills mandatory for it are named in your dispatch prompt.");
    expect(text).toContain("do not substitute your own discovery");
  });

  test("states the discovery permission when the dispatch names no skill for the role", () => {
    const text = renderSkillPolicy();
    expect(text).toContain("no role line at all");
    expect(text).toContain("select applicable skills from your own runtime environment");
  });

  test("keeps the shared boundary rules for both cases", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "Skills are method instructions only; they never control Flow state (artifact formats, phase transitions, approvals, verdicts, archive state, allowed files). PhaseDev owns those."
    );
    expect(text).toContain("Native skill reports, headings, and output formats are not Flow artifact structure");
    expect(text).toContain("Skills may not create persistent files outside this phase allowlist");
  });
});

describe("renderSkillComplianceLine", () => {
  test("keeps the mandated-skill compliance format", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain("Skill compliance: one entry per skill named in your dispatch prompt.");
    expect(text).toContain(
      "Format: `skill-name`: APPLIED(mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)"
    );
  });

  test("admits an environment-selected skill as a distinguishable APPLIED source", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain(
      "Format: `skill-name`: APPLIED(source: environment, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)"
    );
  });

  test("keeps the no-role-assigned line working", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain("Format: `no role assigned` (the whole section, only when your dispatch carried no role line)");
  });
});
