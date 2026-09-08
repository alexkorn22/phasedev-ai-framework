import * as fs from "fs";
import * as path from "path";
import { shellQuote } from "../../shared/shell/shell-quote";
import { buildChangePaths, SYSTEM_DIR } from "../../entities/change/paths";
import { Config } from "../../entities/config/config";
import { Phase } from "../../entities/phase/types";
import { renderTemplate } from "../../shared/templates/render-template";
import { toFileUrl } from "./prompt-formatters";
import { renderSkillComplianceLine, renderSkillPolicy } from "./skill-policy";
import { Iteration } from "../../entities/iteration-plan/types";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { Prompt } from "../../entities/phase/types";
import {
  iterationRequiresFullGate,
  missingRepairFocusedGateCommands,
  renderResolvedCheckCommandLines,
  resolveIterationFocusedCheckCommands,
  resolveRepairFocusedCheckCommands,
  TEST_TARGETS_PLACEHOLDER,
  type RepairFindingScope
} from "../../entities/test-commands/resolve-check-commands";
import { iterationFullGateBlocker, testCommandBlocker } from "./prompt-blockers";
import { renderValidationCommonContract } from "./validation-common-contract";
import { renderValidationRoleTemplateVariables, renderValidationRoleOpeningSummary, interpolateValidationRolePathTokens } from "./validation-role-scope";
import { ValidationPhaseRole } from "../../entities/phase/validation-phase-role";
import { renderArtifactContract } from "./artifact-contract";
import { todayIsoDate } from "../../shared/time/today-iso-date";
import { RESEARCH_TEMPLATE_SAMPLE_VALUES } from "../../entities/research-facts/sample-values";

// ── Phase Opening Summary ──────────────────────────────────

const PHASE_SUMMARIES: Partial<Record<Phase, { output: string; selfCheck: string }>> = {
  change_intake:        { output: "prd.md and execution_contract.md", selfCheck: "phasedev check" },
  code_research:        { output: "research_facts.md",                 selfCheck: "phasedev check" },
  technical_design:     { output: "architecture/design.md",            selfCheck: "phasedev check" },
  iteration_planning:   { output: "iteration_plan.md",                 selfCheck: "phasedev check" },
  implementation:       { output: "repository files per iteration",    selfCheck: "phasedev check" },
  iteration_validation: { output: "validation_findings.md",            selfCheck: "phasedev check-validation --scope iteration" },
  final_validation:     { output: "validation_findings.md",            selfCheck: "phasedev check-validation --scope final" },
  finding_repair:       { output: "repository files (fixes)",          selfCheck: "phasedev check" },
  archive:              { output: "delta specs in archive",            selfCheck: "phasedev check-archive" },
};

const DISPATCH_PRECEDENCE_LINE =
  "> - Precedence: this contract supersedes any phase-work details in your dispatch prompt (artifact read order, file inventories, review checklists, verdict policy, findings-command recipes). On conflict, follow this contract and report the discrepancy in your final response.";

export function renderPhaseOpeningSummary(phase: Phase): string {
  const summary = PHASE_SUMMARIES[phase];
  if (!summary) {
    return ["> **Phase contract:**", DISPATCH_PRECEDENCE_LINE, ""].join("\n");
  }
  return [
    "> **Phase summary:**",
    `> - Output: \`${summary.output}\` per embedded Artifact Build Contract.`,
    `> - Done when: \`${summary.selfCheck}\` passes.`,
    "> - Forbidden: change `approved` fields manually, or write outside this phase's Artifact allowlist (listed flow artifacts only — not an Expected Change Surface forecast of repository edit scope).",
    DISPATCH_PRECEDENCE_LINE,
    ""
  ].join("\n");
}

// ── Helpers ────────────────────────────────────────────────

export function urlsFor(paths: ReturnType<typeof buildChangePaths>) {
  return {
    prd_path: toFileUrl(paths.prdPath),
    rules_path: toFileUrl(paths.executionContractPath),
    research_path: toFileUrl(paths.researchPath),
    design_path: toFileUrl(paths.designPath),
    plan_path: toFileUrl(paths.iterationPlanPath),
    findings_path: toFileUrl(paths.findingsPath),
  };
}

function changeFlag(changeName?: string): string {
  return changeName === undefined ? "" : ` --change ${shellQuote(changeName)}`;
}

function hasMeaningfulKnowledge(raw: string): boolean {
  const stripped = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#") && !line.startsWith(">"));
  return stripped.length > 0;
}

export function renderKnowledgeContext(projectPath: string, activePhase: string): string {
  const knowledgeDir = path.join(projectPath, SYSTEM_DIR, "knowledge");
  if (!fs.existsSync(knowledgeDir)) {
    return "";
  }

  const sections: string[] = [];

  const antipatternsPath = path.join(knowledgeDir, "antipatterns.md");
  if (fs.existsSync(antipatternsPath)) {
    const content = fs.readFileSync(antipatternsPath, "utf-8");
    if (hasMeaningfulKnowledge(content)) {
      sections.push(`### Project Anti-Patterns & Taboos\n${content.trim()}`);
    }
  }

  const generalMemoryPath = path.join(knowledgeDir, "general-memory.md");
  if (fs.existsSync(generalMemoryPath)) {
    const content = fs.readFileSync(generalMemoryPath, "utf-8");
    if (hasMeaningfulKnowledge(content)) {
      sections.push(`### General Engineering Memory\n${content.trim()}`);
    }
  }

  const phaseMemoryPath = path.join(knowledgeDir, "phases", `${activePhase}.md`);
  if (fs.existsSync(phaseMemoryPath)) {
    const content = fs.readFileSync(phaseMemoryPath, "utf-8");
    if (hasMeaningfulKnowledge(content)) {
      sections.push(`### Phase Memory (${activePhase})\n${content.trim()}`);
    }
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\n=== PROJECT KNOWLEDGE & ANTI-PATTERNS ===\n${sections.join("\n\n")}\n========================================`;
}

/**
 * Render the agreed task description recorded in `intake_task.md` (written by
 * `create-change --task-file`) as a block to append to a phase prompt.
 * Returns "" when there is no active change path or no such file — the caller
 * concatenates the result onto its rendered template.
 */
export function taskContextBlock(changePath: string | null): string {
  if (!changePath) return "";
  const taskFilePath = path.join(changePath, "intake_task.md");
  if (!fs.existsSync(taskFilePath)) return "";
  return `\n\n=== CURRENT TASK DESCRIPTION ===\n${fs.readFileSync(taskFilePath, "utf-8")}\n================================`;
}

export function flowCheckCommand(projectPath: string, changeName?: string): string {
  return `phasedev check --project-path ${shellQuote(projectPath)}${changeFlag(changeName)}`;
}

export const PATH_RESOLUTION_RULE = [
  "Path resolution & workspace confinement rules:",
  "- Flow artifact names in this prompt (e.g. `prd.md`, `execution_contract.md`, `research_facts.md`, `architecture/design.md`, `iteration_plan.md`, `validation_findings.md`) are paths inside the active change folder, not paths from the project repository root.",
  "- Write or update each flow artifact only at the absolute path given for it in this prompt; treat template comments, embedded rows, and allowlist entries as active-change-folder paths, never project-root paths.",
  "- Do not create or update project-root copies of these flow artifacts.",
  "- Run repository code, config, test, and runtime evidence searches under the active project root unless an explicit input path in this prompt points elsewhere.",
  "- Strict Workspace Boundary: All operations (reading, writing, executing, creating temporary files, databases, logs, or scratchpads) must stay strictly inside the active project root directory (process.cwd()). Never read, write, create, or modify files in /tmp, home directory (~), or parent directories (../). If temporary files or test databases are needed, place them strictly inside a project-local gitignored folder (e.g. `temp/` or `.tmp/`).",
  "- Hermetic Development & Offline Testing: All code and tests must execute in a strictly hermetic, offline environment. Never attempt to connect to live external databases, remote cloud services, production APIs, or require external connection strings (*_DB_URL, live API keys). Verify migrations and external integrations exclusively by writing automated tests with mocks, fakes, or local in-memory fixtures.",
  "- Subagent Git Restriction: When implementing or researching a PhaseDev change, do NOT run git commands (`git log`, `git diff`, `git blame`, `git bisect`) to explore code or search symbols. Search code via filesystem tools (`grep`, `glob`, AST, file reading). Git history may only be inspected if the user's original task explicitly requests historical git analysis. Git commits and diff tracking are managed exclusively by the PhaseDev controller / orchestrator."
].join("\n");

export const SELF_CHECK_FALLBACK = [
  "phasedev is a GLOBAL CLI. Invoke it directly as `phasedev <command>` (never use `npm exec`, `bunx`, or `bun run src/cli.ts`).",
  "If the `phasedev` executable is unavailable or fails non-actionably, stop and report a blocker with the exact command and failure output. Do not loop on unavailable commands, and do not report the phase ready while the self-check has not passed."
].join("\n");

export function renderPhaseTemplate(
  phase: Phase,
  templateName: string,
  variables: Record<string, string>,
  config: Config,
  options?: {
    validationRole?: ValidationPhaseRole;
    pathTokens?: { plan_path: string; findings_path: string; prd_path?: string; rules_path?: string; design_path?: string };
    fullGateCommand?: string;
    browserValidation?: { start: string; url: string; criteria: string };
  }
): string {
  const validationRoleVariables = phase === "iteration_validation" || phase === "final_validation"
    ? (() => {
      const roleVars = renderValidationRoleTemplateVariables(phase, config, options?.validationRole, {
        fullGateCommand: options?.fullGateCommand,
        browserValidation: options?.browserValidation
      });
      if (!options?.pathTokens) {
        return roleVars;
      }
      return {
        ...roleVars,
        validation_role_checks: interpolateValidationRolePathTokens(roleVars.validation_role_checks, options.pathTokens),
        validation_iteration_status_rule: interpolateValidationRolePathTokens(roleVars.validation_iteration_status_rule, options.pathTokens),
        validation_input_artifacts: interpolateValidationRolePathTokens(roleVars.validation_input_artifacts, options.pathTokens),
        validation_retrieval_order: interpolateValidationRolePathTokens(roleVars.validation_retrieval_order, options.pathTokens)
      };
    })()
    : {};

  return renderTemplate(templateName, {
    ...variables,
    path_resolution_rule: PATH_RESOLUTION_RULE,
    phase_opening_summary: options?.validationRole && (phase === "iteration_validation" || phase === "final_validation")
      ? renderValidationRoleOpeningSummary(phase as "iteration_validation" | "final_validation", options.validationRole)
      : renderPhaseOpeningSummary(phase),
    self_check_fallback: SELF_CHECK_FALLBACK,
    validation_common_contract: validationRoleVariables.validation_common_contract
      ?? renderValidationCommonContract(phase, config),
    skill_policy: renderSkillPolicy(),
    skill_compliance_line: renderSkillComplianceLine(),
    ...validationRoleVariables
  });
}

// ── Required check commands ────────────────────────────────

/**
 * Render the iteration's required check commands from execution_contract.md,
 * or return a blocker Prompt when a required command is missing or invalid.
 */
export function renderRequiredCheckCommands(currentPhase: Iteration, testCommands: TestCommands, rulesPath: string): string | Prompt {
  if (iterationRequiresFullGate(currentPhase)) {
    return iterationFullGateBlocker(rulesPath);
  }

  const requiredGates = (currentPhase.requiredChecks ?? [])
    .map(check => check.check.trim().toLowerCase())
    .filter((gate): gate is "unit" | "phase" => gate === "unit" || gate === "phase");
  const gates = requiredGates.length > 0 ? Array.from(new Set(requiredGates)) : ["unit" as const];
  const missingKnownKeys = gates.filter(gate => testCommands[gate] === undefined);
  if (missingKnownKeys.length > 0) {
    return testCommandBlocker("implementation", rulesPath, missingKnownKeys);
  }

  const resolvedChecks = resolveIterationFocusedCheckCommands(currentPhase, testCommands);
  if (resolvedChecks.length === 0) {
    return testCommandBlocker("implementation", rulesPath, gates);
  }

  return renderResolvedCheckCommandLines(resolvedChecks);
}

export function renderRepairCheckCommands(
  plan: Iteration[],
  testCommands: TestCommands,
  scope: RepairFindingScope
): string {
  const checks = resolveRepairFocusedCheckCommands(plan, testCommands, scope);
  if (checks.length === 0) {
    return "- none (no focused unit/phase gates apply to the current repair queue)";
  }
  const lines = renderResolvedCheckCommandLines(checks);
  const targetSelectionNote =
    "- Select test targets from files changed by the repair; instantiate each recipe before executing; never run `full`.";
  if (scope.hasFinalScopeFindings && scope.iterationIds.length === 0) {
    return `${lines}\n${targetSelectionNote}\n- Run only checks relevant to actual repair changes; reuse still-valid passed evidence when repair did not change code or tests.`;
  }
  return `${lines}\n${targetSelectionNote}`;
}

export function renderRepairCheckCommandsOrBlocker(
  plan: Iteration[],
  testCommands: TestCommands,
  scope: RepairFindingScope,
  rulesPath: string
): string | Prompt {
  const missing = missingRepairFocusedGateCommands(plan, testCommands, scope);
  if (missing.length > 0) {
    return testCommandBlocker("finding_repair", rulesPath, missing);
  }
  return renderRepairCheckCommands(plan, testCommands, scope);
}

// ── Artifact Contracts ─────────────────────────────────────

export function researchArtifactContract(researchPath: string, projectPath: string, changeName?: string): string {
  return renderArtifactContract({
    artifactId: "research_facts.md",
    resolvedOutputPath: researchPath,
    templateName: "artifacts/research_facts",
    selfCheckCommand: flowCheckCommand(projectPath, changeName),
    includeSelfCheck: false,
    blockedFinalArtifactContent: RESEARCH_TEMPLATE_SAMPLE_VALUES,
    date: todayIsoDate(),
  });
}

const IMPLEMENTATION_PLAN_CANONICAL_FILL_RULES = [
  "- `iteration_plan.md` is a human approval artifact and a downstream machine contract; keep prose concise and put review decisions inside existing template fields only.",
  "- Keep `approved: false`; only the user can approve the plan.",
  "- Keep exactly the non-iteration `##` sections from the template, then sequential `## Iteration N: Name [ ]` headings. Planning initializes every iteration status as `[ ]`.",
  "- Fill `Approval Summary` as the compact review surface: sequencing risk and validation.",
  "- Fill `Generation Bundle`, `Overview`, each iteration `Goal`, `Expected Change Surface`, `Tasks`, `Checks`, and `Check Evidence` from approved PRD/design/execution_contract only.",
  "- In `### Checks`, list required gate names only (`- unit`, `- phase`); do not copy concrete commands from `execution_contract.md`. Legacy `- gate: \\`command\\`` syntax remains readable but new plans must use gate-only entries.",
  "- Every `R#`, every `SC#`, each `SC#` Evidence type, every risk boundary, and every relevant approved `D#` must appear in concrete iteration, task, check, evidence, or change-surface trace content.",
  "- Do not use vague trace labels such as `all requirements`; reference concrete `R#`, `SC#`, and relevant `D#` IDs.",
  "- Use concise tables, grouped lists, and short paragraphs inside existing template sections when they improve review speed; do not add review-only sections or decorative content.",
  "- Do not use emoji in `iteration_plan.md`; keep machine-sensitive approval artifacts plain text.",
];

export function implementationPlanArtifactContract(planPath: string, selfCheckCommand: string, date: string): string {
  return renderArtifactContract({
    artifactId: "iteration_plan.md",
    resolvedOutputPath: planPath,
    templateName: "artifacts/iteration_plan",
    selfCheckCommand,
    includeSelfCheck: false,
    canonicalFillRules: IMPLEMENTATION_PLAN_CANONICAL_FILL_RULES,
    date,
  });
}
