import { Phase, Task } from "../../entities/implementation-plan/types";

export function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  return `file://${normalized}`;
}

function formatTask(task: Task, depth: number): string[] {
  const marker = task.status === "completed" ? "x" : task.status === "in_progress" ? "~" : " ";
  const prefix = "  ".repeat(depth + 1);
  const label = task.id ? `${task.id} ${task.name}` : task.name;
  return [
    `${prefix}- [${marker}] ${label}`,
    ...task.children.flatMap(child => formatTask(child, depth + 1))
  ];
}

export function formatTaskList(phase: Phase): string {
  return phase.tasks.flatMap(task => formatTask(task, 0)).join("\n");
}

export function formatPhaseExcerpt(phase: Phase): string {
  return phase.rawContent?.trim() || `## Iteration ${phase.id}: ${phase.name}\n${formatTaskList(phase)}`;
}

export function formatPlanMap(phases: Phase[], currentPhaseId: number): string {
  if (phases.length === 0) {
    return "No phases parsed from the approved plan.";
  }

  return phases.map(phase => {
    const status = phase.status === "completed" ? "[x]" : phase.status === "in_progress" ? "[~]" : "[ ]";
    const marker = phase.id === currentPhaseId ? "current" : "orientation only";
    const taskIds = phase.tasks.map(task => task.id).filter(Boolean).join(", ") || "no task ids parsed";
    const requiredChecks = phase.requiredChecks && phase.requiredChecks.length > 0
      ? phase.requiredChecks.map(check => check.check).join(", ")
      : "unit";
    return `- Iteration ${phase.id}: ${phase.name} ${status} (${marker}); tasks: ${taskIds}; required checks: ${requiredChecks}`;
  }).join("\n");
}

export function formatAdditionalChecks(phase: Phase | null): string {
  if (!phase || phase.additionalChecks.length === 0) {
    return "  * No additional checks for the current phase.";
  }

  return phase.additionalChecks.map(check => `  * ${check}`).join("\n");
}
