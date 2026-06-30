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

export type StageModelConfig = {
  model: string;
  reasoningEffort: ReasoningEffort;
};

export type StageConfig = StageModelConfig & {
  skills: StageSkillConfig;
};

export type TelegramNotificationConfig = {
  enabled: boolean;
  botTokenEnv: string;
  chatIdEnv: string;
};

export type NotificationConfig = {
  telegram: TelegramNotificationConfig;
};

export type WatchdogConfig = {
  enabled: boolean;
  turnTimeoutMs: number;
  inactivityTimeoutMs: number;
  statusIntervalMs: number;
  abortGraceMs: number;
};

export interface Config {
  codex: {
    default: StageModelConfig;
    stages: Partial<Record<Exclude<Stage, "init">, StageConfig>>;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
    streamAgentOutput: boolean;
  };
  loop: {
    maxIterations: number;
    logDir: string;
    enableLogs: boolean;
    runArchiveStage: boolean;
    autoApprove: boolean;
    watchdog: WatchdogConfig;
    notifications: NotificationConfig;
  };
}

export const EMPTY_STAGE_SKILLS: StageSkillConfig = {
  routers: [],
  main: [],
  additional: []
};

export const DEFAULT_CONFIG: Config = {
  codex: {
    default: {
      model: "gpt-5.4",
      reasoningEffort: "high"
    },
    stages: {},
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    streamAgentOutput: true
  },
  loop: {
    maxIterations: 10,
    logDir: `${SYSTEM_DIR}/logs`,
    enableLogs: true,
    runArchiveStage: true,
    autoApprove: false,
    watchdog: {
      enabled: true,
      turnTimeoutMs: 3600000,
      inactivityTimeoutMs: 900000,
      statusIntervalMs: 300000,
      abortGraceMs: 5000
    },
    notifications: {
      telegram: {
        enabled: false,
        botTokenEnv: "TELEGRAM_BOT_TOKEN",
        chatIdEnv: "TELEGRAM_CHAT_ID"
      }
    }
  }
};

const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const SANDBOX_MODES = new Set(["workspace-write", "danger-full-access"]);
const APPROVAL_POLICIES = new Set(["never", "on-request", "on-failure", "untrusted"]);
const STAGES = new Set<Exclude<Stage, "init">>([
  "setup",
  "research",
  "design",
  "plan",
  "implementation",
  "phase_validation",
  "final_validation",
  "repair",
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

function parseStageModelConfig(value: unknown, fallback: StageModelConfig, key: string): StageModelConfig {
  const stage = asRecord(value, key);
  return {
    model: readString(stage.model, fallback.model, `${key}.model`),
    reasoningEffort: readEnum(stage.reasoningEffort, fallback.reasoningEffort, `${key}.reasoningEffort`, REASONING_EFFORTS)
  };
}

function parseStageConfig(value: unknown, fallback: StageModelConfig, key: string): StageConfig {
  const stage = asRecord(value, key);
  return {
    ...parseStageModelConfig(stage, fallback, key),
    skills: parseStageSkills(stage.skills, `${key}.skills`)
  };
}

function parseTelegramNotificationConfig(value: unknown, fallback: TelegramNotificationConfig, key: string): TelegramNotificationConfig {
  const telegram = asRecord(value, key);
  return {
    enabled: readBoolean(telegram.enabled, fallback.enabled, `${key}.enabled`),
    botTokenEnv: readString(telegram.botTokenEnv, fallback.botTokenEnv, `${key}.botTokenEnv`),
    chatIdEnv: readString(telegram.chatIdEnv, fallback.chatIdEnv, `${key}.chatIdEnv`)
  };
}

function parseNotificationConfig(value: unknown, fallback: NotificationConfig, key: string): NotificationConfig {
  const notifications = asRecord(value, key);
  return {
    telegram: parseTelegramNotificationConfig(notifications.telegram, fallback.telegram, `${key}.telegram`)
  };
}

function parseWatchdogConfig(value: unknown, fallback: WatchdogConfig, key: string): WatchdogConfig {
  const watchdog = asRecord(value, key);
  return {
    enabled: readBoolean(watchdog.enabled, fallback.enabled, `${key}.enabled`),
    turnTimeoutMs: readPositiveInteger(watchdog.turnTimeoutMs, fallback.turnTimeoutMs, `${key}.turnTimeoutMs`),
    inactivityTimeoutMs: readPositiveInteger(watchdog.inactivityTimeoutMs, fallback.inactivityTimeoutMs, `${key}.inactivityTimeoutMs`),
    statusIntervalMs: readPositiveInteger(watchdog.statusIntervalMs, fallback.statusIntervalMs, `${key}.statusIntervalMs`),
    abortGraceMs: readPositiveInteger(watchdog.abortGraceMs, fallback.abortGraceMs, `${key}.abortGraceMs`)
  };
}

export function parseConfig(content: string): Config {
  const parsed = parseYaml(content) ?? {};
  const root = asRecord(parsed, "root");
  const codex = asRecord(root.codex, "codex");
  const loop = asRecord(root.loop, "loop");

  const defaultModel = parseStageModelConfig(codex.default, DEFAULT_CONFIG.codex.default, "codex.default");
  const rawStages = asRecord(codex.stages, "codex.stages");
  const stages: Config["codex"]["stages"] = {};

  for (const [stageName, value] of Object.entries(rawStages)) {
    if (!STAGES.has(stageName as Exclude<Stage, "init">)) {
      throw new Error(`Config key codex.stages.${stageName} is not a valid flow stage.`);
    }

    stages[stageName as Exclude<Stage, "init">] = parseStageConfig(value, defaultModel, `codex.stages.${stageName}`);
  }

  return {
    codex: {
      default: defaultModel,
      stages,
      sandboxMode: readEnum(codex.sandboxMode, DEFAULT_CONFIG.codex.sandboxMode, "codex.sandboxMode", SANDBOX_MODES),
      approvalPolicy: readEnum(codex.approvalPolicy, DEFAULT_CONFIG.codex.approvalPolicy, "codex.approvalPolicy", APPROVAL_POLICIES),
      networkAccessEnabled: readBoolean(codex.networkAccessEnabled, DEFAULT_CONFIG.codex.networkAccessEnabled, "codex.networkAccessEnabled"),
      streamAgentOutput: readBoolean(codex.streamAgentOutput, DEFAULT_CONFIG.codex.streamAgentOutput, "codex.streamAgentOutput")
    },
    loop: {
      maxIterations: readPositiveInteger(loop.maxIterations, DEFAULT_CONFIG.loop.maxIterations, "loop.maxIterations"),
      logDir: readString(loop.logDir, DEFAULT_CONFIG.loop.logDir, "loop.logDir"),
      enableLogs: readBoolean(loop.enableLogs, DEFAULT_CONFIG.loop.enableLogs, "loop.enableLogs"),
      runArchiveStage: readBoolean(loop.runArchiveStage, DEFAULT_CONFIG.loop.runArchiveStage, "loop.runArchiveStage"),
      autoApprove: readBoolean(loop.autoApprove, DEFAULT_CONFIG.loop.autoApprove, "loop.autoApprove"),
      watchdog: parseWatchdogConfig(loop.watchdog, DEFAULT_CONFIG.loop.watchdog, "loop.watchdog"),
      notifications: parseNotificationConfig(loop.notifications, DEFAULT_CONFIG.loop.notifications, "loop.notifications")
    }
  };
}

export function loadConfig(configPath = defaultConfigPath()): Config {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  return parseConfig(fs.readFileSync(configPath, "utf-8"));
}

export function getStageModelConfig(config: Config, stage: Stage): StageModelConfig {
  if (stage === "init") {
    return config.codex.default;
  }

  return {
    model: config.codex.stages[stage]?.model ?? config.codex.default.model,
    reasoningEffort: config.codex.stages[stage]?.reasoningEffort ?? config.codex.default.reasoningEffort
  };
}

export function getStageSkillConfig(config: Config, stage: Stage): StageSkillConfig {
  if (stage === "init") {
    return EMPTY_STAGE_SKILLS;
  }

  return config.codex.stages[stage]?.skills ?? EMPTY_STAGE_SKILLS;
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
  return getDeepValue(config as unknown as Record<string, unknown>, segments);
}
