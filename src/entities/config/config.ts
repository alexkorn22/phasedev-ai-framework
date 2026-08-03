import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { SYSTEM_DIR } from "../change/paths";
import { BlockingSeverity, BLOCKING_SEVERITY_VALUES } from "../validation-findings/blocking-severity";
import { parseRoles, RoleConfig } from "../role/role";

export interface Config {
  roles: RoleConfig[];
  autoApprove: boolean;
  blockingSeverity: BlockingSeverity;
  requireIterationCommit: boolean;
}

export const DEFAULT_CONFIG: Config = {
  roles: [],
  autoApprove: false,
  blockingSeverity: "must_fix",
  requireIterationCommit: true
};

const KNOWN_ROOT_KEYS = new Set(["roles", "autoApprove", "blockingSeverity", "requireIterationCommit"]);

export function defaultConfigPath(): string {
  return path.resolve(__dirname, "..", "..", "..", "config.yaml");
}

export function projectConfigPath(projectPath: string): string {
  return path.join(path.resolve(projectPath), SYSTEM_DIR, "config.yaml");
}

export function resolveConfigPath(projectPath: string, explicitConfigPath?: string): string {
  if (explicitConfigPath) {
    return path.resolve(explicitConfigPath);
  }

  const projectConfig = projectConfigPath(projectPath);
  if (fs.existsSync(projectConfig)) {
    return projectConfig;
  }

  return defaultConfigPath();
}

function asRecord(value: unknown, key: string): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Config key ${key} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readBoolean(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`Config key ${key} must be true or false.`);
  }
  return value;
}

function readBlockingSeverity(value: unknown, fallback: BlockingSeverity, key: string): BlockingSeverity {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !BLOCKING_SEVERITY_VALUES.includes(value as BlockingSeverity)) {
    throw new Error(`Config key ${key} must be one of: ${BLOCKING_SEVERITY_VALUES.join(", ")}.`);
  }
  return value as BlockingSeverity;
}

export function parseConfig(content: string): Config {
  const parsed = parseYaml(content) ?? {};
  const root = asRecord(parsed, "root");

  for (const key of Object.keys(root)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      console.warn(`[config] Key "${key}" is no longer supported — remove it from config.yaml.`);
    }
  }

  return {
    roles: parseRoles(root.roles, "roles"),
    autoApprove: readBoolean(root.autoApprove, DEFAULT_CONFIG.autoApprove, "autoApprove"),
    blockingSeverity: readBlockingSeverity(root.blockingSeverity, DEFAULT_CONFIG.blockingSeverity, "blockingSeverity"),
    requireIterationCommit: readBoolean(root.requireIterationCommit, DEFAULT_CONFIG.requireIterationCommit, "requireIterationCommit")
  };
}

export function loadConfig(configPath = defaultConfigPath()): Config {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  return parseConfig(fs.readFileSync(configPath, "utf-8"));
}

function getDeepValue(obj: Record<string, unknown>, segments: string[]): unknown | undefined {
  let current: unknown = obj;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

export function getConfigValue(config: Config, key: string): unknown | undefined {
  const segments = key.split(".").filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  return getDeepValue(config as unknown as Record<string, unknown>, segments);
}
