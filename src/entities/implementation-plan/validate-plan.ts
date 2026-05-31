import { Phase } from "./types";

export function validatePlanStructure(phases: Phase[]): string[] {
  const issues: string[] = [];

  if (phases.length === 0) {
    return ["implementation_plan.md must contain at least one phase heading."];
  }

  const phaseIdCounts = new Map<number, number>();
  for (const phase of phases) {
    phaseIdCounts.set(phase.id, (phaseIdCounts.get(phase.id) ?? 0) + 1);
  }

  const duplicateIds = Array.from(phaseIdCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);

  if (duplicateIds.length > 0) {
    issues.push(`Phase numbers must be unique; duplicate phase id(s): ${duplicateIds.join(", ")}.`);
  }

  const hasSequentialIds = phases.every((phase, index) => phase.id === index + 1);
  if (!hasSequentialIds) {
    issues.push("Phase numbers must be sequential starting at 1.");
  }

  const activePhases = phases.filter(phase => phase.status === "in_progress");
  if (activePhases.length > 1) {
    const activeList = activePhases.map(phase => `Phase ${phase.id}: ${phase.name}`).join(", ");
    issues.push(`Only one phase may have [~] status at a time; active phases: ${activeList}.`);
  }

  for (const phase of phases) {
    if (phase.tasks.length === 0) {
      issues.push(`Phase ${phase.id}: ${phase.name} must contain at least one task checkbox.`);
    }

    if (phase.status === "completed" && phase.tasks.some(task => task.status !== "completed")) {
      issues.push(`Phase ${phase.id}: ${phase.name} is [x] but contains incomplete tasks.`);
    }
  }

  return issues;
}
