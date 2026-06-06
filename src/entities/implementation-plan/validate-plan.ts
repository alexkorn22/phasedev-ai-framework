import * as fs from "fs";
import { CheckEvidenceRow, GenerationBundleRow, Phase, Task } from "./types";

const REQUIRED_GENERATION_BUNDLE_AREAS = [
  "Production code",
  "Tests",
  "Docs/specs",
  "Migrations",
  "Feature flags/rollout",
  "Observability",
  "Rollback path"
];

const ALLOWED_BUNDLE_VALUES = new Set(["yes", "no", "not_applicable"]);
const ALLOWED_EVIDENCE_RESULTS = new Set(["pending", "passed", "failed", "blocked", "not_applicable"]);
const REQUIRED_PHASE_SECTIONS = ["Goal", "Tasks", "Checks", "Check Evidence"];

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap(task => [task, ...flattenTasks(task.children)]);
}

function hasIncompleteTask(tasks: Task[]): boolean {
  return flattenTasks(tasks).some(task => task.status !== "completed");
}

function hasIncompleteChild(task: Task): boolean {
  return flattenTasks(task.children).some(child => child.status !== "completed");
}

function hasParsedPlanContent(phases: Phase[]): boolean {
  return phases.some(phase => phase.rawContent !== undefined);
}

function phaseHasSection(phase: Phase, sectionName: string): boolean {
  return new RegExp(`^###\\s+${sectionName}\\s*$`, "im").test(phase.rawContent ?? "");
}

function extractRequirementsAndCriteriaFromPrd(prdPath: string): { requirements: string[]; criteria: string[] } {
  if (!fs.existsSync(prdPath)) {
    return { requirements: [], criteria: [] };
  }
  const content = fs.readFileSync(prdPath, "utf-8");
  const lines = content.split("\n");

  const requirements: string[] = [];
  const criteria: string[] = [];

  let currentSection = "";
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentSection = heading[1].trim().toLowerCase();
      continue;
    }

    if (currentSection === "requirements") {
      const match = line.match(/[-*]\s+(R\d+):/);
      if (match) {
        requirements.push(match[1]);
      }
    } else if (currentSection === "success criteria") {
      const match = line.match(/[-*]\s+(SC\d+):/);
      if (match) {
        criteria.push(match[1]);
      }
    }
  }

  return { requirements, criteria };
}

function validateGenerationBundle(rows: GenerationBundleRow[], issues: string[]): void {
  if (rows.length === 0) {
    issues.push("implementation_plan.md must contain a non-empty Generation Bundle table.");
    return;
  }

  const rowsByArea = new Map<string, GenerationBundleRow>();
  for (const row of rows) {
    if (!row.area) {
      issues.push("Generation Bundle contains a row with an empty Area.");
      continue;
    }

    if (rowsByArea.has(row.area)) {
      issues.push(`Generation Bundle contains duplicate area \`${row.area}\`.`);
    }
    rowsByArea.set(row.area, row);

    if (!ALLOWED_BUNDLE_VALUES.has(row.required)) {
      issues.push(`Generation Bundle area \`${row.area}\` has invalid Required value \`${row.required}\`; expected yes, no, or not_applicable.`);
    }
    if (row.plan.trim().length === 0) {
      issues.push(`Generation Bundle area \`${row.area}\` must have a non-empty Plan explanation.`);
    }
  }

  for (const area of REQUIRED_GENERATION_BUNDLE_AREAS) {
    if (!rowsByArea.has(area)) {
      issues.push(`Generation Bundle must include area \`${area}\`.`);
    }
  }
}

function validateCheckEvidenceRows(phase: Phase, rows: CheckEvidenceRow[], issues: string[]): void {
  if (rows.length === 0) {
    issues.push(`Phase ${phase.id}: ${phase.name} must contain a non-empty Check Evidence table.`);
    return;
  }

  for (const [index, row] of rows.entries()) {
    const rowLabel = `Phase ${phase.id}: ${phase.name} Check Evidence row ${index + 1}`;
    if (row.check.trim().length === 0) {
      issues.push(`${rowLabel} has an empty Check.`);
    }
    if (row.commandOrMethod.trim().length === 0) {
      issues.push(`${rowLabel} has an empty Command Or Method.`);
    }
    if (!ALLOWED_EVIDENCE_RESULTS.has(row.result)) {
      issues.push(`${rowLabel} has invalid Result \`${row.result}\`; expected pending, passed, failed, blocked, or not_applicable.`);
    }
    if (["passed", "failed", "blocked"].includes(row.result) && row.evidence.trim().length === 0) {
      issues.push(`${rowLabel} with Result \`${row.result}\` must have non-empty Evidence.`);
    }
  }
}

export function validatePlanStructure(phases: Phase[], prdPath?: string): string[] {
  const issues: string[] = [];
  const taskIds = new Map<string, string>();

  if (phases.length === 0) {
    return ["implementation_plan.md must contain at least one phase heading."];
  }

  const shouldValidateArtifactContract = hasParsedPlanContent(phases);
  if (shouldValidateArtifactContract) {
    validateGenerationBundle(phases[0].generationBundle ?? [], issues);
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
    if (phase.name.trim().length === 0) {
      issues.push(`Phase ${phase.id} must have a non-empty name.`);
    }

    if (shouldValidateArtifactContract) {
      for (const section of REQUIRED_PHASE_SECTIONS) {
        if (!phaseHasSection(phase, section)) {
          issues.push(`Phase ${phase.id}: ${phase.name} must contain section \`### ${section}\`.`);
        }
      }
      validateCheckEvidenceRows(phase, phase.checkEvidence ?? [], issues);
    }

    if (phase.tasks.length === 0) {
      issues.push(`Phase ${phase.id}: ${phase.name} must contain at least one task checkbox.`);
    }

    const allTasks = flattenTasks(phase.tasks);
    for (const task of allTasks) {
      const taskLabel = task.id || task.name;
      if (task.id.length === 0) {
        issues.push(`Phase ${phase.id}: ${phase.name} has a task without a numbered ID: ${task.name}.`);
        continue;
      }

      if (!task.id.startsWith(`${phase.id}.`)) {
        issues.push(`Task ${task.id} must start with phase number ${phase.id}.`);
      }

      const existing = taskIds.get(task.id);
      if (existing) {
        issues.push(`Task IDs must be unique; duplicate task id \`${task.id}\` in ${existing} and Phase ${phase.id}: ${phase.name}.`);
      } else {
        taskIds.set(task.id, `Phase ${phase.id}: ${phase.name}`);
      }

      if (task.status === "completed" && hasIncompleteChild(task)) {
        issues.push(`Task ${taskLabel} is [x] but contains incomplete subtasks.`);
      }
    }

    if (phase.status === "completed" && hasIncompleteTask(phase.tasks)) {
      issues.push(`Phase ${phase.id}: ${phase.name} is [x] but contains incomplete tasks.`);
    }

    // Invariant: not-started phase must not contain completed tasks/evidence
    if (phase.status === "not_started") {
      const completedTasks = allTasks.filter(task => task.status === "completed");
      if (completedTasks.length > 0) {
        issues.push(`Phase ${phase.id}: ${phase.name} is not started [ ] but contains completed tasks: ${completedTasks.map(t => t.id).join(", ")}.`);
      }

      if (shouldValidateArtifactContract && phase.checkEvidence) {
        const nonPendingEvidence = phase.checkEvidence.filter(
          row => row.result !== "pending" && row.result !== "not_applicable"
        );
        if (nonPendingEvidence.length > 0) {
          issues.push(`Phase ${phase.id}: ${phase.name} is not started [ ] but contains non-pending evidence results.`);
        }
      }
    }
  }

  // Traceability checks against PRD
  if (prdPath && fs.existsSync(prdPath)) {
    const { requirements, criteria } = extractRequirementsAndCriteriaFromPrd(prdPath);
    const planText = phases.map(phase => phase.rawContent ?? "").join("\n");

    for (const req of requirements) {
      const regex = new RegExp(`\\b${req}\\b`);
      if (!regex.test(planText)) {
        issues.push(`Requirement \`${req}\` is not mapped in the implementation plan.`);
      }
    }

    for (const crit of criteria) {
      const regex = new RegExp(`\\b${crit}\\b`);
      if (!regex.test(planText)) {
        issues.push(`Success criterion \`${crit}\` is not mapped in the implementation plan.`);
      }
    }
  }

  return issues;
}
