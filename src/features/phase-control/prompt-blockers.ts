import { Prompt, Phase } from "../../entities/phase/types";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { toFileUrl } from "./prompt-formatters";

export function prompt(command: "init" | "next", phase: Phase, content: string, blocked = false, reason?: string): Prompt {
  return { command, phase, prompt: content, blocked, reason };
}

export function approvalBlocker(phase: Phase, title: string, filePath: string, label: string): Prompt {
  return prompt("next", phase, [
    "================================================================================",
    `[FLOW CONTROLLER] BLOCKED: ${title}`,
    `Please review and approve ${label} in:`,
    `- Link: ${toFileUrl(filePath)}`,
    "Set 'approved: true' in YAML frontmatter once approved, then run 'phasedev advance'.",
    "================================================================================"
  ].join("\n"), true, title);
}

export function testCommandBlocker(phase: Phase, rulesPath: string, missing: Array<keyof TestCommands>): Prompt {
  return prompt("next", phase, [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Missing test command",
    "Please add the required command(s) to execution_contract.md:",
    `- Missing: ${missing.join(", ")}`,
    `- Link: ${toFileUrl(rulesPath)}`,
    "Expected section:",
    "## Test Commands",
    "| Gate | Command |",
    "|---|---|",
    "| unit | `...` |",
    "| phase | `...` |",
    "| full | `...` |",
    "================================================================================"
  ].join("\n"), true, "Missing test command");
}

export function invalidPlanBlocker(planPath: string, issues: string[]): Prompt {
  return prompt("next", "iteration_planning", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid iteration plan",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(planPath)}`,
    "Please update iteration_plan.md, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid iteration plan");
}

export function invalidPrdBlocker(prdPath: string, issues: string[]): Prompt {
  return prompt("next", "change_intake", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid prd.md",
    "prd.md must follow the PRD artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(prdPath)}`,
    "Fix prd.md, reset approval if you changed an already approved artifact, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid prd.md");
}

export function invalidRulesBlocker(rulesPath: string, issues: string[]): Prompt {
  return prompt("next", "change_intake", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid execution_contract.md",
    "execution_contract.md must follow the Execution Contract artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(rulesPath)}`,
    "Fix execution_contract.md, reset approval if you changed an already approved artifact, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid execution_contract.md");
}
export function invalidResearchBlocker(researchPath: string, issues: string[]): Prompt {
  return prompt("next", "code_research", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid research_facts.md",
    "research_facts.md must follow the Research Facts artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(researchPath)}`,
    "Fix research_facts.md, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid research_facts.md");
}

export function invalidDesignBlocker(designPath: string, issues: string[]): Prompt {
  return prompt("next", "technical_design", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid design.md",
    "design.md must follow the Design artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(designPath)}`,
    "Fix design.md, reset approval if you changed an already approved artifact, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid design.md");
}
export function archiveReadinessBlocker(title: string, filePath: string, details: string): Prompt {
  return prompt("next", "archive", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Archive readiness failed",
    title,
    details,
    `- Link: ${toFileUrl(filePath)}`,
    "Fix the archive readiness issue, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Archive readiness failed");
}

export function validationFindingsBlocker(findingsPath: string, issues: string[]): Prompt {
  return prompt("next", "finding_repair", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid validation_findings.md",
    "validation_findings.md must contain YAML frontmatter followed by exactly one strict findings table.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(findingsPath)}`,
    "Fix validation_findings.md, then run 'phasedev advance' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid validation_findings.md");
}
