import { describe, test, expect } from "bun:test";
import { renderSkillPolicy, renderSkillComplianceLine } from "../src/features/phase-control/skill-policy";

describe("renderSkillPolicy", () => {
  test("states the mandatory case for a named role skill", () => {
    const text = renderSkillPolicy();
    expect(text).toContain("Your role, and any mandatory skills for it, are named in your dispatch prompt");
    expect(text).toContain("do not substitute your own discovery when your dispatch names any skill for it");
  });

  test("states the discovery permission when the dispatch names no skill for the role", () => {
    const text = renderSkillPolicy();
    expect(text).toContain("no role line at all");
    expect(text).toContain("select applicable skills from your own runtime environment");
    expect(text).toContain("under the same boundary rules below");
  });

  test("reserves the genuinely-empty terminal for no role line plus nothing found in the environment", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "if your dispatch also carried no role line and no such skill is visible there either, no role was assigned and none was selected"
    );
  });

  test("does not echo the other case's terminal label in this case's guard prose", () => {
    const text = renderSkillPolicy();
    const noRoleClauseStart = text.indexOf("if your dispatch also carried no role line");
    const noRoleClauseEnd = text.indexOf(". If your dispatch instead named a role", noRoleClauseStart);
    const noRoleClause = text.slice(noRoleClauseStart, noRoleClauseEnd);
    expect(noRoleClause).not.toContain("no skill applies");
  });

  test("states the distinct terminal for a role assigned with no named skill and nothing found in the environment", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "If your dispatch instead named a role with an empty skill list and no such skill is visible there either, your role still applies but no skill does."
    );
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

  test("labels each APPLIED format line with the case it belongs to", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain(
      "Format: `skill-name`: APPLIED(mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>) — dispatch named this skill for your role."
    );
    expect(text).toContain(
      "Format: `skill-name`: APPLIED(source: environment, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>) — you selected this skill yourself because your dispatch named none."
    );
  });

  test("states the environment report is the normal case whenever no skill was named", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain(
      "When your dispatch names no skill for your role, report one entry per skill you selected from your own runtime environment instead"
    );
  });

  test("keeps the no-role-assigned line working as the genuinely-empty terminal", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain(
      "Format: `no role assigned` (the whole section, only when your dispatch carried no role line AND no applicable skill was visible in your runtime environment)"
    );
  });

  test("gives the role-assigned-but-empty-list-and-nothing-found case its own distinct terminal", () => {
    const text = renderSkillComplianceLine();
    expect(text).toContain(
      "Format: `no skill applies` (the whole section, only when your dispatch named a role with an empty skill list AND no applicable skill was visible in your runtime environment)"
    );
  });
});
