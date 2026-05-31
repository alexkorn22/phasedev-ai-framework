import * as path from "path";

export interface ChangePaths {
  changeDir: string;
  prdPath: string;
  rulesPath: string;
  researchPath: string;
  designPath: string;
  planPath: string;
  findingsPath: string;
}

export function buildChangePaths(changeDir: string): ChangePaths {
  return {
    changeDir,
    prdPath: path.join(changeDir, "prd.md"),
    rulesPath: path.join(changeDir, "rules.md"),
    researchPath: path.join(changeDir, "research_facts.md"),
    designPath: path.join(changeDir, "architecture", "design.md"),
    planPath: path.join(changeDir, "implementation_plan.md"),
    findingsPath: path.join(changeDir, "validation_findings.md")
  };
}

export function archiveRootPath(projectPath: string): string {
  return path.join(projectPath, "openspec", "changes", "archive");
}

export function archiveTargetPath(projectPath: string, changeName: string, date: string): string {
  return path.join(archiveRootPath(projectPath), `${date}-${changeName}`);
}
