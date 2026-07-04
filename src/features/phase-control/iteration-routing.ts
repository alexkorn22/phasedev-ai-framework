import * as fs from "fs";
import * as path from "path";
import { Config } from "../../entities/config/config";
import { isIterationReadyForValidation } from "../../entities/iteration-plan/iteration-readiness";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { Iteration } from "../../entities/iteration-plan/types";
import { updateIterationStatus } from "../../entities/iteration-plan/update-iteration-status";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { Prompt } from "../../entities/phase/types";
import { parseCurrentValidationFindings, ValidationFindingState } from "../../entities/validation-findings/parse-validation-findings";
import { shellQuote } from "../../shared/shell/shell-quote";
import { urlsFor, flowCheckCommand, renderPhaseTemplate } from "../../shared/prompt/phase-render-helpers";
import { renderArtifactContract } from "./artifact-contract";
import { renderChangedFileInventory } from "./changed-file-inventory";
import { prompt, testCommandBlocker } from "./prompt-blockers";
import { formatPhaseExcerpt, formatPlanMap, toFileUrl } from "./prompt-formatters";

export interface Urls {
  prd_path: string;
  rules_path: string;
  research_path: string;
  design_path: string;
  plan_path: string;
  findings_path: string;
}

function isKnownTestCommandKey(check: string): check is keyof TestCommands {
  return check === "unit" || check === "phase" || check === "full";
}

function requiredCheckKeys(currentPhase: Iteration): Array<keyof TestCommands> {
  const keys = (currentPhase.requiredChecks ?? [])
    .map(check => check.check.trim().toLowerCase())
    .filter(isKnownTestCommandKey);
  return keys.length > 0 ? Array.from(new Set(keys)) : ["unit"];
}

function renderRequiredCheckCommands(currentPhase: Iteration, testCommands: TestCommands, rulesPath: string): string | Prompt {
  const requiredChecks = currentPhase.requiredChecks ?? [];
  const checks = requiredChecks.length > 0
    ? requiredChecks
    : [{ check: "unit", command: testCommands.unit ?? "" }];
  const missingKnownKeys = requiredCheckKeys(currentPhase).filter(key => testCommands[key] === undefined);
  if (missingKnownKeys.length > 0) {
    return testCommandBlocker("implementation", rulesPath, missingKnownKeys);
  }

  return checks.map(check => {
    const normalizedCheck = check.check.trim().toLowerCase();
    return `- ${normalizedCheck}: \`${check.command}\``;
  }).join("\n");
}

function flowValidationCheckCommand(projectPath: string, iterationId: number): string {
  return `phasedev check-validation --project-path ${shellQuote(projectPath)} --scope iteration --iteration-id ${iterationId}`;
}

function validationFindingsContract(findingsPath: string, projectPath: string, iterationId?: number): string {
  return renderArtifactContract({
    artifactId: "validation_findings.md",
    resolvedOutputPath: findingsPath,
    templateName: "artifacts/validation_findings",
    selfCheckCommand: iterationId === undefined ? flowCheckCommand(projectPath) : flowValidationCheckCommand(projectPath, iterationId),
    selfCheckFailureGuidance: iterationId === undefined
      ? undefined
      : "Artifact contract check must pass before reporting this stage complete. If it fails, fix only `validation_findings.md` and the current phase status in `iteration_plan.md` when allowed by the validation verdict, then rerun the same command.",
    date: new Date().toISOString().split("T")[0]
  });
}

/**
 * @deprecated Used only by the deprecated `phasedev next` path (get-next-prompt.ts).
 * This function mutates flow state (updateIterationStatus) which violates the
 * read-only contract principle. New code should use getPhasePrompt() instead.
 * Called from scripts/generate-agent-prompts.ts via get-next-prompt.ts.
 */
export function handlePhase(planPath: string, activeIteration: Iteration, urls: Urls, testCommands: TestCommands, rulesPath: string, config: Config, projectPath = path.resolve(path.dirname(planPath), "..", "..", "..")): Prompt {
  let currentPhase = activeIteration;
  let planPhases = parsePlan(planPath);

  if (activeIteration.status === "not_started") {
    updateIterationStatus(planPath, activeIteration.id, "in_progress");
    planPhases = parsePlan(planPath);
    currentPhase = planPhases.find(phase => phase.id === activeIteration.id) ?? { ...activeIteration, status: "in_progress" };
  } else {
    currentPhase = planPhases.find(phase => phase.id === activeIteration.id) ?? activeIteration;
  }

  if (isIterationReadyForValidation(currentPhase)) {
    return prompt("next", "iteration_validation", renderPhaseTemplate("iteration_validation", "phase6a_iteration_validation", {
      phase_id: `Iteration ${currentPhase.id}: ${currentPhase.name}`,
      prd_path: urls.prd_path,
      rules_path: urls.rules_path,
      design_path: urls.design_path,
      plan_path: urls.plan_path,
      findings_path: urls.findings_path,
      date: new Date().toISOString().split("T")[0],
      controller_changed_files_inventory: renderChangedFileInventory(projectPath, { phase: currentPhase }),
      validation_findings_artifact_contract: validationFindingsContract(path.join(path.dirname(planPath), "validation_findings.md"), projectPath, currentPhase.id)
    }, config));
  }

  const testCommand = renderRequiredCheckCommands(currentPhase, testCommands, rulesPath);
  if (typeof testCommand !== "string") return testCommand;

  return prompt("next", "implementation", renderPhaseTemplate("implementation", "phase5_implementation", {
    phase_id: `Iteration ${currentPhase.id}: ${currentPhase.name}`,
    plan_map: formatPlanMap(planPhases, currentPhase.id),
    phase_excerpt: formatPhaseExcerpt(currentPhase),
    test_command: testCommand,
    self_check_command: flowCheckCommand(projectPath),
    prd_path: urls.prd_path,
    rules_path: urls.rules_path,
    design_path: urls.design_path,
    plan_path: urls.plan_path
  }, config));
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function isQueuedRepairFinding(finding: ValidationFindingState): boolean {
  return finding.blocksPr && ["open", "reopened"].includes(finding.latestStatus);
}

function formatRepairQueue(findingsPath: string): string {
  if (!fs.existsSync(findingsPath)) {
    return [
      "## Current Repair Queue",
      "",
      "No findings file found.",
      "",
      "Full findings registry: unavailable."
    ].join("\n");
  }

  const queue = parseCurrentValidationFindings(findingsPath).filter(isQueuedRepairFinding);
  const registryLink = `Full findings registry: [validation_findings.md](${toFileUrl(findingsPath)})`;

  if (queue.length === 0) {
    return [
      "## Current Repair Queue",
      "",
      "No current blocking findings were parsed from the findings registry.",
      "Open the full findings registry only to resolve this ambiguity: either fix malformed finding rows or confirm that all blocking findings are resolved before setting `verdict: repaired`.",
      "",
      registryLink
    ].join("\n");
  }

  return [
    "## Current Repair Queue",
    "",
    "| ID | Severity | Class | Iteration | Finding | Required Fix |",
    "|---|---|---|---|---|---|",
    ...queue.map(finding => [
      finding.id,
      finding.severity,
      finding.className,
      finding.phase,
      finding.canonicalFinding,
      finding.requiredFix
    ].map(escapeMarkdownTableCell).join(" | ")).map(row => `| ${row} |`),
    "",
    registryLink
  ].join("\n");
}

export function repairPrompt(urls: Urls, findingsPath: string, config: Config, projectPath = path.resolve(path.dirname(findingsPath), "..", "..", "..")): Prompt {
  return prompt("next", "finding_repair", renderPhaseTemplate("finding_repair", "phase6r_finding_repair", {
    repair_queue: formatRepairQueue(findingsPath),
    findings_path: urls.findings_path,
    plan_path: urls.plan_path,
    design_path: urls.design_path,
    prd_path: urls.prd_path,
    research_path: urls.research_path,
    rules_path: urls.rules_path,
    validation_findings_artifact_contract: validationFindingsContract(findingsPath, projectPath)
  }, config));
}
