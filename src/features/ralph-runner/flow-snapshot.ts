import * as fs from "fs";
import * as path from "path";
import { FlowPrompt, FlowStage } from "../../entities/flow-stage/types";
import { parsePlan } from "../../entities/implementation-plan/parse-plan";
import { parseBlockingValidationFindings, parseValidationVerdict, parseValidationVerdictType } from "../../entities/validation-findings/parse-validation-findings";

export interface FlowSnapshot {
  activeChange: string | null;
  stage: FlowStage;
  blocked: boolean;
  phaseState?: Array<{
    id: number;
    status: string;
    taskStatuses: string[];
  }>;
  validationState?: {
    verdict: string;
    type: string;
    openBlockingFindingSignatures: string[];
    resolvedBlockingFindingSignatures: string[];
  };
}

function validationState(findingsPath: string): FlowSnapshot["validationState"] {
  const blockingFindings = parseBlockingValidationFindings(findingsPath);
  return {
    verdict: parseValidationVerdict(findingsPath),
    type: parseValidationVerdictType(findingsPath),
    openBlockingFindingSignatures: blockingFindings
      .filter(finding => finding.status !== "resolved")
      .map(finding => finding.signature),
    resolvedBlockingFindingSignatures: blockingFindings
      .filter(finding => finding.status === "resolved")
      .map(finding => finding.signature)
  };
}

export function createSnapshot(activeChange: string | null, nextPrompt: FlowPrompt): FlowSnapshot {
  const planPath = activeChange ? path.join(activeChange, "implementation_plan.md") : "";
  const findingsPath = activeChange ? path.join(activeChange, "validation_findings.md") : "";

  return {
    activeChange,
    stage: nextPrompt.stage,
    blocked: nextPrompt.blocked,
    phaseState: activeChange && fs.existsSync(planPath)
      ? parsePlan(planPath).map(phase => ({
        id: phase.id,
        status: phase.status,
        taskStatuses: phase.tasks.map(task => task.status)
      }))
      : undefined,
    validationState: activeChange && fs.existsSync(findingsPath)
      ? validationState(findingsPath)
      : undefined
  };
}

export function sameSnapshot(left: FlowSnapshot, right: FlowSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
