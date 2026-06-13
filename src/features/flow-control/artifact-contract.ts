import { renderTemplate, resolveTemplatePath } from "../../shared/templates/render-template";

export interface ArtifactContractOptions {
  artifactId: string;
  resolvedOutputPath: string;
  templateName: string;
  templateContent?: string;
  selfCheckCommand: string;
  date: string;
}

export function renderArtifactContract(options: ArtifactContractOptions): string {
  const templatePath = resolveTemplatePath(options.templateName);
  const templateContent = options.templateContent ?? renderTemplate(options.templateName, {
    date: options.date
  });

  return [
    `## Artifact Build Contract: ${options.artifactId}`,
    "",
    `- Artifact ID: \`${options.artifactId}\``,
    `- Output path: \`${options.resolvedOutputPath}\``,
    `- Template source: \`${templatePath}\``,
    "- Strict rule: template is the only output structure. Fill this template; do not invent a parallel markdown structure.",
    "",
    "Full template content:",
    "",
    "```markdown",
    templateContent.trimEnd(),
    "```",
    "",
    "Strict fill rules:",
    "- Preserve YAML frontmatter keys exactly; change only allowed values.",
    "- Preserve heading order, table headers, machine-readable statuses, checkbox syntax, and markdown table syntax.",
    "- Use HTML comments as authoring guidance only.",
    "- Remove every HTML comment from the final artifact file.",
    "- Do not leave placeholder-like prose such as `TBD`, `TODO`, `unknown`, `clarify later`, or `to be decided`.",
    "",
    "Self-check command:",
    "",
    "```bash",
    options.selfCheckCommand,
    "```",
    "",
    "Stage is not complete until this command passes. If it fails, fix only structural or content issues in this artifact for the current stage and rerun the same command."
  ].join("\n");
}
