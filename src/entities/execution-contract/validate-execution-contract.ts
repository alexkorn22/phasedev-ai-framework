import * as fs from "fs";
import { blankFencedCodeLines } from "../../shared/markdown/code-fences";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";

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

  const content = normalizeLineEndings(fs.readFileSync(path, "utf-8"));
  const lines = blankFencedCodeLines(content.split("\n"));

  for (const section of REQUIRED_SECTIONS) {
    const sectionRegex = new RegExp(`^##\\s+${section}`);
    if (!lines.some(line => sectionRegex.test(line))) {
      issues.push(`execution_contract.md is missing required section: ## ${section}.`);
    }
  }

  return { valid: issues.length === 0, issues };
}
