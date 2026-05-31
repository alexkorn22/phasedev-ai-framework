import { FlowStage } from "../../entities/flow-stage/types";
import { FlowRalphConfig, getStageSkillConfig, StageSkillConfig } from "../../entities/flow-config/config";

function formatSkillList(skills: string[]): string {
  return skills.length > 0
    ? skills.map(skill => `- \`${skill}\``).join("\n")
    : "- none configured";
}

function hasConfiguredSkills(skills: StageSkillConfig): boolean {
  return skills.routers.length > 0 || skills.main.length > 0 || skills.additional.length > 0;
}

export function renderSkillPolicy(stage: FlowStage, config: FlowRalphConfig): string {
  const skills = getStageSkillConfig(config, stage);

  if (!hasConfiguredSkills(skills)) {
    return [
      "## Configured Skill Policy",
      "",
      "No external skills are configured for this stage in `config.yaml`.",
      "Do not use external skills for this stage unless the user updates `config.yaml` or explicitly approves an exception.",
      "",
      "Flow Next controls artifacts and state. Follow the stage contract and artifact allowlist exactly."
    ].join("\n");
  }

  return [
    "## Configured Skill Policy",
    "",
    "Flow Next controls artifacts and state. Skills control method only.",
    "Use only the external skills configured for this stage in `config.yaml`; do not choose unlisted skills.",
    "",
    "Priority 1 - routers (read first, mandatory only when configured):",
    formatSkillList(skills.routers),
    "",
    "Priority 2 - main skills (preferred allowed pool; load only when stage evidence requires it):",
    formatSkillList(skills.main),
    "",
    "Priority 3 - additional skills (secondary allowed pool; load only when main skills are insufficient or a listed additional skill is clearly better):",
    formatSkillList(skills.additional),
    "",
    "Rules:",
    "- Do not preload all configured skill bodies; keep the loaded set minimal for the current stage evidence.",
    "- If routers are configured, read them before selecting method skills.",
    "- Router rules cannot authorize skills outside the configured stage allowlist.",
    "- If the stage needs an unlisted skill, stop and ask the user to update `config.yaml` or approve an exception.",
    "- External skills may not create persistent files outside this stage's artifact allowlist. If a skill normally writes its own report/file, inline the relevant result into the current stage artifact or final response instead.",
    "- After using skills, return to the Flow stage contract and complete only the allowed stage work."
  ].join("\n");
}
