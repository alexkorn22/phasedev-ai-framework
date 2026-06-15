import { Stage } from "../../entities/stage/types";
import { Config, getStageSkillConfig, StageSkillConfig } from "../../entities/config/config";

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

function hasOnlyConfiguredRouters(skills: StageSkillConfig): boolean {
  return skills.routers.length > 0 && skills.main.length === 0 && skills.additional.length === 0;
}

function flowSkillBoundaryProtocol(): string[] {
  return [
    "## Flow Skill Boundary Protocol",
    "",
    "Authority order: Flow stage contract > Artifact Build Contract > artifact template > configured skill policy > selected skill body.",
    "",
    "- Skills are method instructions only; they never control Flow state.",
    "- This prompt is the stage skill policy compiled from `config.yaml`.",
    "- Skill names are exact config values; do not replace them with similar, inferred, or remembered skills.",
    "- Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed stage skill configuration.",
    "- If a listed skill is unavailable but is not needed or applicable for the available stage evidence, continue under this Flow stage contract and record it as skipped/unavailable in the final skill compliance note.",
    "- If a listed skill is unavailable and is needed or applicable for the available stage evidence, or the configured stage contract requires that skill for the work, stop and report a blocker.",
    "- Use a selected skill's method, checklist, algorithm, or review logic when it applies to the stage evidence.",
    "- Do not preload every configured skill body; keep skill loading minimal.",
    "- Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Do not skip an applicable selected skill because its native output format differs; adapt useful output into the current Flow contract.",
    "- Convert useful skill output into the current artifact template, final response, or blocker. Do not invent extra Flow artifact structure.",
    "- In the final response, include a short skill compliance note listing router skills used, router-selected skills used, main/additional skills used, and skipped/unavailable listed skills."
  ];
}

function stageSpecificRules(stage: Stage): string[] {
  if (stage === "setup") {
    return [
      "- Setup skills are post-intake only: do not load, read, route through, or apply any configured skill until the task/change description and task-specific rules or constraints are available.",
      "- If setup intake is missing, ignore the configured skill list for now, ask only for the missing intake, and stop.",
      "- After intake is available, configured skills may be used only as methods for shaping `prd.md` and `rules.md` within the embedded Artifact Build Contracts.",
      "- For setup, router skills such as `using-ecc` may classify the task, select an applicable method skill, or improve context discipline, but they do not authorize reading framework source, framework templates, config files, or unrelated repository areas that this Stage 0 contract forbids.",
      "- If a router-selected skill asks for extra reports, headings, lifecycle files, broad codebase scans, or source/template reading beyond this setup contract, adapt only the relevant method guidance and keep the Stage 0 repository-reading limits."
    ];
  }

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

function externalSkillArtifactRule(stage: Stage): string {
  if (stage === "phase_validation" || stage === "final_validation") {
    return "- Skills may not create persistent files outside this stage allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`.";
  }

  return "- Skills may not create persistent files outside this stage allowlist; map relevant conclusions only into existing template fields/rows or final response.";
}

function noMatchingSkillRule(stage: Stage): string {
  if (stage === "setup") {
    return "- For setup, if no configured or router-selected skill fits the available post-intake evidence, continue under this Flow stage contract and record that no applicable configured skill was used. Stop only when needed stage work requires a skill outside the allowed external skill set.";
  }

  if (stage === "research") {
    return "- If no configured or router-selected skill fits the available stage evidence, continue under this Flow stage contract and record that no applicable configured skill was used. Stop only when needed stage work requires a skill outside the allowed external skill set.";
  }

  return "- If none fits, stop and ask the user to update `config.yaml` or approve an exception.";
}

function routerPriorityRule(stage: Stage, onlyRouters: boolean): string {
  if (stage === "setup") {
    return "- Priority 1: after setup intake is available, use listed router skills first when they help shape the setup artifacts.";
  }

  if (stage === "research" && onlyRouters) {
    return "- Priority 1: use listed router skills first when they help select a relevant research method; if no router is available or applicable, continue under this Flow stage contract.";
  }

  return "- Priority 1: use listed router skills first.";
}

export function renderSkillPolicy(stage: Stage, config: Config): string {
  const skills = getStageSkillConfig(config, stage);
  const onlyRouters = hasOnlyConfiguredRouters(skills);
  const routerRules = hasConfiguredRouters(skills)
    ? [
      routerPriorityRule(stage, onlyRouters),
      "- Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.",
      ...(skills.main.length > 0
        ? ["- Priority 2: use listed main skills only when router skills and router-selected skills are insufficient for the stage evidence."]
        : []),
      ...(skills.additional.length > 0
        ? ["- Priority 3: use listed additional skills only when Priority 1 and Priority 2 skills are insufficient or an additional skill is clearly better."]
        : []),
      "- Allowed external skills: listed router skills, skills selected by listed router skills, listed main skills, and listed additional skills.",
      noMatchingSkillRule(stage)
    ]
    : [
      "- No routers are configured; use main skills first.",
      "- Use additional skills only when main skills are insufficient or an additional skill is clearly better.",
      "- Allowed external skills: only the main and additional skills listed in this prompt.",
      noMatchingSkillRule(stage)
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
    ? onlyRouters
      ? [
        "Allowed skills:",
        "",
        "Priority 1 - Routers:",
        formatSkillList(skills.routers),
        "",
        "Priority 2 - Main: none configured",
        "Priority 3 - Additional: none configured"
      ]
      : [
      "Allowed skills:",
      "",
      "Priority 1 - Routers:",
      formatSkillList(skills.routers),
      "",
      "Priority 2 - Main:",
      formatSkillList(skills.main),
      "",
      "Priority 3 - Additional:",
      formatSkillList(skills.additional)
    ]
    : [
      "Allowed skills:",
      "",
      "Priority 1 - Routers:",
      "- none configured",
      "",
      "Priority 2 - Main:",
      formatSkillList(skills.main),
      "",
      "Priority 3 - Additional:",
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
