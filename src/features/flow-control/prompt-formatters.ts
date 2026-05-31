import { Phase } from "../../entities/implementation-plan/types";

export function toFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  return `file://${normalized}`;
}

export function formatTaskList(phase: Phase): string {
  return phase.tasks.map(task => `  * [${task.status === "completed" ? "x" : task.status === "in_progress" ? "~" : " "}] ${task.name}`).join("\n");
}

export function formatAdditionalChecks(phase: Phase | null): string {
  if (!phase || phase.additionalChecks.length === 0) {
    return "  * Нет дополнительных проверок для текущей фазы.";
  }

  return phase.additionalChecks.map(check => `  * ${check}`).join("\n");
}
