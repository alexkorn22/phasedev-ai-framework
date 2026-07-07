import * as path from "path";

export const SYSTEM_DIR = ".phasedev";

export interface ChangePaths {
  changeDir: string;
  prdPath: string;
  executionContractPath: string;
  researchPath: string;
  designPath: string;
  iterationPlanPath: string;
  findingsPath: string;
  findingsBaselinePath: string;
}

export function buildChangePaths(changeDir: string): ChangePaths {
  return {
    changeDir,
    prdPath: path.join(changeDir, "prd.md"),
    executionContractPath: path.join(changeDir, "execution_contract.md"),
    researchPath: path.join(changeDir, "research_facts.md"),
    designPath: path.join(changeDir, "architecture", "design.md"),
    iterationPlanPath: path.join(changeDir, "iteration_plan.md"),
    findingsPath: path.join(changeDir, "validation_findings.md"),
    findingsBaselinePath: path.join(changeDir, ".findings-baseline.json")
  };
}

export function archiveRootPath(projectPath: string): string {
  return path.join(projectPath, SYSTEM_DIR, "changes", "archive");
}

export function archiveTargetPath(projectPath: string, changeName: string, date: string): string {
  return path.join(archiveRootPath(projectPath), `${date}-${changeName}`);
}
