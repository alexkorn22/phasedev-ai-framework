import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { Phase } from "../phase/types";
import { SYSTEM_DIR } from "../change/paths";
import { BlockingSeverity, BLOCKING_SEVERITY_VALUES } from "../validation-findings/blocking-severity";

export type PhaseSkillConfig = {
  routers: string[];
  main: string[];
  additional: string[];
};

export type PhaseConfig = {
  skills: PhaseSkillConfig;
};

export interface Config {
  phases: Partial<Record<Exclude<Phase, "init">, PhaseConfig>>;
  autoApprove: boolean;
  blockingSeverity: BlockingSeverity;
  requireIterationCommit: boolean;
}

export const EMPTY_PHASE_SKILLS: PhaseSkillConfig = {
  routers: [],
  main: [],
  additional: []
};

export const DEFAULT_CONFIG: Config = {
  phases: {},
  autoApprove: false,
  blockingSeverity: "must_fix",
  requireIterationCommit: true
};

const KNOWN_ROOT_KEYS = new Set(["phases", "autoApprove", "blockingSeverity", "requireIterationCommit"]);

// Only phases that actually exist in the Phase union type
const PHASES = new Set<Exclude<Phase, "init">>([
  "change_intake",
  "code_research",
  "technical_design",
  "iteration_planning",
  "implementation",
  "iteration_validation",
  "final_validation",
  "finding_repair",
  "archive"
]);

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

function readSkillArray(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Config key ${key} must be an array of non-empty strings.`);
  }

  const seen = new Set<string>();
  const skills: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const item = value[index];
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`Config key ${key}[${index}] must be a non-empty string.`);
    }

    const skill = item.trim();
    if (!seen.has(skill)) {
      seen.add(skill);
      skills.push(skill);
    }
  }

  return skills;
}

function parsePhaseSkills(value: unknown, key: string): PhaseSkillConfig {
  const skills = asRecord(value, key);
  const routers = readSkillArray(skills.routers, `${key}.routers`);
  const routerSet = new Set(routers);
  const rawMain = readSkillArray(skills.main, `${key}.main`);
  const main = rawMain.filter(skill => {
    if (routerSet.has(skill)) {
      console.warn(`[config] Skill "${skill}" in ${key}.main is already listed in ${key}.routers. Dropping duplicate from main.`);
      return false;
    }
    return true;
  });
  const mainSet = new Set(main);
  const rawAdditional = readSkillArray(skills.additional, `${key}.additional`);
  const additional = rawAdditional.filter(skill => {
    if (routerSet.has(skill) || mainSet.has(skill)) {
      console.warn(`[config] Skill "${skill}" in ${key}.additional is already listed in ${key}.routers or ${key}.main. Dropping duplicate from additional.`);
      return false;
    }
    return true;
  });

  return { routers, main, additional };
}

function parsePhaseConfig(value: unknown, key: string): PhaseConfig {
  const phase = asRecord(value, key);
  return {
    skills: parsePhaseSkills(phase.skills, `${key}.skills`)
  };
}

function validPhaseNamesList(): string {
  return Array.from(PHASES).sort().join(", ");
}

/**
 * Parse the phases section of a config file. Unknown phase names are
 * warned about and skipped so a stale/unrecognized entry never blocks the flow.
 */
function parsePhasesSection(phasesRaw: Record<string, unknown>): Partial<Record<Exclude<Phase, "init">, PhaseConfig>> {
  const phases: Partial<Record<Exclude<Phase, "init">, PhaseConfig>> = {};

  for (const [phaseName, value] of Object.entries(phasesRaw)) {
    if (!PHASES.has(phaseName as Exclude<Phase, "init">)) {
      console.warn(`[config] Unknown phase "${phaseName}" in phases section — ignored. Valid phases: ${validPhaseNamesList()}.`);
      continue;
    }

    phases[phaseName as Exclude<Phase, "init">] = parsePhaseConfig(value, `phases.${phaseName}`);
  }

  return phases;
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
    phases: parsePhasesSection(asRecord(root.phases, "phases")),
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

export function getPhaseSkillConfig(config: Config, phase: Phase): PhaseSkillConfig {
  if (phase === "init") {
    return EMPTY_PHASE_SKILLS;
  }

  return config.phases[phase]?.skills ?? EMPTY_PHASE_SKILLS;
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
