import { renderTemplate } from "../../shared/templates/render-template";
import { buildApprovalFrontmatter } from "../../shared/markdown/approval-frontmatter";

export interface ArtifactContractOptions {
  artifactId: string;
  resolvedOutputPath: string;
  templateName: string;
  templateContent?: string;
  selfCheckCommand: string;
  selfCheckFailureGuidance?: string;
  includeSelfCheck?: boolean;
  blockedFinalArtifactContent?: string[];
  canonicalFillRules?: string[];
  date: string;
}

export function renderArtifactContract(options: ArtifactContractOptions): string {
  const templateContent = options.templateContent ?? renderTemplate(options.templateName, {
    date: options.date,
    approval_frontmatter: buildApprovalFrontmatter(options.date)
  });
  const hasYamlFrontmatter = templateContent.trimStart().startsWith("---\n");

  const contract = [
    `## Artifact Build Contract: ${options.artifactId}`,
    "",
    `- Artifact ID: \`${options.artifactId}\``,
    `- Output path: \`${options.resolvedOutputPath}\``,
    "- Write the artifact exactly at the Output path above (see the Path resolution rule for how to read artifact names and template/allowlist paths).",
    "- Template source: embedded below. Do not open framework template files.",
    "- Structure source: the embedded template is the only artifact structure. Fill that template; do not invent parallel markdown structure.",
    "",
    "Full template content:",
    "",
    "```markdown",
    templateContent.trimEnd(),
    "```",
    "",
    "Canonical fill rules:",
    ...(hasYamlFrontmatter ? ["- Preserve YAML frontmatter keys exactly; change only allowed values."] : []),
    "- Preserve heading order, table headers, machine-readable statuses, checkbox syntax, and markdown table syntax.",
    "- External skill output structure is never artifact structure.",
    "- Do not copy skill report headings, sections, tables, or lifecycle blocks unless this template already contains that exact structure.",
    "- Convert skill results only into existing template fields or rows.",
    "- If useful skill material cannot be mapped into this template, put it in the final response or report a blocker instead of adding artifact structure.",
    "- Use HTML comments as authoring guidance only.",
    "- Remove every HTML comment from the final artifact file.",
    "- Do not leave placeholder-like prose such as `TBD`, `TODO`, `unknown`, `clarify later`, or `to be decided`.",
    ...(options.canonicalFillRules ?? [])
  ];

  if (options.blockedFinalArtifactContent?.length) {
    contract.push(
      "- Replace every embedded template example row and example value with real phase-specific content.",
      `- The final artifact must not contain these embedded template sample values: ${options.blockedFinalArtifactContent.map(value => `\`${value}\``).join(", ")}.`
    );
  }

  if (options.includeSelfCheck ?? true) {
    contract.push(
      "",
      "Self-check command:",
      "",
      "```bash",
      options.selfCheckCommand,
      "```",
      "",
      options.selfCheckFailureGuidance ??
        "Artifact contract check must pass before reporting this phase complete. If it fails, fix only structural or content issues in this artifact for the current phase and rerun the same command."
    );
  }

  return contract.join("\n");
}
