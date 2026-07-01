import * as fs from "fs";

const REQUIRED_SECTIONS = ["Constraints", "Verification Gates", "Manual Checks", "Environment Notes"];

export interface ExecutionContractValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateExecutionContract(path: string): ExecutionContractValidationResult {
  const issues: string[] = [];

  if (!fs.existsSync(path)) {
    return { valid: false, issues: [`execution_contract.md not found at ${path}.`] };
  }

  const content = fs.readFileSync(path, "utf-8");

  for (const section of REQUIRED_SECTIONS) {
    const sectionRegex = new RegExp(`^##\\s+${section}`, "m");
    if (!sectionRegex.test(content)) {
      issues.push(`execution_contract.md is missing required section: ## ${section}.`);
    }
  }

  return { valid: issues.length === 0, issues };
}
