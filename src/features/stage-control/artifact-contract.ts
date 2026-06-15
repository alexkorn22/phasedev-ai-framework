import { renderTemplate } from "../../shared/templates/render-template";

export interface ArtifactContractOptions {
  artifactId: string;
  resolvedOutputPath: string;
  templateName: string;
  templateContent?: string;
  selfCheckCommand: string;
  selfCheckFailureGuidance?: string;
  includeSelfCheck?: boolean;
  date: string;
}

export function renderArtifactContract(options: ArtifactContractOptions): string {
  const templateContent = options.templateContent ?? renderTemplate(options.templateName, {
    date: options.date
  });

  const contract = [
    `## Artifact Build Contract: ${options.artifactId}`,
    "",
    `- Artifact ID: \`${options.artifactId}\``,
    `- Output path: \`${options.resolvedOutputPath}\``,
    "- Write the artifact exactly at the Output path above. Do not reinterpret the Artifact ID, template comments, package map rows, or allowlist entries as project-root filesystem paths.",
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
    "- Preserve YAML frontmatter keys exactly; change only allowed values.",
    "- Preserve heading order, table headers, machine-readable statuses, checkbox syntax, and markdown table syntax.",
    "- External skill output structure is never artifact structure.",
    "- Do not copy skill report headings, sections, tables, or lifecycle blocks unless this template already contains that exact structure.",
    "- Convert skill results only into existing template fields or rows.",
    "- If useful skill material cannot be mapped into this template, put it in the final response or report a blocker instead of adding artifact structure.",
    "- Use HTML comments as authoring guidance only.",
    "- Remove every HTML comment from the final artifact file.",
    "- Do not leave placeholder-like prose such as `TBD`, `TODO`, `unknown`, `clarify later`, or `to be decided`."
  ];

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
        "Stage is not complete until this command passes. If it fails, fix only structural or content issues in this artifact for the current stage and rerun the same command."
    );
  }

  return contract.join("\n");
}
