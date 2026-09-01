import { describe, test, expect } from "bun:test";
import { renderSkillPolicy, renderSkillComplianceLine } from "../src/features/phase-control/skill-policy";

describe("renderSkillPolicy", () => {
  test("renders the skill boundary header and role/skills instruction", () => {
    const text = renderSkillPolicy();
    expect(text).toContain("## Skill Boundary");
    expect(text).toContain(
      "Your role and mandatory skills are specified in your dispatch prompt; apply their methods, algorithms, and checklists."
    );
  });

  test("states precedence of mandatory named skills over runtime discovery", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "- Mandatory skills named for your role take precedence over runtime discovery."
    );
  });

  test("states discovery fallback when no skill is named", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "- If no skill was named, select applicable skills from your runtime environment under these same boundaries."
    );
  });

  test("states skills provide methodology only and do not alter flow state", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "- Skills provide methodology only; they never alter PhaseDev flow state, schemas, approvals, verdicts, or allowed files."
    );
  });

  test("states mapping skill findings into existing artifact template fields without parallel structures", () => {
    const text = renderSkillPolicy();
    expect(text).toContain(
      "- Map skill findings into existing artifact template fields or final response; do not invent parallel artifact structure."
    );
  });

  test("produces the exact expected skill policy output", () => {
    const text = renderSkillPolicy();
    const expected = [
      "## Skill Boundary",
      "",
      "Your role and mandatory skills are specified in your dispatch prompt; apply their methods, algorithms, and checklists.",
      "",
      "- Mandatory skills named for your role take precedence over runtime discovery.",
      "- If no skill was named, select applicable skills from your runtime environment under these same boundaries.",
      "- Skills provide methodology only; they never alter PhaseDev flow state, schemas, approvals, verdicts, or allowed files.",
      "- Map skill findings into existing artifact template fields or final response; do not invent parallel artifact structure.",
      ""
    ].join("\n");
    expect(text).toBe(expected);
  });
});

describe("renderSkillComplianceLine", () => {
  test("renders the streamlined skill compliance reporting format", () => {
    const text = renderSkillComplianceLine();
    expect(text).toBe(
      "Skill compliance: list applied skills in your response (e.g. `Skills: <skill> (APPLIED)` or `Skills: <skill> (N/A: reason)`)."
    );
  });
});

