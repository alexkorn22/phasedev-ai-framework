import * as fs from "fs";

function stripInlineComment(value: string): string {
  let quote: string | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if ((char === "\"" || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
    }
    if (char === "#" && quote === null && /\s/.test(value[index - 1] ?? "")) {
      return value.slice(0, index).trimEnd();
    }
  }

  return value;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;

  const quote = trimmed[0];
  if ((quote !== "\"" && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
    return stripInlineComment(trimmed).trim();
  }

  const inner = trimmed.slice(1, -1);
  if (quote === "'") {
    return inner;
  }

  return inner
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}

export function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
    const separatorIndex = assignment.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = assignment.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values[key] = unquote(assignment.slice(separatorIndex + 1));
  }

  return values;
}
