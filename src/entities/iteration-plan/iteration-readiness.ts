import { Iteration, Task } from "./types";

function allTopLevelTasksCompleted(phase: Iteration): boolean {
  return phase.tasks.length > 0 && phase.tasks.every(task => task.status === "completed");
}

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap(task => [task, ...flattenTasks(task.children)]);
}

export function hasIncompleteTask(tasks: Task[]): boolean {
  return flattenTasks(tasks).some(task => task.status !== "completed");
}

function normalizeEvidenceCommand(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1").replace(/\s+/g, " ").trim();
}

function hasPassedRequiredCheckEvidence(phase: Iteration, requiredCheck: { check: string; command: string }): boolean {
  const requiredCheckName = requiredCheck.check.trim().toLowerCase();
  const requiredCommand = normalizeEvidenceCommand(requiredCheck.command);
  return (phase.checkEvidence ?? []).some(row =>
    row.result === "passed" &&
    row.check.trim().toLowerCase() === requiredCheckName &&
    normalizeEvidenceCommand(row.commandOrMethod) === requiredCommand
  );
}

export function iterationValidationBlockers(phase: Iteration): string[] {
  const blockers: string[] = [];
  if (!allTopLevelTasksCompleted(phase)) {
    blockers.push("top-level tasks are not all completed");
  }
  const unreadyResults = (phase.checkEvidence ?? [])
    .filter(row => ["pending", "failed", "blocked"].includes(row.result))
    .map(row => `${row.check}: ${row.result}`);
  if (unreadyResults.length > 0) {
    blockers.push(`Check Evidence has unready result(s): ${unreadyResults.join(", ")}`);
  }
  const missingRequired = (phase.requiredChecks ?? [])
    .filter(required => !hasPassedRequiredCheckEvidence(phase, required))
    .map(required => `${required.check}: ${required.command}`);
  if (missingRequired.length > 0) {
    blockers.push(`required check evidence is missing or stale: ${missingRequired.join(", ")}`);
  }
  return blockers;
}

export function isIterationReadyForValidation(phase: Iteration): boolean {
  return iterationValidationBlockers(phase).length === 0;
}
