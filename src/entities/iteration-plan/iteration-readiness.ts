import { TestCommands } from "../test-commands/parse-test-commands";
import {
  authoritativeRequiredCheckCommand,
  evidenceMatchesRequiredCheck,
  iterationRequiresFullGate
} from "../test-commands/resolve-check-commands";
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

function hasPassedRequiredCheckEvidence(
  phase: Iteration,
  requiredCheck: { check: string; command: string },
  testCommands?: TestCommands
): boolean {
  const requiredCheckName = requiredCheck.check.trim().toLowerCase();
  return (phase.checkEvidence ?? []).some(row =>
    row.result === "passed" &&
    row.check.trim().toLowerCase() === requiredCheckName &&
    evidenceMatchesRequiredCheck(requiredCheck, row.commandOrMethod, testCommands)
  );
}

export function iterationValidationBlockers(phase: Iteration, testCommands?: TestCommands): string[] {
  const blockers: string[] = [];
  if (iterationRequiresFullGate(phase)) {
    blockers.push("iteration Checks may list only focused gates `unit` and/or `phase`; `full` is reserved for Final Validation implementation-check");
  }
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
    .filter(required => !hasPassedRequiredCheckEvidence(phase, required, testCommands))
    .map(required => {
      const command = authoritativeRequiredCheckCommand(required, testCommands);
      return `${required.check}: ${command}`;
    });
  if (missingRequired.length > 0) {
    blockers.push(`required check evidence is missing or stale: ${missingRequired.join(", ")}`);
  }
  return blockers;
}

export function isIterationReadyForValidation(phase: Iteration, testCommands?: TestCommands): boolean {
  return iterationValidationBlockers(phase, testCommands).length === 0;
}
