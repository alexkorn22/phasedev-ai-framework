import { Phase, Task } from "./types";

function allTopLevelTasksCompleted(phase: Phase): boolean {
  return phase.tasks.length > 0 && phase.tasks.every(task => task.status === "completed");
}

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap(task => [task, ...flattenTasks(task.children)]);
}

export function hasIncompleteTask(tasks: Task[]): boolean {
  return flattenTasks(tasks).some(task => task.status !== "completed");
}

export function hasPendingOrFailedEvidence(phase: Phase): boolean {
  return (phase.checkEvidence ?? []).some(row => row.result === "pending" || row.result === "failed");
}

export function isPhaseReadyForValidation(phase: Phase): boolean {
  return allTopLevelTasksCompleted(phase) && !hasPendingOrFailedEvidence(phase);
}
