import * as fs from "fs";
import * as path from "path";
import { resolveRoute } from "../stage-control/flow-route";

const AUTO_APPROVED_BY = "PhaseDev Runner";

export interface AutoApproveResult {
  approved: boolean;
  advanced: boolean;
  message?: string;
  reason?: string;
}

function quoteYamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function updateApprovalFrontmatter(filePath: string): void {
  const content = fs.readFileSync(filePath, "utf-8");
  const frontmatterMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!frontmatterMatch) {
    throw new Error(`Cannot auto-approve artifact without YAML frontmatter: ${filePath}`);
  }

  const [, prefix, yamlBody, suffix] = frontmatterMatch;
  const eol = yamlBody.includes("\r\n") ? "\r\n" : "\n";
  const lines = yamlBody.split(/\r?\n/);
  let approvedIndex = -1;
  let hasApprovedBy = false;

  const updatedLines = lines.map((line, index) => {
    if (/^\s*approved\s*:/.test(line)) {
      approvedIndex = index;
      return "approved: true";
    }
    if (/^\s*approved_by\s*:/.test(line)) {
      hasApprovedBy = true;
      return `approved_by: ${quoteYamlString(AUTO_APPROVED_BY)}`;
    }
    return line;
  });

  if (approvedIndex === -1) {
    updatedLines.unshift("approved: true");
    approvedIndex = 0;
  }
  if (!hasApprovedBy) {
    updatedLines.splice(approvedIndex + 1, 0, `approved_by: ${quoteYamlString(AUTO_APPROVED_BY)}`);
  }

  const rest = content.slice(frontmatterMatch[0].length);
  fs.writeFileSync(filePath, `${prefix}${updatedLines.join(eol)}${suffix}${rest}`, "utf-8");
}

function formatFiles(projectPath: string, files: string[]): string {
  return files
    .map(filePath => path.relative(projectPath, filePath).replace(/\\/g, "/"))
    .join(", ");
}

export function autoApproveCurrentRoute(projectPath: string): AutoApproveResult {
  const route = resolveRoute(projectPath);
  let label: string;
  let files: string[];

  if (route.kind === "change_intake_approval") {
    label = "setup artifacts";
    files = [route.paths.prdPath, route.paths.executionContractPath];
  } else if (route.kind === "technical_design_approval") {
    label = "design artifact";
    files = [route.paths.designPath];
  } else if (route.kind === "iteration_planning_approval") {
    label = "plan artifact";
    files = [route.paths.iterationPlanPath];
  } else {
    return { approved: false, advanced: false };
  }

  for (const filePath of files) {
    updateApprovalFrontmatter(filePath);
  }

  const nextRoute = resolveRoute(projectPath);
  const advanced = nextRoute.kind !== route.kind;
  return {
    approved: true,
    advanced,
    message: `[PHASEDEV RUNNER] auto-approved ${label}: ${formatFiles(projectPath, files)}`,
    reason: advanced
      ? undefined
      : `AutoApprove could not advance route '${route.kind}' after updating ${formatFiles(projectPath, files)}.`
  };
}
