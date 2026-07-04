import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";

export interface SchemaSection {
  required: boolean;
}

export interface ArtifactSchema {
  artifact: string;
  mode: "partial" | "full";
  sections: Record<string, SchemaSection>;
}

const SCHEMAS_DIR = path.resolve(__dirname, "..", "..", "..", "templates", "schemas");

/**
 * Load an artifact schema from templates/schemas/<name>.schema.yaml.
 * Returns null if no schema file exists (artifact uses strict validation).
 */
export function loadSchema(name: string): ArtifactSchema | null {
  const schemaPath = path.join(SCHEMAS_DIR, `${name}.schema.yaml`);
  if (!fs.existsSync(schemaPath)) return null;

  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(schemaPath, "utf-8"));
  } catch {
    return null; // malformed YAML — degrade gracefully
  }
  if (typeof raw !== "object" || raw === null) return null;

  const artifact = (raw as Record<string, unknown>).artifact;
  const mode = (raw as Record<string, unknown>).mode;
  const sectionsRaw = (raw as Record<string, unknown>).sections;

  if (typeof artifact !== "string") return null;
  if (mode !== "partial" && mode !== "full") return null;
  if (typeof sectionsRaw !== "object" || sectionsRaw === null) return null;

  const sections: Record<string, SchemaSection> = {};
  for (const [key, value] of Object.entries(sectionsRaw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const sec = value as Record<string, unknown>;
    sections[key] = {
      required: sec.required === true
    };
  }

  return { artifact, mode, sections };
}

/**
 * Validate that artifact content contains all required sections according to the schema.
 *
 * @param content - Full artifact markdown content
 * @param schema - Loaded schema
 * @param mode - "partial" (optional sections may be absent) or "full" (all sections required)
 * @returns List of issues (empty = valid)
 */
export function validateSchemaSections(
  content: string,
  schema: ArtifactSchema,
  mode: "partial" | "full"
): string[] {
  const issues: string[] = [];

  for (const [sectionName, sectionDef] of Object.entries(schema.sections)) {
    const isRequired = mode === "full" ? true : sectionDef.required;
    const headingPattern = new RegExp(`^##\\s+${escapeRegex(sectionName)}\\s*$`, "mi");
    const sectionExists = headingPattern.test(content);

    if (isRequired && !sectionExists) {
      issues.push(`Missing required section: "${sectionName}".`);
    }
  }

  return issues;
}

/**
 * Escape special regex characters for safe use in RegExp.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
