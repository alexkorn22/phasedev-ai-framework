import * as path from "path";
import { isApproved } from "../../shared/markdown/frontmatter";

export function isSetupApproved(changeDir: string): { approved: boolean; missing: string[] } {
  const prdPath = path.join(changeDir, "prd.md");
  const rulesPath = path.join(changeDir, "rules.md");
  const missing: string[] = [];

  if (!isApproved(prdPath)) {
    missing.push("prd.md");
  }
  if (!isApproved(rulesPath)) {
    missing.push("rules.md");
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
  return isApproved(path.join(changeDir, "implementation_plan.md"));
}
