import { Prompt, Phase } from "../../entities/phase/types";
import { TestCommands } from "../../entities/test-commands/parse-test-commands";
import { toFileUrl } from "./prompt-formatters";
import { shellQuote } from "../../shared/shell/shell-quote";

export function prompt(command: "init" | "next", phase: Phase, content: string, blocked = false, reason?: string): Prompt {
  return { command, phase, prompt: content, blocked, reason };
}

function advanceCommand(changeName?: string): string {
  return changeName === undefined ? "phasedev advance" : `phasedev advance --change ${shellQuote(changeName)}`;
}

function archiveCommand(changeName?: string): string {
  return changeName === undefined ? "phasedev archive <change-name>" : `phasedev archive ${shellQuote(changeName)}`;
}

function approveCommand(changeName?: string): string {
  const base = 'phasedev approve <file> --by "auto-approve-subagent"';
  return changeName === undefined ? base : `${base} --change ${shellQuote(changeName)}`;
}

export function approvalBlocker(phase: Phase, title: string, filePath: string, label: string, changeName?: string): Prompt {
  return prompt("next", phase, [
    "================================================================================",
    `[FLOW CONTROLLER] BLOCKED: ${title}`,
    `Please review and approve ${label} in:`,
    `- Link: ${toFileUrl(filePath)}`,
    `Set 'approved: true' in YAML frontmatter once approved, then run '${advanceCommand(changeName)}'.`,
    "If this artifact was edited after an earlier approval, the approval is stale: re-review the current content and run 'phasedev approve <file>' again.",
    "================================================================================"
  ].join("\n"), true, title);
}

export function autoApprovalBlocker(phase: Phase, title: string, artifactPaths: string[], changeName?: string): Prompt {
  return prompt("next", phase, [
    "================================================================================",
    `[FLOW CONTROLLER] BLOCKED: ${title} — auto-approval requires content review`,
    "Artifacts:",
    ...artifactPaths.map(artifactPath => `- Link: ${toFileUrl(artifactPath)}`),
    "Spawn one dedicated content-reading validation sub-agent that:",
    "(a) reads the full content of each listed artifact;",
    "(b) evaluates each on the merits against the phase contract — completeness, coherence, fidelity to the original task — not merely 'phasedev check';",
    `(c) approves only genuinely-good artifacts via '${approveCommand(changeName)}';`,
    "(d) on any problem, does NOT approve, and instead returns concrete findings so the orchestrator re-runs the owning phase sub-agent and retries.",
    "Do NOT approve manually without this sub-agent review.",
    `Once approved, run '${advanceCommand(changeName)}' again.`,
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

export function invalidPlanBlocker(planPath: string, issues: string[], changeName?: string): Prompt {
  return prompt("next", "iteration_planning", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid iteration plan",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(planPath)}`,
    `Please update iteration_plan.md, then run '${advanceCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Invalid iteration plan");
}

export function invalidPrdBlocker(prdPath: string, issues: string[], changeName?: string): Prompt {
  return prompt("next", "change_intake", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid prd.md",
    "prd.md must follow the PRD artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(prdPath)}`,
    `Fix prd.md, reset approval if you changed an already approved artifact, then run '${advanceCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Invalid prd.md");
}

export function invalidRulesBlocker(rulesPath: string, issues: string[], changeName?: string): Prompt {
  return prompt("next", "change_intake", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid execution_contract.md",
    "execution_contract.md must follow the Execution Contract artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(rulesPath)}`,
    `Fix execution_contract.md, reset approval if you changed an already approved artifact, then run '${advanceCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Invalid execution_contract.md");
}
export function invalidResearchBlocker(researchPath: string, issues: string[], changeName?: string): Prompt {
  return prompt("next", "code_research", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid research_facts.md",
    "research_facts.md must follow the Research Facts artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(researchPath)}`,
    `Fix research_facts.md, then run '${advanceCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Invalid research_facts.md");
}

export function invalidDesignBlocker(designPath: string, issues: string[], changeName?: string): Prompt {
  return prompt("next", "technical_design", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid design.md",
    "design.md must follow the Design artifact contract before this change can continue.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(designPath)}`,
    `Fix design.md, reset approval if you changed an already approved artifact, then run '${advanceCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Invalid design.md");
}
export function archiveReadinessBlocker(title: string, filePath: string, details: string, changeName?: string): Prompt {
  return prompt("next", "archive", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Archive readiness failed",
    title,
    details,
    `- Link: ${toFileUrl(filePath)}`,
    `Fix the archive readiness issue, then run '${archiveCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Archive readiness failed");
}

export function validationFindingsBlocker(findingsPath: string, issues: string[], changeName?: string): Prompt {
  return prompt("next", "finding_repair", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Invalid validation_findings.md",
    "validation_findings.md must contain YAML frontmatter followed by exactly one strict findings table.",
    ...issues.map(issue => `- ${issue}`),
    `- Link: ${toFileUrl(findingsPath)}`,
    `Fix validation_findings.md, then run '${advanceCommand(changeName)}' again.`,
    "================================================================================"
  ].join("\n"), true, "Invalid validation_findings.md");
}

export function iterationCommitBlocker(
  iterationId: number,
  iterationName: string,
  changeSlug: string,
  changeName?: string
): Prompt {
  return prompt("next", "iteration_validation", [
    "================================================================================",
    `[FLOW CONTROLLER] BLOCKED: Iteration ${iterationId} validated. Commit the iteration before advancing.`,
    "The controller found uncommitted changes outside `.phasedev/**`.",
    "Commit the iteration's code changes together with the updated `.phasedev` artifacts.",
    `- Suggested commit message: phasedev(${changeSlug}): iteration ${iterationId} — ${iterationName}`,
    `After committing, run '${advanceCommand(changeName)}' again.`,
    "To opt out of this gate, set 'requireIterationCommit: false' in config.yaml.",
    "================================================================================"
  ].join("\n"), true, "Iteration commit required");
}

export function finalCommitBlocker(changeSlug: string, changeName?: string): Prompt {
  return prompt("next", "final_validation", [
    "================================================================================",
    "[FLOW CONTROLLER] BLOCKED: Final validation passed. Commit before archive.",
    "The controller found uncommitted changes outside `.phasedev/**`.",
    "Commit the remaining code changes together with the updated `.phasedev` artifacts.",
    `- Suggested commit message: phasedev(${changeSlug}): final validation`,
    `After committing, run '${advanceCommand(changeName)}' again.`,
    "To opt out of this gate, set 'requireIterationCommit: false' in config.yaml.",
    "================================================================================"
  ].join("\n"), true, "Commit required before archive");
}
