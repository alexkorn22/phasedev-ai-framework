import * as fs from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export interface SetConfigResult {
  ok: boolean;
  message: string;
  storedValue?: unknown;
  storedType?: string;
}

export interface SetConfigOptions {
  /** Force the raw value to be stored as a string, skipping type coercion. */
  forceString?: boolean;
}

/**
 * Validate parsed value against the expected type for known config leaf keys.
 * Returns an error message or null if valid.
 */
function validateLeafValue(leafKey: string, value: unknown): string | null {
  if (leafKey === "maxIterations" || leafKey === "maxRepairCycles") {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return `Config key \`${leafKey}\` must be a positive integer.`;
    }
  }
  if (leafKey === "runArchiveStage" || leafKey === "autoApprove") {
    if (typeof value !== "boolean") {
      return `Config key \`${leafKey}\` must be true or false.`;
    }
  }
  return null;
}

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

function typeLabel(value: unknown): string {
  return Array.isArray(value) ? "array" : typeof value;
}

function parseValue(raw: string, key: string, forceString: boolean): unknown {
  if (forceString) return raw;

  const isSkillArrayKey = /\.skills\.(routers|main|additional)$/.test(key);
  if (isSkillArrayKey) {
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (raw.toLowerCase() === "true") return true;
  if (raw.toLowerCase() === "false") return false;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);
  if (/^\d+\.\d+$/.test(raw)) return Number.parseFloat(raw);
  // No generic comma-to-array coercion: only the skill keys above are lists.
  // A free-text value like "fix, then test" must stay a string.
  return raw;
}

export function setConfigValue(configPath: string, key: string, rawValue: string, options: SetConfigOptions = {}): SetConfigResult {
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

  const value = parseValue(rawValue, key, options.forceString ?? false);
  const segments = key.split(".").filter(Boolean);

  if (segments.length === 0) {
    return { ok: false, message: "Key is required." };
  }

  // Reject prototype-pollution segments
  const dangerous = segments.find(segment => FORBIDDEN_SEGMENTS.has(segment));
  if (dangerous) {
    return { ok: false, message: `Config key segment \`${dangerous}\` is not allowed (prototype pollution).` };
  }

  // Validate typed leaf keys before writing
  const leafKey = segments[segments.length - 1];
  const validationError = validateLeafValue(leafKey, value);
  if (validationError) {
    return { ok: false, message: validationError };
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
  writeFileAtomic(configPath, newContent);

  const storedType = typeLabel(value);
  return {
    ok: true,
    message: `Config key \`${key}\` set to \`${rawValue}\` (${storedType}).`,
    storedValue: value,
    storedType
  };
}
