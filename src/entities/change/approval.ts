import * as path from "path";
import { isApproved, readApprovalEnvelope } from "../../shared/markdown/frontmatter";

export function isSetupApproved(changeDir: string): { approved: boolean; missing: string[] } {
  const prdPath = path.join(changeDir, "prd.md");
  const rulesPath = path.join(changeDir, "execution_contract.md");
  const missing: string[] = [];

  if (!isApproved(prdPath)) {
    missing.push("prd.md");
  }
  if (!isApproved(rulesPath)) {
    missing.push("execution_contract.md");
  }

  return {
    approved: missing.length === 0,
    missing
  };
}

export function isDesignApproved(changeDir: string): boolean {
  return isApproved(path.join(changeDir, "architecture", "design.md"));
}

export function isPlanApproved(changeDir: string): boolean {
  return isApproved(path.join(changeDir, "iteration_plan.md"));
}

export function approvedByValue(artifactPath: string): string | null {
  return readApprovalEnvelope(artifactPath).approvedBy;
}
