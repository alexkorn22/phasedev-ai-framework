import * as fs from "fs";
import * as path from "path";

const templatesDir = path.resolve(__dirname, "..", "..", "..", "templates");

export function resolveTemplatePath(templateName: string): string {
  return path.join(templatesDir, `${templateName}.md`);
}

export function renderTemplate(templateName: string, variables: Record<string, string>): string {
  const templatePath = resolveTemplatePath(templateName);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  let content = fs.readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    content = content.replace(placeholder, value);
  }

  const unresolved = Array.from(content.matchAll(/{{\s*([^}]+?)\s*}}/g)).map(match => match[1].trim());
  if (unresolved.length > 0) {
    throw new Error(`Template ${templateName}.md has unresolved placeholder(s): ${Array.from(new Set(unresolved)).join(", ")}.`);
  }

  return content;
}
