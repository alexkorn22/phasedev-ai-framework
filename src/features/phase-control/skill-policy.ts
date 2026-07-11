import { Phase } from "../../entities/phase/types";
import { Config, getPhaseSkillConfig, PhaseSkillConfig } from "../../entities/config/config";

function formatSkillList(skills: string[]): string {
  return skills.length > 0
    ? skills.map(skill => `- \`${skill}\``).join("\n")
    : "- none configured";
}

function hasConfiguredSkills(skills: PhaseSkillConfig): boolean {
  return skills.routers.length > 0 || skills.main.length > 0 || skills.additional.length > 0;
}

function hasConfiguredRouters(skills: PhaseSkillConfig): boolean {
  return skills.routers.length > 0;
}

function hasOnlyConfiguredRouters(skills: PhaseSkillConfig): boolean {
  return skills.routers.length > 0 && skills.main.length === 0 && skills.additional.length === 0;
}

function flowSkillBoundaryProtocol(): string[] {
  return [
    "## Flow Skill Boundary Protocol",
    "",
    "Authority: Flow phase contract > linked/embedded artifact contract > configured skill policy > skill body.",
    "",
    "- Skills are method instructions only; they never control Flow state (artifact formats, phase transitions, approvals, verdicts, archive state, allowed files).",
    "- Read Priority 1 router skills first (they may select execution-method skills); then evaluate configured `main` and router-selected skills against phase evidence. `additional` skills are optional unless routers/main are insufficient.",
    "- If a configured router, configured `main`, or router-selected skill is unavailable and applicable, stop with a blocker. Skip only with a concrete evidence-specific reason.",
    "- Final response: one line per skill — `APPLIED` / `NOT_APPLICABLE(reason)` / `UNAVAILABLE`.",
    "- Native skill reports, headings, and output formats are not Flow artifact structure; adapt useful output into the current PhaseDev artifact template, final response, or blocker."
  ];
}

function flowSkillBoundaryProtocolEnv(): string[] {
  return [
    "## Flow Skill Boundary Protocol",
    "",
    "- Skills are method instructions only; they never control Flow state. Flow owns artifact formats, phase transitions, approvals, validation verdicts, archive state, and allowed persistent files.",
    "- Environment-discovered skills supplement this contract under the same boundary: adapt their useful output into the current PhaseDev artifact template, final response, or blocker — never copy native skill reports, headings, or output formats into Flow artifacts."
  ];
}

function environmentSkillPhaseRules(phase: Phase): string[] {
  if (phase === "iteration_validation" || phase === "final_validation") {
    return [
      "- Apply only read-only review/audit/static-inspection skill methods (review-only mode is defined in the Common Validation Contract); do not use a skill to rerun implementation checks, modify repo-tracked files, or create persistent artifacts outside this phase allowlist.",
      "- `validation_findings.md` may contain only YAML frontmatter and one findings table; convert findings into rows and put non-registry explanation only in the final response.",
      "- Skills may not create persistent files outside this phase allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`."
    ];
  }
  if (phase === "change_intake") {
    return [
      "- Environment-discovered skills are post-intake only: do not apply any skill until the task/change description and task-specific rules or constraints are available; if setup intake is missing, ask only for the missing intake and stop.",
      "- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response."
    ];
  }
  return [
    "- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response."
  ];
}

function phaseSpecificRules(phase: Phase): string[] {
  if (phase === "change_intake") {
    return [
      "- Setup skills are post-intake only: do not load, read, route through, or apply any configured skill until the task/change description and task-specific rules or constraints are available.",
      "- If setup intake is missing, ignore the configured skill list for now, ask only for the missing intake, and stop.",
      "- After intake is available, configured skills may be used only as methods for shaping `prd.md` and `execution_contract.md` within the embedded Artifact Build Contracts.",
      "- For setup, router skills such as `using-ecc` may classify the task, select an applicable method skill, or improve context discipline, but they do not authorize reading framework source, framework templates, config files, or unrelated repository areas that this change_intake phase contract forbids.",
      "- If a router-selected skill asks for extra reports, headings, lifecycle files, broad codebase scans, or source/template reading beyond this setup contract, adapt only the relevant method guidance and keep the change_intake repository-reading limits."
    ];
  }

  if (phase !== "iteration_validation" && phase !== "final_validation") {
    return [];
  }

  return [
    "- Apply only read-only review/audit/static-inspection skill methods (review-only mode is defined in the Common Validation Contract); do not use a skill to rerun implementation checks, modify repo-tracked files, or create persistent artifacts outside this phase allowlist.",
    "- `validation_findings.md` may contain only YAML frontmatter and one findings table; convert findings into rows and put non-registry explanation only in the final response."
  ];
}

function externalSkillArtifactRule(phase: Phase): string {
  if (phase === "iteration_validation" || phase === "final_validation") {
    return "- Skills may not create persistent files outside this phase allowlist; do not add prose, sections, evidence blocks, or extra tables to `validation_findings.md`.";
  }

  return "- Skills may not create persistent files outside this phase allowlist; map relevant conclusions only into existing template fields/rows or final response.";
}

function noMatchingSkillRule(phase: Phase): string {
  if (phase === "change_intake") {
    return "- For setup, for each configured router, configured main, and router-selected skill that does not fit the available post-intake evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section. Stop only when needed phase work requires a skill outside the allowed external skill set.";
  }

  return "- For each configured router, configured main, and router-selected skill that does not fit the phase evidence, report as `NOT_APPLICABLE` with an evidence-specific reason in the structured compliance section. Stop only when needed phase work requires a skill outside the allowed external skill set.";
}

function routerPriorityRule(phase: Phase, onlyRouters: boolean): string {
  if (phase === "change_intake") {
    return "- Priority 1: after setup intake is available, read listed router skills first when they are available and help shape the setup artifacts; fully execute any router-selected skill that applies to the setup evidence.\n- Router-selected skills follow the same mandatory execution contract as main skills.";
  }

  if (phase === "code_research" && onlyRouters) {
    return "- Priority 1: read listed router skills first when they are available and help select a relevant research method; fully execute any router-selected skill that applies to the research evidence. If no router-selected method applies after the configured router is read, continue under this Flow phase contract.\n- Router-selected skills follow the same mandatory execution contract as main skills.";
  }

  return "- Priority 1: after reading this phase prompt and the relevant linked or embedded artifact contract/template, read listed router skills first when they are available because they may select execution-method skills; then fully execute router-selected or main skills that apply to the phase evidence, and use additional skills only when their evidence-specific condition is met.\n- Router-selected skills follow the same mandatory execution contract as main skills.";
}

export function renderSkillPolicy(phase: Phase, config: Config): string {
  const skills = getPhaseSkillConfig(config, phase);
  if (!hasConfiguredSkills(skills)) {
    return [
      "## Configured Skill Policy",
      "",
      "No external skills are configured for this phase by the Flow config. Discover and apply skills from your runtime environment instead:",
      "",
      "- Review the skills available in your own runtime environment and select those whose purpose matches this phase's work; apply their methods, algorithms, checklists, or review logic as execution-method instructions.",
      "- Do not inspect `config.yaml` or any standalone `skill_router.md`; the controller has already parsed phase skill configuration. Skill discovery is limited to what your runtime environment already exposes to you.",
      "- If no skills are visible in your runtime environment, state that and complete the work strictly under this Flow phase contract, which is self-sufficient.",
      "",
      ...flowSkillBoundaryProtocolEnv(),
      ...environmentSkillPhaseRules(phase),
      "- After using skills, return to the Flow phase contract and complete only allowed phase work.",
      ""
    ].join("\n");
  }

  const onlyRouters = hasOnlyConfiguredRouters(skills);
  const routerRules = hasConfiguredRouters(skills)
    ? [
      routerPriorityRule(phase, onlyRouters),
      "- Priority 1 also includes skills selected by the listed router skills according to those router skills' own instructions.",
      ...(skills.main.length > 0
        ? ["- Priority 2: fully execute listed main skills by default; they are not gated by router availability. Router (P1) augments/selects; it does not gate main. When a router-selected skill and a main skill conflict on the same evidence, the router-selected skill takes priority and the main skill reports as NOT_APPLICABLE(superseded by <skill>) only for the superseded evidence."]
        : []),
      ...(skills.additional.length > 0
        ? ["- Priority 3: use listed additional skills only when Priority 1 and Priority 2 skills are insufficient or an additional skill is clearly better."]
        : []),
      "- Authorized external skills (boundary, do not exceed): listed router skills, skills selected by listed router skills, listed main skills, and listed additional skills.",
      noMatchingSkillRule(phase)
    ]
    : [
      ...(skills.main.length > 0
        ? ["- No routers are configured; main skills fully execute by default."]
        : ["- No routers or main skills configured for this phase. Additional skills: evaluate and apply when phase evidence fits."]),
      "- Use additional skills only when main skills are insufficient or an additional skill is clearly better.",
      "- Authorized external skills (boundary, do not exceed): only the main and additional skills listed in this prompt.",
      noMatchingSkillRule(phase)
    ];
  const rules = [
    ...routerRules,
    externalSkillArtifactRule(phase),
    ...phaseSpecificRules(phase),
    "- After using skills, return to the Flow phase contract and complete only allowed phase work."
  ];

  const prioritySections = hasConfiguredRouters(skills)
    ? [
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

export function renderSkillComplianceLine(phase: Phase, config: Config): string {
  const skills = getPhaseSkillConfig(config, phase);
  if (!hasConfiguredSkills(skills)) {
    return [
      "Skill compliance: one entry per environment-selected skill.",
      "Format: `skill-name`: APPLIED(source: environment, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)",
      "Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])",
      "When no skills are visible in the environment, use exactly this line instead: `Skill compliance: no skills available in environment.`"
    ].join("\n");
  }
  return [
    "Skill compliance: one entry per configured router, configured main, router-selected, and selected additional skill.",
    "Format: `skill-name`: APPLIED(source: <loaded>, mandatory_steps: <done/skipped/blocked>, evidence: <files/commands>, mapped_output: <artifact/response/blocker>)",
    "Format: `skill-name`: NOT_APPLICABLE(reason: <evidence-specific>, evidence: [<ref>])",
    "Format: `skill-name`: UNAVAILABLE(exact_name: <name>, reason: <not found/unavailable/error>)"
  ].join("\n");
}

export function renderPhaseSkillStep(phase: Phase, config: Config): string {
  const skills = getPhaseSkillConfig(config, phase);
  if (!hasConfiguredSkills(skills)) {
    return "";
  }

  const suffix: Partial<Record<Phase, string>> = {
    technical_design: "map relevant output into the embedded design template only.",
    iteration_planning: "map useful output into the embedded implementation plan template only, and do not let router skills expand the repository retrieval budget.",
    implementation: "evaluate them against the current phase evidence and never silently skip a configured skill."
  };
  const tail = suffix[phase];
  if (tail === undefined) {
    return "";
  }
  return `   - Skill step: read configured router skills first when available, then evaluate and fully execute configured main and router-selected skills per the Flow Skill Boundary Protocol; ${tail}`;
}

export function renderPhaseSkillNote(phase: Phase, config: Config): string {
  if (phase !== "iteration_planning") {
    return "";
  }
  const skills = getPhaseSkillConfig(config, phase);
  if (!hasConfiguredSkills(skills)) {
    return "";
  }
  return "- For repository evidence, use at most 2-4 broad file listings/searches total as a soft cap, then focused searches for concrete identifiers, modules, commands, or paths named by PRD/design/rules. Reading configured skill instructions does not count as repository evidence, but skill-driven repo searches do count.";
}

export function renderSkillPolicyInlineRef(phase: Phase, config: Config): string {
  const skills = getPhaseSkillConfig(config, phase);
  if (!hasConfiguredSkills(skills)) {
    return "";
  }
  return " using the configured skill policy";
}
