import * as fs from "fs";
import * as path from "path";
import { resolveCurrentState } from "../phase-control/current-flow-state";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { readFrontmatter } from "../../shared/markdown/frontmatter";

export interface FlowStatus {
  activeChange: string | null;
  phase: string;
  routeKind: string;
  artifacts: Array<{ name: string; exists: boolean; approved: boolean }>;
  iterations: Array<{ id: number; name: string; status: string }>;
  validationFindings: { exists: boolean; verdict: string; type: string; openCount: number; blockingCount: number };
}

function artifactStatus(changeDir: string, relPath: string): { name: string; exists: boolean; approved: boolean } {
  const fullPath = path.join(changeDir, relPath);
  const exists = fs.existsSync(fullPath);
  const approved = exists ? readFrontmatter(fullPath)?.approved === true : false;
  return { name: relPath, exists, approved };
}

export function getFlowStatus(projectPath: string): FlowStatus {
  let state: { phase: string; routeKind: string };
  try {
    const resolved = resolveCurrentState(projectPath);
    state = { phase: resolved.phase, routeKind: resolved.routeKind };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    state = { phase: `INVALID STATE — state.json is corrupted: ${message}`, routeKind: "error" };
  }
  const changeDir = findActiveChangeDir(projectPath);

  const artifacts: Array<{ name: string; exists: boolean; approved: boolean }> = [];
  if (changeDir) {
    const paths = buildChangePaths(changeDir);
    artifacts.push(artifactStatus(changeDir, "prd.md"));
    artifacts.push(artifactStatus(changeDir, "execution_contract.md"));
    artifacts.push(artifactStatus(changeDir, "research_facts.md"));
    artifacts.push(artifactStatus(changeDir, "architecture/design.md"));
    artifacts.push(artifactStatus(changeDir, "iteration_plan.md"));
    artifacts.push(artifactStatus(changeDir, "validation_findings.md"));
  }

  let iterations: Array<{ id: number; name: string; status: string }> = [];
  let validationFindings: FlowStatus["validationFindings"] = { exists: false, verdict: "unknown", type: "unknown", openCount: 0, blockingCount: 0 };

  if (changeDir) {
    const paths = buildChangePaths(changeDir);
    const plan = parsePlan(paths.iterationPlanPath);
    iterations = plan.map((p: { id: number; name: string; status: string }) => ({
      id: p.id,
      name: p.name,
      status: p.status
    }));

    const findings = parseValidationFindingsArtifact(paths.findingsPath);
    validationFindings = {
      exists: findings.exists,
      verdict: findings.verdict,
      type: findings.type,
      openCount: findings.openRows.length,
      blockingCount: findings.openBlockingRows.length
    };
  }

  return {
    activeChange: changeDir ? path.basename(changeDir) : null,
    phase: state.phase,
    routeKind: state.routeKind,
    artifacts,
    iterations,
    validationFindings
  };
}

export function renderFlowStatus(status: FlowStatus): string {
  const lines: string[] = [];
  lines.push("=== PhaseDev Flow Status ===");
  lines.push("");
  lines.push(`Active Change: ${status.activeChange ?? "none"}`);
  lines.push(`Current Phase: ${status.phase}`);
  lines.push(`Route: ${status.routeKind}`);
  lines.push("");

  if (status.artifacts.length > 0) {
    lines.push("--- Artifacts ---");
    for (const art of status.artifacts) {
      const existsMark = art.exists ? "EXISTS" : "MISSING";
      const approvedMark = art.exists ? (art.approved ? "APPROVED" : "NOT APPROVED") : "";
      lines.push(`  ${art.name}: ${existsMark}${approvedMark ? `, ${approvedMark}` : ""}`);
    }
    lines.push("");
  }

  if (status.iterations.length > 0) {
    lines.push("--- Iterations ---");
    const statusMap: Record<string, string> = { completed: "[x]", in_progress: "[~]", not_started: "[ ]" };
    for (const iter of status.iterations) {
      const marker = statusMap[iter.status] ?? `[${iter.status}]`;
      lines.push(`  Iteration ${iter.id}: ${iter.name} ${marker}`);
    }
    lines.push("");
  }

  if (status.validationFindings.exists) {
    lines.push("--- Validation Findings ---");
    lines.push(`  Verdict: ${status.validationFindings.verdict}`);
    lines.push(`  Type: ${status.validationFindings.type}`);
    lines.push(`  Open findings: ${status.validationFindings.openCount}`);
    lines.push(`  Blocking (MUST-FIX): ${status.validationFindings.blockingCount}`);
  }

  return lines.join("\n");
}
