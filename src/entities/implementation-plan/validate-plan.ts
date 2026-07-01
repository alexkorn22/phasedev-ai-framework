import * as fs from "fs";
import * as path from "path";
import { CheckEvidenceRow, GenerationBundleRow, Phase, Task } from "./types";
import { extractRequirementsAndCriteriaFromPrd } from "../prd/traceability";
import { CANONICAL_PHASE_HEADING_SYNTAX, CANONICAL_TASK_SYNTAX } from "./contract-messages";
import { emptyTableCellsDiagnostic, isMarkdownTableSeparatorRow, splitMarkdownTableRow } from "../../shared/markdown/table";

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
const REQUIRED_PHASE_SECTIONS = ["Goal", "Expected Change Surface", "Tasks", "Checks", "Check Evidence"];
const EXPECTED_CHANGE_SURFACE_HEADERS = ["Area / Path Pattern", "Change Type", "Ownership", "Trace"];
const EXPECTED_CHANGE_SURFACE_MAX_ROWS = 10;

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

function headingLevel(line: string): number | null {
  const match = line.match(/^(#{1,6})\s+/);
  return match?.[1]?.length ?? null;
}

function phaseSectionLines(phase: Phase, sectionName: string): string[] {
  const lines = (phase.rawContent ?? "").split("\n");
  const headingIndex = lines.findIndex(line => new RegExp(`^###\\s+${sectionName}\\s*$`, "i").test(line.trim()));
  if (headingIndex === -1) return [];

  const boundaryIndex = lines.findIndex((line, index) => {
    const level = headingLevel(line.trim());
    return index > headingIndex && level !== null && level <= 3;
  });
  return lines.slice(headingIndex + 1, boundaryIndex === -1 ? lines.length : boundaryIndex);
}

function normalizeSurfacePath(value: string): string {
  return value.trim().replace(/^`(.+)`$/, "$1").trim();
}

function hasGlobPattern(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function validateExpectedSurfacePath(rowLabel: string, cells: string[], basePath: string | undefined, issues: string[]): void {
  if (!basePath) {
    return;
  }

  const surfacePath = normalizeSurfacePath(cells[0] ?? "");
  const changeType = (cells[1] ?? "").trim().toLowerCase();
  if (surfacePath.length === 0 || changeType !== "modify" || hasGlobPattern(surfacePath)) {
    return;
  }

  const resolvedPath = path.isAbsolute(surfacePath) ? surfacePath : path.resolve(basePath, surfacePath);
  if (!fs.existsSync(resolvedPath)) {
    issues.push(`${rowLabel} references MODIFY path that does not exist: \`${surfacePath}\`.`);
  }
}

function validateExpectedChangeSurface(phase: Phase, issues: string[], basePath?: string): void {
  const rows = phaseSectionLines(phase, "Expected Change Surface").filter(line => line.trim().startsWith("|"));
  if (rows.length === 0) {
    issues.push(`Phase ${phase.id}: ${phase.name} must contain a non-empty Expected Change Surface table.`);
    return;
  }

  const headerCells = splitMarkdownTableRow(rows[0]);
  if (
    headerCells.length !== EXPECTED_CHANGE_SURFACE_HEADERS.length ||
    headerCells.some((header, index) => header !== EXPECTED_CHANGE_SURFACE_HEADERS[index])
  ) {
    issues.push(`Phase ${phase.id}: ${phase.name} Expected Change Surface columns must be exactly: ${EXPECTED_CHANGE_SURFACE_HEADERS.join(", ")}.`);
  }

  if (!rows[1] || !isMarkdownTableSeparatorRow(splitMarkdownTableRow(rows[1]))) {
    issues.push(`Phase ${phase.id}: ${phase.name} Expected Change Surface must include a separator row immediately after the header.`);
  }

  const dataRows = rows.slice(2).filter(row => !isMarkdownTableSeparatorRow(splitMarkdownTableRow(row)));
  if (dataRows.length === 0) {
    issues.push(`Phase ${phase.id}: ${phase.name} must contain at least one Expected Change Surface row.`);
  }
  if (dataRows.length > EXPECTED_CHANGE_SURFACE_MAX_ROWS) {
    issues.push(`Phase ${phase.id}: ${phase.name} Expected Change Surface must contain at most ${EXPECTED_CHANGE_SURFACE_MAX_ROWS} rows.`);
  }

  for (const [index, row] of dataRows.entries()) {
    const cells = splitMarkdownTableRow(row);
    const rowLabel = `Phase ${phase.id}: ${phase.name} Expected Change Surface row ${index + 1}`;
    if (cells.length !== EXPECTED_CHANGE_SURFACE_HEADERS.length) {
      issues.push(`${rowLabel} must have exactly ${EXPECTED_CHANGE_SURFACE_HEADERS.length} cells.`);
      continue;
    }
    const emptyCellsIssue = emptyTableCellsDiagnostic("Expected Change Surface", { rowNumber: index + 1, cells }, EXPECTED_CHANGE_SURFACE_HEADERS, { rowLabel });
    if (emptyCellsIssue) {
      issues.push(emptyCellsIssue);
    }
    const trace = cells[3] ?? "";
    if (!/\bR\d+\b/.test(trace) || !/\bSC\d+\b/.test(trace) || !/\bD\d+\b/.test(trace)) {
      issues.push(`${rowLabel} Trace must reference at least one \`R#\`, one \`SC#\`, and one \`D#\`.`);
    }
    validateExpectedSurfacePath(rowLabel, cells, basePath, issues);
  }
}

function validateGenerationBundle(rows: GenerationBundleRow[], issues: string[]): void {
  if (rows.length === 0) {
    issues.push("iteration_plan.md must contain a non-empty Generation Bundle table.");
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

function phaseStatusOrder(status: Phase["status"]): number {
  switch (status) {
    case "completed":
      return 0;
    case "in_progress":
      return 1;
    case "not_started":
      return 2;
  }
}

function phaseStatusMarker(status: Phase["status"]): "[x]" | "[~]" | "[ ]" {
  switch (status) {
    case "completed":
      return "[x]";
    case "in_progress":
      return "[~]";
    case "not_started":
      return "[ ]";
  }
}

function validatePhaseStatusOrder(phases: Phase[], issues: string[]): void {
  for (let index = 1; index < phases.length; index++) {
    const previous = phases[index - 1];
    const current = phases[index];
    if (phaseStatusOrder(current.status) < phaseStatusOrder(previous.status)) {
      issues.push(
        `Phase statuses must follow [x]* -> [~]? -> [ ]* order; Phase ${current.id}: ${current.name} ${phaseStatusMarker(current.status)} cannot appear after Phase ${previous.id}: ${previous.name} ${phaseStatusMarker(previous.status)}.`
      );
    }
  }
}

export function validatePlanStructure(phases: Phase[], prdPath?: string, surfaceBasePath?: string): string[] {
  const issues: string[] = [];
  const taskIds = new Map<string, string>();

  if (phases.length === 0) {
    return [`iteration_plan.md must contain at least one phase heading. ${CANONICAL_PHASE_HEADING_SYNTAX}`];
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

  validatePhaseStatusOrder(phases, issues);

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
      if (phaseHasSection(phase, "Expected Change Surface")) {
        validateExpectedChangeSurface(phase, issues, surfaceBasePath);
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
        issues.push(`Phase ${phase.id}: ${phase.name} has a task with invalid task ID syntax: ${task.name}. ${CANONICAL_TASK_SYNTAX}`);
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
