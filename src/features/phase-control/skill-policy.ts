/**
 * Role and mandatory skills reach a sub-agent through its dispatch prompt
 * (resolved by `phasedev spawn-plan`), so the phase contract only states the
 * boundary within which those skills may be applied.
 */
export function renderSkillPolicy(): string {
  return [
    "## Skill Boundary",
    "",
    "Your role and the skills mandatory for it are named in your dispatch prompt. Apply their methods, algorithms, checklists, and review logic.",
    "",
    "- Skills are method instructions only; they never control Flow state (artifact formats, phase transitions, approvals, verdicts, archive state, allowed files). PhaseDev owns those.",
    "- Native skill reports, headings, and output formats are not Flow artifact structure; adapt useful output into the current PhaseDev artifact template, final response, or blocker.",
    "- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or the final response.",
    "- After using skills, return to the Flow phase contract and complete only allowed phase work.",
    ""
  ].join("\n");
}

export function renderSkillComplianceLine(): string {
  return [
    "Skill compliance: one entry per skill named in your dispatch prompt.",
    "Format: `skill-name`: APPLIED(mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)",
    "Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])",
    "Format: `skill-name`: UNAVAILABLE(exact_name: <name>, reason: <not found/unavailable/error>)",
    "Format: `no role assigned` (the whole section, only when your dispatch carried no role line)"
  ].join("\n");
}
