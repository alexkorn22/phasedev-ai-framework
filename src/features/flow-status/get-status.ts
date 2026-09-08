import * as fs from "fs";
import * as path from "path";
import { resolveCurrentState } from "../phase-control/current-flow-state";
import { resolveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { parseBrowserValidation } from "../../entities/execution-contract/parse-browser-validation";
import { FinalGateResult, parseFinalGateEvidence } from "../../entities/final-gate-evidence/parse-final-gate-evidence";
import { parsePlan } from "../../entities/iteration-plan/parse-plan";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";
import { readFrontmatter } from "../../shared/markdown/frontmatter";
import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY, blockingSeverityLabel } from "../../entities/validation-findings/blocking-severity";

export type BrowserValidationStatus = "present" | "absent";
export type FullGateEvidenceStatus = FinalGateResult | "missing";
export type BrowserGateEvidenceStatus = FinalGateResult | "missing" | "not_required";

export interface FinalGateStatus {
  browserValidation: BrowserValidationStatus;
  fullGateEvidence: FullGateEvidenceStatus;
  browserGateEvidence: BrowserGateEvidenceStatus;
}

export interface FlowStatus {
  activeChange: string | null;
  mode?: "standard" | "quick";
  phase: string;
  routeKind: string;
  artifacts: Array<{ name: string; exists: boolean; approved: boolean }>;
  iterations: Array<{ id: number; name: string; status: string }>;
  validationFindings: { exists: boolean; verdict: string; type: string; openCount: number; blockingCount: number };
  blockingSeverity?: BlockingSeverity;
  finalGates?: FinalGateStatus;
}

function artifactStatus(changeDir: string, relPath: string): { name: string; exists: boolean; approved: boolean } {
  const fullPath = path.join(changeDir, relPath);
  const exists = fs.existsSync(fullPath);
  const approved = exists ? readFrontmatter(fullPath)?.approved === true : false;
  return { name: relPath, exists, approved };
}

function isInvalidStatePhase(phase: string): boolean {
  return phase.startsWith("INVALID STATE");
}

function shouldShowFinalGates(phase: string, findingsType: string): boolean {
  if (isInvalidStatePhase(phase)) {
    return false;
  }
  if (phase === "final_validation") {
    return true;
  }
  return phase === "finding_repair" && findingsType === "final";
}

function resolveFinalGateStatus(paths: ReturnType<typeof buildChangePaths>): FinalGateStatus {
  const browserValidation = parseBrowserValidation(paths.executionContractPath);
  const artifact = parseFinalGateEvidence(paths.finalGateEvidencePath);
  const fullRow = artifact.rows.find(row => row.gate === "full");

  return {
    browserValidation: browserValidation.present ? "present" : "absent",
    fullGateEvidence: fullRow?.result ?? "missing",
    browserGateEvidence: browserValidation.present
      ? artifact.rows.find(row => row.gate === "browser")?.result ?? "missing"
      : "not_required"
  };
}

export function getFlowStatus(
  projectPath: string,
  changeName?: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): FlowStatus {
  let state: { phase: string; routeKind: string };
  try {
    const resolved = resolveCurrentState(projectPath, changeName, blockingSeverity);
    state = { phase: resolved.phase, routeKind: resolved.routeKind };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    state = { phase: `INVALID STATE — state.json is corrupted: ${message}`, routeKind: "invalid_state" };
  }
  const changeDir = resolveChangeDir(projectPath, changeName);
  const isQuick = state.routeKind === "quick";

  const artifacts: Array<{ name: string; exists: boolean; approved: boolean }> = [];
  if (changeDir) {
    if (isQuick) {
      artifacts.push(artifactStatus(changeDir, "worklog.md"));
    } else {
      artifacts.push(artifactStatus(changeDir, "prd.md"));
      artifacts.push(artifactStatus(changeDir, "execution_contract.md"));
      artifacts.push(artifactStatus(changeDir, "research_facts.md"));
      artifacts.push(artifactStatus(changeDir, "architecture/design.md"));
      artifacts.push(artifactStatus(changeDir, "iteration_plan.md"));
      artifacts.push(artifactStatus(changeDir, "validation_findings.md"));
    }
  }

  let iterations: Array<{ id: number; name: string; status: string }> = [];
  let validationFindings: FlowStatus["validationFindings"] = { exists: false, verdict: "unknown", type: "unknown", openCount: 0, blockingCount: 0 };
  let finalGates: FinalGateStatus | undefined;

  if (changeDir && !isQuick) {
    const paths = buildChangePaths(changeDir);
    const plan = parsePlan(paths.iterationPlanPath);
    iterations = plan.map((p: { id: number; name: string; status: string }) => ({
      id: p.id,
      name: p.name,
      status: p.status
    }));

    const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
    validationFindings = {
      exists: findings.exists,
      verdict: findings.verdict,
      type: findings.type,
      openCount: findings.openRows.length,
      blockingCount: findings.openBlockingRows.length
    };

    if (shouldShowFinalGates(state.phase, findings.type)) {
      finalGates = resolveFinalGateStatus(paths);
    }
  }

  return {
    activeChange: changeDir ? path.basename(changeDir) : null,
    mode: isQuick ? "quick" : "standard",
    phase: state.phase,
    routeKind: state.routeKind,
    artifacts,
    iterations,
    validationFindings,
    blockingSeverity,
    finalGates
  };
}

export function renderFlowStatus(status: FlowStatus): string {
  const lines: string[] = [];
  lines.push("=== PhaseDev Flow Status ===");
  lines.push("");
  lines.push(`Active Change: ${status.activeChange ?? "none"}`);
  if (status.mode) {
    lines.push(`Mode: ${status.mode}`);
  }
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
    const blockingLabel = status.blockingSeverity ? blockingSeverityLabel(status.blockingSeverity) : "MUST-FIX";
    lines.push("--- Validation Findings ---");
    lines.push(`  Verdict: ${status.validationFindings.verdict}`);
    lines.push(`  Type: ${status.validationFindings.type}`);
    lines.push(`  Open findings: ${status.validationFindings.openCount}`);
    lines.push(`  Blocking (${blockingLabel}): ${status.validationFindings.blockingCount}`);
    lines.push("");
  }

  if (status.finalGates) {
    lines.push("--- Final gates ---");
    lines.push(`  Browser Validation: ${status.finalGates.browserValidation}`);
    lines.push(`  full gate evidence: ${status.finalGates.fullGateEvidence}`);
    lines.push(`  browser gate evidence: ${status.finalGates.browserGateEvidence}`);
  }

  return lines.join("\n");
}
