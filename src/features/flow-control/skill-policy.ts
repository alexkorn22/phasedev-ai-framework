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
    "- Skills are method instructions only; they never control Flow state.",
    "- Use a selected skill's method, checklist, algorithm, or review logic when it applies to the stage evidence.",
    "- Do not preload every configured skill body; keep skill loading minimal.",
    "- Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Do not skip an applicable selected skill because its native output format differs; adapt useful output into the current Flow contract.",
    "- Convert useful skill output into the current artifact template, final response, or blocker. Do not invent extra Flow artifact structure."
  ];
}

function stageSpecificRules(stage: FlowStage): string[] {
  if (stage !== "phase_validation" && stage !== "final_validation") {
    return [];
  }

  return [
    "- Validation stages are review-only: do not rerun tests, builds, browsers, deployments, migrations, or other execution gates.",
    "- Read-only review/audit/static-inspection skill methods are allowed only when they do not modify repo-tracked files or create persistent artifacts outside this stage allowlist.",
    "- Implementation checks are already declared passed; validation must not re-execute them.",
    "- `validation_findings.md` may contain only YAML frontmatter and one findings table; convert findings into rows and put non-registry explanation only in the final response."
  ];
}

function externalSkillArtifactRule(stage: FlowStage): string {
  if (stage === "phase_validation" || stage === "final_validation") {
    return "- Skills may not create persistent files outside this stage allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`.";
  }

  return "- Skills may not create persistent files outside this stage allowlist; map relevant conclusions only into existing template fields/rows or final response.";
}

export function renderSkillPolicy(stage: FlowStage, config: FlowRalphConfig): string {
  const skills = getStageSkillConfig(config, stage);
  const routerRules = hasConfiguredRouters(skills)
    ? [
      "- Read every configured router first before selecting method skills.",
      "- Router-selected skills explicitly named by router content have priority over main/additional skills.",
      "- Allowed external skills: configured routers, router-selected skills explicitly named by router content, configured main skills, configured additional skills.",
      "- If none fits, stop and ask the user to update `config.yaml`, update the router, or approve an exception."
    ]
    : [
      "- No routers are configured; use main skills first.",
      "- Use additional skills only when main skills are insufficient or an additional skill is clearly better.",
      "- Allowed external skills: configured main skills and configured additional skills.",
      "- If none fits, stop and ask the user to update `config.yaml` or approve an exception."
    ];
  const rules = [
    ...routerRules,
    externalSkillArtifactRule(stage),
    ...stageSpecificRules(stage),
    "- After using skills, return to the Flow stage contract and complete only allowed stage work."
  ];

  if (!hasConfiguredSkills(skills)) {
    return [
      "## Configured Skill Policy",
      "",
      "No external skills are configured for this stage in `config.yaml`.",
      "Do not use external skills unless the user updates `config.yaml` or explicitly approves an exception.",
      "",
      ...flowSkillBoundaryProtocol(),
      "",
      "Follow the stage contract and artifact allowlist exactly.",
      ...stageSpecificRules(stage)
    ].join("\n");
  }

  const prioritySections = hasConfiguredRouters(skills)
    ? [
      "Allowed skills:",
      "",
      "Routers (read first):",
      formatSkillList(skills.routers),
      "",
      "Router-selected:",
      "- determined after reading routers; explicit router content only",
      "",
      "Main fallback:",
      formatSkillList(skills.main),
      "",
      "Additional fallback:",
      formatSkillList(skills.additional)
    ]
    : [
      "Allowed skills:",
      "",
      "Routers:",
      "- none configured",
      "",
      "Main:",
      formatSkillList(skills.main),
      "",
      "Additional fallback:",
      formatSkillList(skills.additional)
    ];

  return [
    "## Configured Skill Policy",
    "",
    ...flowSkillBoundaryProtocol(),
    "",
    ...prioritySections,
    "",
    "Rules:",
    ...rules
  ].join("\n");
}
