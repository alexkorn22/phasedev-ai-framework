import * as fs from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface SetConfigResult {
  ok: boolean;
  message: string;
}

function parseValue(raw: string): unknown {
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^\d+\.\d+$/.test(raw)) return Number.parseFloat(raw);
  if (raw.includes(",")) {
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }
  return raw;
}

export function setConfigValue(configPath: string, key: string, rawValue: string): SetConfigResult {
  if (!fs.existsSync(configPath)) {
    return { ok: false, message: `Config file not found: ${configPath}` };
  }

  const content = fs.readFileSync(configPath, "utf-8");
  let parsed: Record<string, unknown>;

  try {
    parsed = parseYaml(content) as Record<string, unknown> ?? {};
  } catch (e) {
    return { ok: false, message: `Failed to parse config: ${e instanceof Error ? e.message : String(e)}` };
  }

  const value = parseValue(rawValue);
  const segments = key.split(".").filter(Boolean);

  if (segments.length === 0) {
    return { ok: false, message: "Key is required." };
  }

  // Navigate/create nested structure
  let current: Record<string, unknown> = parsed;

  // Handle root-level key (no "root." prefix in the saved YAML)
  // The parsed YAML might have a root key, or the segments might directly reference keys
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (typeof current[segment] !== "object" || current[segment] === null) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  const lastSegment = segments[segments.length - 1];
  current[lastSegment] = value;

  // Write back with YAML formatting
  const newContent = stringifyYaml(parsed, {
    lineWidth: 120
  });
  fs.writeFileSync(configPath, newContent, "utf-8");

  return {
    ok: true,
    message: `Config key \`${key}\` set to \`${rawValue}\`.`
  };
}
