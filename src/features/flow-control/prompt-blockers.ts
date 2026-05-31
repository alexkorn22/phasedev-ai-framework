import { FlowPrompt, FlowStage } from "../../entities/flow-stage/types";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { toFileUrl } from "./prompt-formatters";

export function prompt(command: "init" | "next", stage: FlowStage, content: string, blocked = false, reason?: string): FlowPrompt {
  return { command, stage, prompt: content, blocked, reason };
}

export function approvalBlocker(stage: FlowStage, title: string, filePath: string, label: string): FlowPrompt {
  return prompt("next", stage, [
    "================================================================================",
    `[FLOW CONTROLLER] BLOCKED: ${title}`,
    `Please review and approve ${label} in:`,
    `- Link: ${toFileUrl(filePath)}`,
    "Set 'approved: true' in YAML frontmatter once approved, then run 'flow next'.",
    "================================================================================"
  ].join("\n"), true, title);
}

export function testCommandBlocker(stage: FlowStage, rulesPath: string, missing: Array<keyof TestCommands>): FlowPrompt {
  return prompt("next", stage, [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Missing test command",
    "Please add the required command(s) to rules.md:",
    `- Missing: ${missing.join(", ")}`,
    `- Link: ${toFileUrl(rulesPath)}`,
    "Expected section:",
    "## Test Commands",
    "- unit: `...`",
    "- phase: `...`",
    "- full: `...`",
    "================================================================================"
  ].join("\n"), true, "Missing test command");
}

export function invalidPlanBlocker(planPath: string, issues: string[]): FlowPrompt {
  return prompt("next", "plan", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid implementation plan",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(planPath)}`,
    "Please update implementation_plan.md, then run 'flow next' again.",
    "================================================================================"
  ].join("\n"), true, "Invalid implementation plan");
}

export function archiveReadinessBlocker(title: string, filePath: string, details: string): FlowPrompt {
  return prompt("next", "archive", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Archive readiness failed",
    title,
    details,
    `- Link: ${toFileUrl(filePath)}`,
    "Fix the archive readiness issue, then run 'flow next' again.",
    "================================================================================"
  ].join("\n"), true, "Archive readiness failed");
}
