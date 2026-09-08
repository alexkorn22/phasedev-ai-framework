import { validateRulesArtifact } from "../rules/validate-rules";

export { parseBrowserValidation, type BrowserValidation } from "./parse-browser-validation";

export interface ExecutionContractValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateExecutionContract(path: string): ExecutionContractValidationResult {
  const issues = validateRulesArtifact(path);
  return { valid: issues.length === 0, issues };
}
