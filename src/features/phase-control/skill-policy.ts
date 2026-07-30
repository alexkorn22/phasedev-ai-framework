/**
 * Role and mandatory skills reach a sub-agent through its dispatch prompt
 * (resolved by `phasedev spawn-plan`), so the phase contract only states the
 * boundary within which those skills may be applied.
 */
export function renderSkillPolicy(): string {
  return [
    "## Skill Boundary",
    "",
    "Your role, and any mandatory skills for it, are named in your dispatch prompt; apply their methods, algorithms, checklists, and review logic when any are named.",
    "",
    "- Those named skills are mandatory for your role; do not substitute your own discovery when your dispatch names any skill for it.",
    "- When your dispatch names no skill for your role — an empty list, or no role line at all — select applicable skills from your own runtime environment instead, under the same boundary rules below; if your dispatch also carried no role line and no such skill is visible there either, no role was assigned and none was selected. If your dispatch instead named a role with an empty skill list and no such skill is visible there either, your role still applies but no skill does.",
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
    "When your dispatch names no skill for your role, report one entry per skill you selected from your own runtime environment instead — this is the normal report whenever no skill was named, whether the role line was empty or absent entirely.",
    "Format: `skill-name`: APPLIED(mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>) — dispatch named this skill for your role.",
    "Format: `skill-name`: APPLIED(source: environment, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>) — you selected this skill yourself because your dispatch named none.",
    "Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])",
    "Format: `skill-name`: UNAVAILABLE(exact_name: <name>, reason: <not found/unavailable/error>)",
    "Format: `no role assigned` (the whole section, only when your dispatch carried no role line AND no applicable skill was visible in your runtime environment)",
    "Format: `no skill applies` (the whole section, only when your dispatch named a role with an empty skill list AND no applicable skill was visible in your runtime environment)"
  ].join("\n");
}
