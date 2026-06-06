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
    `${prefix}* [${marker}] ${label}`,
    ...task.children.flatMap(child => formatTask(child, depth + 1))
  ];
}

export function formatTaskList(phase: Phase): string {
  return phase.tasks.flatMap(task => formatTask(task, 0)).join("\n");
}

export function formatPhaseExcerpt(phase: Phase): string {
  return phase.rawContent?.trim() || `## Phase ${phase.id}: ${phase.name}\n${formatTaskList(phase)}`;
}

export function formatAdditionalChecks(phase: Phase | null): string {
  if (!phase || phase.additionalChecks.length === 0) {
    return "  * Нет дополнительных проверок для текущей фазы.";
  }

  return phase.additionalChecks.map(check => `  * ${check}`).join("\n");
}
