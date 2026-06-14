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

function hasConfiguredRouters(skills: StageSkillConfig): boolean {
  return skills.routers.length > 0;
}

function flowSkillBoundaryProtocol(): string[] {
  return [
    "## Flow Skill Boundary Protocol",
    "",
    "Authority order: Flow stage contract > Artifact Build Contract > artifact template > configured skill policy > selected skill body.",
    "",
    "- Configured skills are execution-method instructions, not Flow-state authorities.",
    "- If a selected skill applies to the stage work, use its method, checklist, algorithm, or review logic.",
    "- Do not skip a selected skill only because it defines its own report, artifact, lifecycle, or output format.",
    "- Flow owns artifact formats, stage transitions, approval state, validation verdicts, archive state, and allowed persistent files.",
    "- Skill-specific artifacts, sections, tables, reports, lifecycle steps, approval changes, and state changes must be discarded or adapted into the current Flow contract.",
    "- Convert useful skill output into the current artifact template, the final response, or a blocker. Do not invent extra Flow artifact structure for skill output."
  ];
}

function stageSpecificRules(stage: FlowStage): string[] {
  if (stage !== "phase_validation" && stage !== "final_validation") {
    return [];
  }

  return [
    "- Validation stages are review-only. Do not rerun tests, builds, browsers, deployments, migrations, or other execution gates as validation gates.",
    "- Read-only review, audit, and static-inspection methods selected by the configured skill policy are allowed when they do not modify repo-tracked files and do not create persistent artifacts outside this stage's allowlist.",
    "- Do not let a skill override the validation stage rule that Implementation checks are already declared passed and must not be re-executed.",
    "- `validation_findings.md` may contain only YAML frontmatter and exactly one markdown findings table. Convert skill findings into strict `validation_findings.md` rows when they are findings; put non-registry explanation only in the final response."
  ];
}

function externalSkillArtifactRule(stage: FlowStage): string {
  if (stage === "phase_validation" || stage === "final_validation") {
    return "- External skills may not create persistent files outside this stage's artifact allowlist. If a skill normally writes its own report/file, do not inline prose, sections, evidence blocks, or extra tables into `validation_findings.md`.";
  }

  return "- External skills may not create persistent files outside this stage's artifact allowlist. If a skill normally writes its own report/file, map only its relevant conclusions into existing template fields/rows or the final response.";
}

export function renderSkillPolicy(stage: FlowStage, config: FlowRalphConfig): string {
  const skills = getStageSkillConfig(config, stage);
  const routerRules = hasConfiguredRouters(skills)
    ? [
      "- If routers are configured, read every configured router before selecting method skills.",
      "- Apply router instructions to the current stage evidence. If a router selects a matching skill from its own content or routing table, load and use that router-selected skill before considering main or additional skills.",
      "- Authorized external skills are limited to configured routers, router-selected skills explicitly named by router content, configured main skills, and configured additional skills.",
      "- If no router-selected, main, or additional skill fits the stage need, stop and ask the user to update `config.yaml`, update the router, or approve an exception."
    ]
    : [
      "- No routers are configured for this stage; use main skills first and additional skills only when main skills are insufficient or a listed additional skill is clearly better.",
      "- Authorized external skills are limited to configured main skills and configured additional skills.",
      "- If no main or additional skill fits the stage need, stop and ask the user to update `config.yaml` or approve an exception."
    ];
  const rules = [
    "- Do not preload all configured skill bodies; keep the loaded set minimal for the current stage evidence.",
    ...routerRules,
    externalSkillArtifactRule(stage),
    ...stageSpecificRules(stage),
    "- After using skills, return to the Flow stage contract and complete only the allowed stage work."
  ];

  if (!hasConfiguredSkills(skills)) {
    return [
      "## Configured Skill Policy",
      "",
      "No external skills are configured for this stage in `config.yaml`.",
      "Do not use external skills for this stage unless the user updates `config.yaml` or explicitly approves an exception.",
      "",
      ...flowSkillBoundaryProtocol(),
      "",
      "Flow Next controls artifacts and state. Follow the stage contract and artifact allowlist exactly.",
      ...stageSpecificRules(stage)
    ].join("\n");
  }

  const prioritySections = hasConfiguredRouters(skills)
    ? [
      "Use only configured routers, router-selected skills explicitly named by router content, configured main skills, or configured additional skills.",
      "",
      "Priority 1 - routers (read every configured router first, mandatory only when configured):",
      formatSkillList(skills.routers),
      "",
      "Priority 2 - router-selected skills (highest priority method skills when a configured router selects a matching skill from its own content or routing table):",
      "- determined after reading configured routers",
      "",
      "Priority 3 - main skills (use only when routers are not configured or no router-selected skill fits the stage evidence):",
      formatSkillList(skills.main),
      "",
      "Priority 4 - additional skills (secondary allowed pool; load only when router-selected and main skills are insufficient or a listed additional skill is clearly better):",
      formatSkillList(skills.additional)
    ]
    : [
      "Use only configured main skills or configured additional skills.",
      "",
      "Priority 1 - routers (mandatory only when configured):",
      "- none configured",
      "",
      "Priority 2 - main skills (preferred allowed pool; load only when stage evidence requires it):",
      formatSkillList(skills.main),
      "",
      "Priority 3 - additional skills (secondary allowed pool; load only when main skills are insufficient or a listed additional skill is clearly better):",
      formatSkillList(skills.additional)
    ];

  return [
    "## Configured Skill Policy",
    "",
    "Flow Next controls artifacts and state. Skills control method only.",
    "",
    ...flowSkillBoundaryProtocol(),
    "",
    ...prioritySections,
    "",
    "Rules:",
    ...rules
  ].join("\n");
}
