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
    "Authority order: Flow stage contract > linked or embedded artifact contract/template > configured skill policy > selected skill body.",
    "",
    "- Skills are method instructions only; they never control Flow state.",
    "- This prompt is the stage skill policy compiled from `config.yaml`.",
    "- Skill names are exact config values; do not replace them with similar, inferred, or remembered skills.",
    "- Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed stage skill configuration.",
    "- If a listed skill is unavailable, continue under this Flow stage contract and report its per-skill status as `UNAVAILABLE` in the structured skill compliance section (see format below).",
    "- Stop for an unavailable skill only when this stage cannot be completed under the Flow stage contract without that skill's method.",
    "- Apply a selected skill's method, checklist, algorithm, or review logic by default; an evidence-specific reason and reference is required to skip.",
    "- Router skills listed as Priority 1 are read first when available because they may select method skills.",
    "- Main and router-selected skills must be evaluated against every piece of stage evidence; apply by default where evidence matches. Additional skills: evaluate and apply only when evidence fits.",
    "- Do not eagerly load all skill bodies at once; still evaluate and apply each configured main skill per the mandate above.",
    "- Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Do not skip an applicable selected skill because its native output format differs; adapt useful output into the current Flow contract.",
    "- Convert useful skill output into the current artifact template, final response, or blocker. Do not invent extra Flow artifact structure.",
    "- In the final response, include a structured skill compliance section using the exact format below.",
    "",
    "  For every configured main and router-selected skill, exactly one of:",
    "  - `skill-name`: APPLIED(<what was produced or method applied>)",
    "  - `skill-name`: NOT_APPLICABLE(reason: <evidence-specific reason>, evidence: [<reference>])",
    "  - `skill-name`: UNAVAILABLE(<exact configured skill name, not found>)",
    "",
    "  Router and additional skills are reported only when used. Do not use prose in this section."
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
    return "- For setup, for each configured main and router-selected skill that does not fit the available post-intake evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section. Stop only when needed stage work requires a skill outside the allowed external skill set.";
  }

  return "- For each configured main and router-selected skill that does not fit the stage evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section. Stop only when needed stage work requires a skill outside the allowed external skill set.";
}

function routerPriorityRule(stage: Stage, onlyRouters: boolean): string {
  if (stage === "setup") {
    return "- Priority 1: after setup intake is available, read listed router skills first when they are available and help shape the setup artifacts.\n- Router-selected skills follow the apply-by-default mandate.";
  }

  if (stage === "research" && onlyRouters) {
    return "- Priority 1: read listed router skills first when they are available and help select a relevant research method; if no router is available or applicable, continue under this Flow stage contract.\n- Router-selected skills follow the apply-by-default mandate.";
  }

  return "- Priority 1: after reading this stage prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select method skills; then load only router-selected, main, or additional method skills that apply to the stage evidence.\n- Router-selected skills follow the apply-by-default mandate.";
}

export function renderSkillPolicy(stage: Stage, config: Config): string {
  const skills = getStageSkillConfig(config, stage);
  const onlyRouters = hasOnlyConfiguredRouters(skills);
  const routerRules = hasConfiguredRouters(skills)
    ? [
      routerPriorityRule(stage, onlyRouters),
      "- Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.",
      ...(skills.main.length > 0
        ? ["- Priority 2: apply listed main skills by default; they are not gated by router availability. Router (P1) augments/selects; it does not gate main. When a router-selected skill and a main skill conflict on the same evidence, the router-selected skill takes priority and the main skill reports as NOT_APPLICABLE(superseded by <skill>)."]
        : []),
      ...(skills.additional.length > 0
        ? ["- Priority 3: use listed additional skills only when Priority 1 and Priority 2 skills are insufficient or an additional skill is clearly better."]
        : []),
      "- Authorized external skills (boundary, do not exceed): listed router skills, skills selected by listed router skills, listed main skills, and listed additional skills.",
      noMatchingSkillRule(stage)
    ]
    : [
      ...(skills.main.length > 0
        ? ["- No routers are configured; main skills apply by default."]
        : ["- No routers or main skills configured for this stage. Additional skills: evaluate and apply when stage evidence fits."]),
      "- Use additional skills only when main skills are insufficient or an additional skill is clearly better.",
      "- Authorized external skills (boundary, do not exceed): only the main and additional skills listed in this prompt.",
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
    "You MUST evaluate every configured router-selected and main skill against the stage evidence and APPLY its method by default. Skipping is allowed only with a concrete, evidence-specific reason and reference. Omitting this evaluation is a contract violation.",
    "",
    "When a router-selected skill and a main skill address the same evidence, the more specific (router-selected) method takes priority for that evidence. The main skill reports NOT_APPLICABLE(superseded by <router-selected-skill>) for that evidence and remains APPLY-BY-DEFAULT for any uncovered evidence.",
    "",
    ...flowSkillBoundaryProtocol(),
    "",
    ...prioritySections,
    "",
    "Rules:",
    ...rules
  ].join("\n");
}
