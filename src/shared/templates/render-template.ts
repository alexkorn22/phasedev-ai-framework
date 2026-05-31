import * as fs from "fs";
import * as path from "path";

export function renderTemplate(templateName: string, variables: Record<string, string>): string {
  const templatesDir = path.resolve(__dirname, "..", "..", "..", "templates");
  const templatePath = path.join(templatesDir, `${templateName}.md`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  let content = fs.readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    content = content.replace(placeholder, value);
  }

  return content;
}
