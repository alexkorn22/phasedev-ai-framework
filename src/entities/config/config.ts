import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { Stage } from "../stage/types";
import { SYSTEM_DIR } from "../change/paths";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type SandboxMode = "workspace-write" | "danger-full-access";
export type ApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";

export type StageSkillConfig = {
  routers: string[];
  main: string[];
  additional: string[];
};

export type StageConfig = {
  skills: StageSkillConfig;
};

export interface Config {
  stages: Partial<Record<Exclude<Stage, "init">, StageConfig>>;
  runArchiveStage: boolean;
  autoApprove: boolean;
  maxIterations: number;
}

export const EMPTY_STAGE_SKILLS: StageSkillConfig = {
  routers: [],
  main: [],
  additional: []
};

export const DEFAULT_CONFIG: Config = {
  stages: {},
  runArchiveStage: true,
  autoApprove: false,
  maxIterations: 10
};

const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const SANDBOX_MODES = new Set(["workspace-write", "danger-full-access"]);
const APPROVAL_POLICIES = new Set(["never", "on-request", "on-failure", "untrusted"]);

const STAGE_NAME_MAP: Record<string, string> = {
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

// Only stages that actually exist in the Stage union type
const STAGES = new Set<Exclude<Stage, "init">>([
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

function readString(value: unknown, fallback: string, key: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Config key ${key} must be a non-empty string.`);
  }
  return value;
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

function readEnum<T extends string>(value: unknown, fallback: T, key: string, allowed: Set<string>): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Config key ${key} must be one of: ${Array.from(allowed).join(", ")}.`);
  }
  return value as T;
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

function parseStageSkills(value: unknown, key: string): StageSkillConfig {
  const skills = asRecord(value, key);
  const routers = readSkillArray(skills.routers, `${key}.routers`);
  const routerSet = new Set(routers);
  const main = readSkillArray(skills.main, `${key}.main`).filter(skill => !routerSet.has(skill));
  const mainSet = new Set(main);
  const additional = readSkillArray(skills.additional, `${key}.additional`).filter(skill => !routerSet.has(skill) && !mainSet.has(skill));

  return { routers, main, additional };
}

function parseStageConfig(value: unknown, key: string): StageConfig {
  const stage = asRecord(value, key);
  return {
    skills: parseStageSkills(stage.skills, `${key}.skills`)
  };
}

/**
 * Parse legacy codex.stages format and map to stages.
 * Returns the parsed stages record.
 */
function parseLegacyCodexStages(codexRaw: Record<string, unknown>): Partial<Record<Exclude<Stage, "init">, StageConfig>> {
  const stages: Partial<Record<Exclude<Stage, "init">, StageConfig>> = {};
  const rawStages = asRecord(codexRaw.stages, "codex.stages");

  for (const [oldName, value] of Object.entries(rawStages)) {
    const newName = STAGE_NAME_MAP[oldName];
    if (!newName) {
      console.warn(`[config] Unknown legacy stage "${oldName}" in codex.stages. Skipping.`);
      continue;
    }

    // Check if the mapped name is a valid stage key
    if (!STAGES.has(newName as Exclude<Stage, "init">)) {
      console.warn(`[config] Legacy stage "${oldName}" maps to "${newName}", which is not yet a valid stage. Skipping.`);
      continue;
    }

    const stage = asRecord(value, `codex.stages.${oldName}`);

    // Warn about per-stage model/effort override (no longer supported)
    if (stage.model !== undefined || stage.reasoningEffort !== undefined) {
      console.warn(`[config] Legacy stage "${oldName}" has per-stage model/reasoningEffort override. These are no longer supported per stage and will be ignored.`);
    }

    stages[newName as Exclude<Stage, "init">] = parseStageConfig(value, `codex.stages.${oldName}`);
  }

  return stages;
}

export function parseConfig(content: string): Config {
  const parsed = parseYaml(content) ?? {};
  const root = asRecord(parsed, "root");

  const stagesRaw = asRecord(root.stages, "stages");
  const codexRaw = asRecord(root.codex, "codex");

  // Detect if legacy format is being used
  const hasLegacyStages = Object.keys(asRecord(codexRaw.stages, "codex.stages")).length > 0;
  const hasStages = Object.keys(stagesRaw).length > 0;

  let stages: Partial<Record<Exclude<Stage, "init">, StageConfig>> = {};

  if (hasLegacyStages && hasStages) {
    // Both present: stages wins, warn
    console.warn("[config] Both codex.stages and stages sections found. stages will take precedence.");
    // Parse stages
    stages = parseStagesSection(stagesRaw);
  } else if (hasLegacyStages) {
    // Legacy mode
    console.warn("[config] Deprecated codex.stages format detected. Please migrate to the new stages format. See config.yaml for reference.");
    stages = parseLegacyCodexStages(codexRaw);
  } else if (hasStages) {
    // New format - parse stages
    stages = parseStagesSection(stagesRaw);
  }

  return {
    stages,
    runArchiveStage: readBoolean(root.runArchiveStage, DEFAULT_CONFIG.runArchiveStage, "runArchiveStage"),
    autoApprove: readBoolean(root.autoApprove, DEFAULT_CONFIG.autoApprove, "autoApprove"),
    maxIterations: readPositiveInteger(root.maxIterations, DEFAULT_CONFIG.maxIterations, "maxIterations")
  };
}

function parseStagesSection(stagesRaw: Record<string, unknown>): Partial<Record<Exclude<Stage, "init">, StageConfig>> {
  const stages: Partial<Record<Exclude<Stage, "init">, StageConfig>> = {};

  for (const [stageName, value] of Object.entries(stagesRaw)) {
    if (!STAGES.has(stageName as Exclude<Stage, "init">)) {
      console.warn(`[config] Unknown stage "${stageName}" in stages section. Ignoring.`);
      continue;
    }

    stages[stageName as Exclude<Stage, "init">] = parseStageConfig(value, `stages.${stageName}`);
  }

  return stages;
}

export function loadConfig(configPath = defaultConfigPath()): Config {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  return parseConfig(fs.readFileSync(configPath, "utf-8"));
}

export function getStageSkillConfig(config: Config, stage: Stage): StageSkillConfig {
  if (stage === "init") {
    return EMPTY_STAGE_SKILLS;
  }

  return config.stages[stage]?.skills ?? EMPTY_STAGE_SKILLS;
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

  // Legacy: codex.stages.<oldName>.<rest> → stages.<newName>.<rest>
  if (segments.length >= 3 && segments[0] === "codex" && segments[1] === "stages") {
    const oldName = segments[2];
    const rest = segments.slice(3);
    const newName = STAGE_NAME_MAP[oldName];
    if (newName && STAGES.has(newName as Exclude<Stage, "init">)) {
      const mappedSegments = ["stages", newName, ...rest];
      console.warn(`[config] Deprecated key "${key}" — use "${mappedSegments.join(".")}" instead.`);
      return getDeepValue(config as unknown as Record<string, unknown>, mappedSegments);
    }
    console.warn(`[config] Deprecated key "${key}" — unknown legacy stage "${oldName}".`);
    return undefined;
  }

  // Legacy: codex.default.* → runner config
  if (segments[0] === "codex" && segments[1] === "default") {
    console.warn(`[config] Deprecated key "${key}" — runner was removed; use "phasedev next" manually.`);
    return undefined;
  }

  // Legacy: codex.sandboxMode / codex.approvalPolicy → runner config
  if (segments[0] === "codex" && (segments[1] === "sandboxMode" || segments[1] === "approvalPolicy")) {
    console.warn(`[config] Deprecated key "${key}" — runner was removed; use "phasedev next" manually.`);
    return undefined;
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
    console.warn(`[config] Deprecated key "${key}" — runner was removed; use "phasedev next" manually.`);
    return undefined;
  }

  return getDeepValue(config as unknown as Record<string, unknown>, segments);
}
