import { Iteration, Task } from "../../entities/iteration-plan/types";

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

export function formatTaskList(phase: Iteration): string {
  return phase.tasks.flatMap(task => formatTask(task, 0)).join("\n");
}

export function formatPhaseExcerpt(phase: Iteration): string {
  return phase.rawContent?.trim() || `## Iteration ${phase.id}: ${phase.name}\n${formatTaskList(phase)}`;
}

export function formatPlanMap(iterations: Iteration[], currentPhaseId: number): string {
  if (iterations.length === 0) {
    return "No iterations parsed from the approved plan.";
  }

  return iterations.map(phase => {
    const status = phase.status === "completed" ? "[x]" : phase.status === "in_progress" ? "[~]" : "[ ]";
    const marker = phase.id === currentPhaseId ? "current" : "orientation only";
    const taskIds = phase.tasks.map(task => task.id).filter(Boolean).join(", ") || "no task ids parsed";
    const requiredChecks = phase.requiredChecks && phase.requiredChecks.length > 0
      ? phase.requiredChecks.map(check => check.check).join(", ")
      : "unit";
    return `- Iteration ${phase.id}: ${phase.name} ${status} (${marker}); tasks: ${taskIds}; required checks: ${requiredChecks}`;
  }).join("\n");
}
