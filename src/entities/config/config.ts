import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { Phase } from "../phase/types";
import { SYSTEM_DIR } from "../change/paths";

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
  runArchiveStage: boolean;
  autoApprove: boolean;
  maxIterations: number;
}

export const EMPTY_PHASE_SKILLS: PhaseSkillConfig = {
  routers: [],
  main: [],
  additional: []
};

export const DEFAULT_CONFIG: Config = {
  phases: {},
  runArchiveStage: true,
  autoApprove: false,
  maxIterations: 10
};

const PHASE_NAME_MAP: Record<string, string> = {
  setup: "change_intake",
  setup_approval: "change_intake_approval",
  research: "code_research",
  invalid_research: "invalid_code_research",
  design: "technical_design",
  invalid_design: "invalid_technical_design",
  plan: "iteration_planning",
  invalid_plan: "invalid_iteration_planning",
  plan_approval: "iteration_planning_approval",
  phase_validation: "iteration_validation",
  repair: "finding_repair",
  implementation: "implementation",
  final_validation: "final_validation",
  archive: "archive"
};

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

function readPositiveInteger(value: unknown, fallback: number, key: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Config key ${key} must be a positive integer.`);
  }
  return value;
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

/**
 * Parse legacy codex.stages format and map to phases.
 */
function parseLegacyCodexStages(codexRaw: Record<string, unknown>): Partial<Record<Exclude<Phase, "init">, PhaseConfig>> {
  const phases: Partial<Record<Exclude<Phase, "init">, PhaseConfig>> = {};
  const rawStages = asRecord(codexRaw.stages, "codex.stages");

  for (const [oldName, value] of Object.entries(rawStages)) {
    const newName = PHASE_NAME_MAP[oldName];
    if (!newName) {
      console.warn(`[config] Unknown legacy stage "${oldName}" in codex.stages. Skipping.`);
      continue;
    }

    if (!PHASES.has(newName as Exclude<Phase, "init">)) {
      console.warn(`[config] Legacy stage "${oldName}" maps to "${newName}", which is not yet a valid phase. Skipping.`);
      continue;
    }

    const stage = asRecord(value, `codex.stages.${oldName}`);

    if (stage.model !== undefined || stage.reasoningEffort !== undefined) {
      console.warn(`[config] Legacy stage "${oldName}" has per-stage model/reasoningEffort override. These are no longer supported per stage and will be ignored.`);
    }

    phases[newName as Exclude<Phase, "init">] = parsePhaseConfig(value, `codex.stages.${oldName}`);
  }

  return phases;
}

function validPhaseNamesList(): string {
  return Array.from(PHASES).sort().join(", ");
}

/**
 * Parse the phases section of a config file.
 */
function parsePhasesSection(phasesRaw: Record<string, unknown>): Partial<Record<Exclude<Phase, "init">, PhaseConfig>> {
  const phases: Partial<Record<Exclude<Phase, "init">, PhaseConfig>> = {};

  for (const [phaseName, value] of Object.entries(phasesRaw)) {
    if (!PHASES.has(phaseName as Exclude<Phase, "init">)) {
      throw new Error(
        `[config] Unknown phase "${phaseName}" in phases section. Valid phase names: ${validPhaseNamesList()}.`
      );
    }

    phases[phaseName as Exclude<Phase, "init">] = parsePhaseConfig(value, `phases.${phaseName}`);
  }

  return phases;
}

/**
 * Parse the legacy stages: section (alias for phases:).
 * Emits a deprecation warning.
 */
function parseLegacyStagesSection(stagesRaw: Record<string, unknown>): Partial<Record<Exclude<Phase, "init">, PhaseConfig>> {
  console.warn("[config] Deprecated 'stages:' key — use 'phases:' instead.");
  const phases: Partial<Record<Exclude<Phase, "init">, PhaseConfig>> = {};

  for (const [stageName, value] of Object.entries(stagesRaw)) {
    // Accept both new phase names and legacy stage names (like codex.stages
    // does): a genuinely legacy config uses names such as "plan" or "setup".
    const phaseName = PHASES.has(stageName as Exclude<Phase, "init">)
      ? stageName
      : PHASE_NAME_MAP[stageName];

    if (!phaseName || !PHASES.has(phaseName as Exclude<Phase, "init">)) {
      throw new Error(
        `[config] Unknown stage "${stageName}" in legacy stages section. Valid phase names: ${validPhaseNamesList()}.`
      );
    }

    phases[phaseName as Exclude<Phase, "init">] = parsePhaseConfig(value, `stages.${stageName}`);
  }

  return phases;
}

export function parseConfig(content: string): Config {
  const parsed = parseYaml(content) ?? {};
  const root = asRecord(parsed, "root");

  const phasesRaw = asRecord(root.phases, "phases");
  const stagesRaw = asRecord(root.stages, "stages");
  const codexRaw = asRecord(root.codex, "codex");

  const hasPhases = Object.keys(phasesRaw).length > 0;
  const hasLegacyStages = Object.keys(asRecord(codexRaw.stages, "codex.stages")).length > 0;
  const hasStages = Object.keys(stagesRaw).length > 0;

  let phases: Partial<Record<Exclude<Phase, "init">, PhaseConfig>> = {};

  // Priority: phases: > stages: > codex.stages:
  if (hasLegacyStages && (hasPhases || hasStages)) {
    console.warn("[config] 'codex.stages:' is ignored because a 'phases:'/'stages:' section is present.");
  }
  if (hasPhases && hasStages) {
    console.warn("[config] Both 'phases:' and 'stages:' found. 'phases:' takes precedence.");
    phases = parsePhasesSection(phasesRaw);
  } else if (hasPhases) {
    phases = parsePhasesSection(phasesRaw);
  } else if (hasStages) {
    phases = parseLegacyStagesSection(stagesRaw);
  } else if (hasLegacyStages) {
    console.warn("[config] Deprecated codex.stages format detected. Please migrate to the new 'phases:' format. See config.yaml for reference.");
    phases = parseLegacyCodexStages(codexRaw);
  }

  return {
    phases,
    runArchiveStage: readBoolean(root.runArchiveStage, DEFAULT_CONFIG.runArchiveStage, "runArchiveStage"),
    autoApprove: readBoolean(root.autoApprove, DEFAULT_CONFIG.autoApprove, "autoApprove"),
    maxIterations: readPositiveInteger(root.maxIterations, DEFAULT_CONFIG.maxIterations, "maxIterations")
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

export function resolveProjectLogDir(projectPath: string, logDir: string): string {
  if (path.isAbsolute(logDir)) {
    throw new Error("loop.logDir must be relative to projectPath.");
  }

  const resolved = path.resolve(projectPath, logDir);
  const projectRoot = path.resolve(projectPath);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error("loop.logDir must stay inside projectPath.");
  }

  return resolved;
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

  // Legacy: codex.stages.<oldName>.<rest> → phases.<newName>.<rest>
  if (segments.length >= 3 && segments[0] === "codex" && segments[1] === "stages") {
    const oldName = segments[2];
    const rest = segments.slice(3);
    const newName = PHASE_NAME_MAP[oldName];
    if (newName && PHASES.has(newName as Exclude<Phase, "init">)) {
      const mappedSegments = ["phases", newName, ...rest];
      console.warn(`[config] Deprecated key "${key}" — use "${mappedSegments.join(".")}" instead.`);
      return getDeepValue(config as unknown as Record<string, unknown>, mappedSegments);
    }
    console.warn(`[config] Deprecated key "${key}" — unknown legacy stage "${oldName}".`);
    return undefined;
  }

  // Legacy: stages.<name>.<rest> → phases.<newName>.<rest>
  if (segments[0] === "stages") {
    const oldName = segments[1];
    const newName = PHASE_NAME_MAP[oldName] ?? oldName;
    const mappedSegments = ["phases", newName, ...segments.slice(2)];
    console.warn(`[config] Deprecated key "${key}" — use "${mappedSegments.join(".")}" instead.`);
    return getDeepValue(config as unknown as Record<string, unknown>, mappedSegments);
  }

  // Legacy: loop.* runner fields
  if (segments[0] === "loop") {
    if (segments[1] === "runArchiveStage") {
      console.warn(`[config] Deprecated key "${key}" — use "runArchiveStage" at root level instead.`);
      return config.runArchiveStage;
    }
    if (segments[1] === "autoApprove") {
      console.warn(`[config] Deprecated key "${key}" — use "autoApprove" at root level instead.`);
      return config.autoApprove;
    }
    if (segments[1] === "maxIterations") {
      console.warn(`[config] Deprecated key "${key}" — use "maxIterations" at root level instead.`);
      return config.maxIterations;
    }
  }

  return getDeepValue(config as unknown as Record<string, unknown>, segments);
}
