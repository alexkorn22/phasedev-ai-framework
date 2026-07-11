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

  const content = fs.readFileSync(templatePath, "utf-8");
  const placeholderPattern = /{{\s*([^}]+?)\s*}}/g;

  // Validate against the raw template BEFORE substitution: substituted content
  // (plan excerpts, findings text) may legitimately contain {{...}} snippets
  // and must never be treated as unresolved placeholders.
  const unresolved = Array.from(content.matchAll(placeholderPattern))
    .map(match => match[1].trim())
    .filter(key => !Object.prototype.hasOwnProperty.call(variables, key));
  if (unresolved.length > 0) {
    throw new Error(`Template ${templateName}.md has unresolved placeholder(s): ${Array.from(new Set(unresolved)).join(", ")}.`);
  }

  return content.replace(placeholderPattern, (_match, key, offset: number) => {
    const value = variables[key.trim()];
    const lineStart = content.lastIndexOf("\n", offset - 1) + 1;
    return indentContinuationLines(value, content.slice(lineStart, offset));
  });
}

// A multi-line value substituted into a list item must keep its continuation
// lines inside that item: markdown treats flush-left continuation lines as
// leaving the list. Indent them to the item's content column; values on
// flush-left lines (e.g. inside ```text blocks) stay untouched.
function indentContinuationLines(value: string, linePrefix: string): string {
  if (!value.includes("\n")) {
    return value;
  }
  const listMarker = linePrefix.match(/^\s*(?:[-*+]|\d+[.)])\s+/);
  const indentWidth = listMarker ? listMarker[0].length : /^\s+$/.test(linePrefix) ? linePrefix.length : 0;
  if (indentWidth === 0) {
    return value;
  }
  return value.split("\n").join(`\n${" ".repeat(indentWidth)}`);
}
