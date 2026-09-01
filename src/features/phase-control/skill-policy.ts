/**
 * Role and mandatory skills reach a sub-agent through its dispatch prompt
 * (resolved by `phasedev spawn-plan`), so the phase contract only states the
 * boundary within which those skills may be applied.
 */
export function renderSkillPolicy(): string {
  return [
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
}

export function renderSkillComplianceLine(): string {
  return [
    "Skill compliance: list applied skills in your response (e.g. `Skills: <skill> (APPLIED)` or `Skills: <skill> (N/A: reason)`)."
  ].join("\n");
}

