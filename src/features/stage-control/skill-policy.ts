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
    "- If a configured router, configured `main`, or router-selected skill is unavailable, the stage cannot be completed under its mandatory-execution contract; report the skill as `UNAVAILABLE` and stop with a blocker unless the skill is proven `NOT_APPLICABLE` to all current stage evidence.",
    "- Configured `additional` skills are optional until selected. Once selected because configured router/main skills are insufficient or the additional skill is clearly better, unavailable or failed mandatory additional-skill steps block completion unless another authorized skill fully covers the same evidence.",
    "- Fully execute a selected skill's mandatory instructions by default; an evidence-specific reason and reference is required to skip.",
    "- Router skills listed as Priority 1 are read first when available because they may select execution-method skills.",
    "- Configured router skills are mandatory routing/control skills for this stage.",
    "- Configured `main` skills are mandatory execution-method skills for this stage.",
    "- Configured routers, configured main skills, and router-selected skills must be evaluated against every piece of stage evidence; fully execute by default where evidence matches. Additional skills: evaluate and apply only when evidence fits.",
    "- Do not eagerly load method skill bodies before stage/artifact context is understood; still read each configured router first when stage timing allows, then evaluate and fully execute each configured main skill per the mandate above.",
    "- Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Do not skip an applicable selected skill because its native output format differs; adapt useful output into the current Flow contract.",
    "- Native skill reports, headings, lifecycle files, and artifact formats are not Flow artifact structure; adapt results into the current PhaseDev artifact template, final response, or blocker instead.",
    "- In the final response, include a structured skill compliance section using the exact format below.",
    "",
    "## Skill Execution Contract",
    "",
    "- `APPLIED` means the agent read the full skill body and any skill-required referenced instruction files, then executed every mandatory phase, checklist, tool/preload step, quality gate, degraded-mode decision, and self-evaluation that applies to the current stage evidence.",
    "- Loading a skill, reading only its name/frontmatter, or writing a manual review inspired by it is not `APPLIED`.",
    "- Do not replace mandatory skill steps with ad hoc grep, prose, or `echo` acknowledgements. Prose claims are not evidence that a tool, command, checklist, or gate ran.",
    "- If a mandatory skill step conflicts with this Flow stage, artifact allowlist, or repository policy, record it as `skipped_by_policy` with the exact policy reason; do not report it as passed.",
    "- If an applicable mandatory skill step cannot be executed and is not policy-skipped, stop with a blocker or report the skill as unavailable/blocking. Do not finish the stage with a green compliance claim.",
    "- Native skill output format may be adapted to PhaseDev, but mandatory skill instructions must not be dropped.",
    "",
    "  For every configured router, configured main, and router-selected skill, exactly one of:",
    "  - `skill-name`: APPLIED(source: <skill body loaded/read>, mandatory_steps: <done/skipped_by_policy/blocking summary>, evidence: <files/commands/tool calls>, mapped_output: <PhaseDev artifact/final response/blocker>)",
    "  - `skill-name`: NOT_APPLICABLE(reason: <evidence-specific reason>, evidence: [<reference>])",
    "  - `skill-name`: UNAVAILABLE(exact_name: <exact configured skill name>, reason: <not found/tool unavailable/error>)",
    "",
    "  Selected additional skills use the same APPLIED/NOT_APPLICABLE/UNAVAILABLE format when used or when selection fails. Do not use prose in this section."
  ];
}

function flowSkillBoundaryProtocolCompact(): string[] {
  return [
    "## Flow Skill Boundary Protocol",
    "",
    "Authority order: Flow stage contract > linked or embedded artifact contract/template > configured skill policy > selected skill body.",
    "",
    "- Skills are method instructions only; they never control Flow state.",
    "- Flow owns artifact formats, stage transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed stage skill configuration.",
    "- Skill compliance final response entry must be `Skill compliance: none configured`.",
  ];
}

function stageSpecificRules(stage: Stage): string[] {
  if (stage === "change_intake") {
    return [
      "- Setup skills are post-intake only: do not load, read, route through, or apply any configured skill until the task/change description and task-specific rules or constraints are available.",
      "- If setup intake is missing, ignore the configured skill list for now, ask only for the missing intake, and stop.",
      "- After intake is available, configured skills may be used only as methods for shaping `prd.md` and `rules.md` within the embedded Artifact Build Contracts.",
      "- For setup, router skills such as `using-ecc` may classify the task, select an applicable method skill, or improve context discipline, but they do not authorize reading framework source, framework templates, config files, or unrelated repository areas that this Stage 0 contract forbids.",
      "- If a router-selected skill asks for extra reports, headings, lifecycle files, broad codebase scans, or source/template reading beyond this setup contract, adapt only the relevant method guidance and keep the Stage 0 repository-reading limits."
    ];
  }

  if (stage !== "iteration_validation" && stage !== "final_validation") {
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
  if (stage === "iteration_validation" || stage === "final_validation") {
    return "- Skills may not create persistent files outside this stage allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`.";
  }

  return "- Skills may not create persistent files outside this stage allowlist; map relevant conclusions only into existing template fields/rows or final response.";
}

function noMatchingSkillRule(stage: Stage): string {
  if (stage === "change_intake") {
    return "- For setup, for each configured router, configured main, and router-selected skill that does not fit the available post-intake evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section. Stop only when needed stage work requires a skill outside the allowed external skill set.";
  }

  return "- For each configured router, configured main, and router-selected skill that does not fit the stage evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section. Stop only when needed stage work requires a skill outside the allowed external skill set.";
}

function routerPriorityRule(stage: Stage, onlyRouters: boolean): string {
  if (stage === "change_intake") {
    return "- Priority 1: after setup intake is available, read listed router skills first when they are available and help shape the setup artifacts; fully execute any router-selected skill that applies to the setup evidence.\n- Router-selected skills follow the same mandatory execution contract as main skills.";
  }

  if (stage === "code_research" && onlyRouters) {
    return "- Priority 1: read listed router skills first when they are available and help select a relevant research method; fully execute any router-selected skill that applies to the research evidence. If no router-selected method applies after the configured router is read, continue under this Flow stage contract.\n- Router-selected skills follow the same mandatory execution contract as main skills.";
  }

  return "- Priority 1: after reading this stage prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select execution-method skills; then fully execute router-selected or main skills that apply to the stage evidence, and use additional skills only when their evidence-specific condition is met.\n- Router-selected skills follow the same mandatory execution contract as main skills.";
}

export function renderSkillPolicy(stage: Stage, config: Config): string {
  const skills = getStageSkillConfig(config, stage);
  const onlyRouters = hasOnlyConfiguredRouters(skills);
  const routerRules = hasConfiguredRouters(skills)
    ? [
      routerPriorityRule(stage, onlyRouters),
      "- Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.",
      ...(skills.main.length > 0
        ? ["- Priority 2: fully execute listed main skills by default; they are not gated by router availability. Router (P1) augments/selects; it does not gate main. When a router-selected skill and a main skill conflict on the same evidence, the router-selected skill takes priority and the main skill reports as NOT_APPLICABLE(superseded by <skill>) only for the superseded evidence."]
        : []),
      ...(skills.additional.length > 0
        ? ["- Priority 3: use listed additional skills only when Priority 1 and Priority 2 skills are insufficient or an additional skill is clearly better."]
        : []),
      "- Authorized external skills (boundary, do not exceed): listed router skills, skills selected by listed router skills, listed main skills, and listed additional skills.",
      noMatchingSkillRule(stage)
    ]
    : [
      ...(skills.main.length > 0
        ? ["- No routers are configured; main skills fully execute by default."]
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
      ...flowSkillBoundaryProtocolCompact(),
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
    "You MUST evaluate every configured router, configured main, and router-selected skill against the stage evidence and fully execute its mandatory instructions by default. Skipping is allowed only with a concrete, evidence-specific reason and reference. Omitting this evaluation is a contract violation.",
    "",
    "When a router-selected skill and a main skill address the same evidence, the more specific (router-selected) method takes priority for that evidence. The main skill reports NOT_APPLICABLE(superseded by <router-selected-skill>) for that evidence and remains mandatory-by-default for any uncovered evidence.",
    "",
    ...flowSkillBoundaryProtocol(),
    "",
    ...prioritySections,
    "",
    "Rules:",
    ...rules
  ].join("\n");
}
