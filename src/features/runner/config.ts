import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// RunnerConfig types
// ---------------------------------------------------------------------------

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type SandboxMode = "workspace-write" | "danger-full-access";
export type ApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";

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

export interface RunnerConfig {
  runner: {
    model: string;
    reasoningEffort: ReasoningEffort;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
    streamAgentOutput: boolean;
    maxIterations: number;
    logDir: string;
    enableLogs: boolean;
    watchdog: WatchdogConfig;
    notifications: NotificationConfig;
  };
}

// ---------------------------------------------------------------------------
// Parser helper functions (see entities/config/config.ts)
// ---------------------------------------------------------------------------

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

function readEnum<T extends string>(
  value: unknown,
  fallback: T,
  key: string,
  allowed: Set<string>
): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Config key ${key} must be one of: ${Array.from(allowed).join(", ")}.`);
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Valid sets
// ---------------------------------------------------------------------------

const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const SANDBOX_MODES = new Set(["workspace-write", "danger-full-access"]);
const APPROVAL_POLICIES = new Set(["never", "on-request", "on-failure", "untrusted"]);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_RUNNER_CONFIG: RunnerConfig = {
  runner: {
    model: "claude-sonnet-5",
    reasoningEffort: "medium",
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: false,
    streamAgentOutput: true,
    maxIterations: 10,
    logDir: ".phasedev/logs",
    enableLogs: true,
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

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function defaultRunnerConfigPath(): string {
  return path.resolve(__dirname, "..", "..", "..", "runner.yaml");
}

export function projectRunnerConfigPath(projectPath: string): string {
  return path.join(path.resolve(projectPath), ".phasedev", "runner.yaml");
}

export function resolveRunnerConfigPath(
  projectPath: string,
  explicitConfigPath?: string
): string {
  if (explicitConfigPath) {
    return path.resolve(explicitConfigPath);
  }

  const projectConfig = projectRunnerConfigPath(projectPath);
  if (fs.existsSync(projectConfig)) {
    return projectConfig;
  }

  return defaultRunnerConfigPath();
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseRunnerConfig(rawContent: string): RunnerConfig {
  const parsed = parseYaml(rawContent) ?? {};
  const root = asRecord(parsed, "root");
  const runnerRaw = asRecord(root.runner, "runner");

  const watchdogRaw = asRecord(runnerRaw.watchdog, "runner.watchdog");
  const notifRaw = asRecord(runnerRaw.notifications, "runner.notifications");
  const telegramRaw = asRecord(notifRaw.telegram, "runner.notifications.telegram");

  return {
    runner: {
      model: readString(
        runnerRaw.model,
        DEFAULT_RUNNER_CONFIG.runner.model,
        "runner.model"
      ),
      reasoningEffort: readEnum<ReasoningEffort>(
        runnerRaw.reasoningEffort,
        DEFAULT_RUNNER_CONFIG.runner.reasoningEffort,
        "runner.reasoningEffort",
        REASONING_EFFORTS
      ),
      sandboxMode: readEnum<SandboxMode>(
        runnerRaw.sandboxMode,
        DEFAULT_RUNNER_CONFIG.runner.sandboxMode,
        "runner.sandboxMode",
        SANDBOX_MODES
      ),
      approvalPolicy: readEnum<ApprovalPolicy>(
        runnerRaw.approvalPolicy,
        DEFAULT_RUNNER_CONFIG.runner.approvalPolicy,
        "runner.approvalPolicy",
        APPROVAL_POLICIES
      ),
      networkAccessEnabled: readBoolean(
        runnerRaw.networkAccessEnabled,
        DEFAULT_RUNNER_CONFIG.runner.networkAccessEnabled,
        "runner.networkAccessEnabled"
      ),
      streamAgentOutput: readBoolean(
        runnerRaw.streamAgentOutput,
        DEFAULT_RUNNER_CONFIG.runner.streamAgentOutput,
        "runner.streamAgentOutput"
      ),
      maxIterations: readPositiveInteger(
        runnerRaw.maxIterations,
        DEFAULT_RUNNER_CONFIG.runner.maxIterations,
        "runner.maxIterations"
      ),
      logDir: readString(
        runnerRaw.logDir,
        DEFAULT_RUNNER_CONFIG.runner.logDir,
        "runner.logDir"
      ),
      enableLogs: readBoolean(
        runnerRaw.enableLogs,
        DEFAULT_RUNNER_CONFIG.runner.enableLogs,
        "runner.enableLogs"
      ),
      watchdog: {
        enabled: readBoolean(
          watchdogRaw.enabled,
          DEFAULT_RUNNER_CONFIG.runner.watchdog.enabled,
          "runner.watchdog.enabled"
        ),
        turnTimeoutMs: readPositiveInteger(
          watchdogRaw.turnTimeoutMs,
          DEFAULT_RUNNER_CONFIG.runner.watchdog.turnTimeoutMs,
          "runner.watchdog.turnTimeoutMs"
        ),
        inactivityTimeoutMs: readPositiveInteger(
          watchdogRaw.inactivityTimeoutMs,
          DEFAULT_RUNNER_CONFIG.runner.watchdog.inactivityTimeoutMs,
          "runner.watchdog.inactivityTimeoutMs"
        ),
        statusIntervalMs: readPositiveInteger(
          watchdogRaw.statusIntervalMs,
          DEFAULT_RUNNER_CONFIG.runner.watchdog.statusIntervalMs,
          "runner.watchdog.statusIntervalMs"
        ),
        abortGraceMs: readPositiveInteger(
          watchdogRaw.abortGraceMs,
          DEFAULT_RUNNER_CONFIG.runner.watchdog.abortGraceMs,
          "runner.watchdog.abortGraceMs"
        )
      },
      notifications: {
        telegram: {
          enabled: readBoolean(
            telegramRaw.enabled,
            DEFAULT_RUNNER_CONFIG.runner.notifications.telegram.enabled,
            "runner.notifications.telegram.enabled"
          ),
          botTokenEnv: readString(
            telegramRaw.botTokenEnv,
            DEFAULT_RUNNER_CONFIG.runner.notifications.telegram.botTokenEnv,
            "runner.notifications.telegram.botTokenEnv"
          ),
          chatIdEnv: readString(
            telegramRaw.chatIdEnv,
            DEFAULT_RUNNER_CONFIG.runner.notifications.telegram.chatIdEnv,
            "runner.notifications.telegram.chatIdEnv"
          )
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Re-exports from entity config (flow-related config types and helpers)
// ---------------------------------------------------------------------------

export {
  DEFAULT_CONFIG,
  EMPTY_STAGE_SKILLS,
  defaultConfigPath,
  getStageSkillConfig,
  loadConfig,
  parseConfig,
  projectConfigPath,
  resolveConfigPath,
  resolveProjectLogDir
} from "../../entities/config/config";
export type {
  Config,
  StageConfig,
  StageSkillConfig
} from "../../entities/config/config";
