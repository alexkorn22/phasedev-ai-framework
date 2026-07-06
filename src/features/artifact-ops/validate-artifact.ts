import * as fs from "fs";
import * as path from "path";
import { validatePrdArtifact } from "../../entities/prd/validate-prd";
import { validateRulesArtifact } from "../../entities/rules/validate-rules";
import { validateResearchFacts } from "../../entities/research-facts/validate-research";
import { validateDesign } from "../../entities/design/validate-design";
import { validatePlanArtifact } from "../../entities/iteration-plan/validate-plan-artifact";
import { parseValidationFindingsArtifact } from "../../entities/validation-findings/parse-validation-findings";

export interface ValidateArtifactResult {
  ok: boolean;
  message: string;
}

const ARTIFACT_DISPATCH: Array<{
  pattern: RegExp;
  validator: (filePath: string, ...args: string[]) => string[];
  argFiles?: string[];
}> = [
  { pattern: /prd\.md$/, validator: (f: string) => validatePrdArtifact(f) },
  { pattern: /execution_contract\.md$/, validator: (f: string) => validateRulesArtifact(f) },
  { pattern: /research_facts\.md$/, validator: (f: string, prdPath?: string) => validateResearchFacts(f, prdPath) },
  { pattern: /design\.md$/, validator: (f: string, prdPath?: string, researchPath?: string) => {
    const opts: { prdPath?: string; researchPath?: string } = {};
    if (prdPath && fs.existsSync(prdPath)) opts.prdPath = prdPath;
    if (researchPath && fs.existsSync(researchPath)) opts.researchPath = researchPath;
    return validateDesign(f, opts);
  }},
  { pattern: /iteration_plan\.md$/, validator: (f: string) => validatePlanArtifact(f) },
  { pattern: /validation_findings\.md$/, validator: (f: string) => {
    const result = parseValidationFindingsArtifact(f);
    return result.issues.map(issue => issue.message);
  }},
];

export function validateArtifact(filePath: string): ValidateArtifactResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const fileName = filePath.split("/").pop() ?? filePath;
  const dispatch = ARTIFACT_DISPATCH.find(d => d.pattern.test(fileName));

  if (!dispatch) {
    return {
      ok: false,
      message: `Unknown artifact type: ${fileName}. Supported types: prd.md, execution_contract.md, research_facts.md, design.md, iteration_plan.md, validation_findings.md.`
    };
  }

  const dirName = path.dirname(filePath);
  const parentDir = path.basename(dirName);
  const changeRoot = parentDir === "architecture" ? path.dirname(dirName) : dirName;
  const prdPath = path.join(changeRoot, "prd.md");
  const researchPath = path.join(changeRoot, "research_facts.md");
  const issues = dispatch.validator(filePath, prdPath, researchPath);

  if (issues.length === 0) {
    return { ok: true, message: `${fileName}: validation passed.` };
  }

  const issueLines = issues.map((issue, i) => `  ${i + 1}. ${issue}`).join("\n");
  return {
    ok: false,
    message: `${fileName}: validation failed (${issues.length} issue${issues.length > 1 ? "s" : ""}):\n${issueLines}`
  };
}
