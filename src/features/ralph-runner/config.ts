import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { FlowStage } from "../../entities/flow-stage/types";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type SandboxMode = "workspace-write" | "danger-full-access";
export type ApprovalPolicy = "never" | "on-request" | "on-failure" | "untrusted";

export type StageModelConfig = {
  model: string;
  reasoningEffort: ReasoningEffort;
};

export interface FlowRalphConfig {
  codex: {
    default: StageModelConfig;
    stages: Partial<Record<Exclude<FlowStage, "init">, Partial<StageModelConfig>>>;
    sandboxMode: SandboxMode;
    approvalPolicy: ApprovalPolicy;
    networkAccessEnabled: boolean;
    streamAgentOutput: boolean;
  };
  loop: {
    maxIterations: number;
    stopOnNoProgress: boolean;
    logDir: string;
    enableLogs: boolean;
  };
}

export const DEFAULT_FLOW_RALPH_CONFIG: FlowRalphConfig = {
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
    stopOnNoProgress: true,
    logDir: "openspec/flow-ralph",
    enableLogs: true
  }
};

const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh"]);
const SANDBOX_MODES = new Set(["workspace-write", "danger-full-access"]);
const APPROVAL_POLICIES = new Set(["never", "on-request", "on-failure", "untrusted"]);
const FLOW_STAGES = new Set<Exclude<FlowStage, "init">>([
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

function parseStageModelConfig(value: unknown, fallback: StageModelConfig, key: string): StageModelConfig {
  const stage = asRecord(value, key);
  return {
    model: readString(stage.model, fallback.model, `${key}.model`),
    reasoningEffort: readEnum(stage.reasoningEffort, fallback.reasoningEffort, `${key}.reasoningEffort`, REASONING_EFFORTS)
  };
}

export function parseFlowRalphConfig(content: string): FlowRalphConfig {
  const parsed = parseYaml(content) ?? {};
  const root = asRecord(parsed, "root");
  const codex = asRecord(root.codex, "codex");
  const loop = asRecord(root.loop, "loop");

  const defaultModel = parseStageModelConfig(codex.default, DEFAULT_FLOW_RALPH_CONFIG.codex.default, "codex.default");
  const rawStages = asRecord(codex.stages, "codex.stages");
  const stages: FlowRalphConfig["codex"]["stages"] = {};

  for (const [stageName, value] of Object.entries(rawStages)) {
    if (!FLOW_STAGES.has(stageName as Exclude<FlowStage, "init">)) {
      throw new Error(`Config key codex.stages.${stageName} is not a valid flow stage.`);
    }

    stages[stageName as Exclude<FlowStage, "init">] = parseStageModelConfig(value, defaultModel, `codex.stages.${stageName}`);
  }

  return {
    codex: {
      default: defaultModel,
      stages,
      sandboxMode: readEnum(codex.sandboxMode, DEFAULT_FLOW_RALPH_CONFIG.codex.sandboxMode, "codex.sandboxMode", SANDBOX_MODES),
      approvalPolicy: readEnum(codex.approvalPolicy, DEFAULT_FLOW_RALPH_CONFIG.codex.approvalPolicy, "codex.approvalPolicy", APPROVAL_POLICIES),
      networkAccessEnabled: readBoolean(codex.networkAccessEnabled, DEFAULT_FLOW_RALPH_CONFIG.codex.networkAccessEnabled, "codex.networkAccessEnabled"),
      streamAgentOutput: readBoolean(codex.streamAgentOutput, DEFAULT_FLOW_RALPH_CONFIG.codex.streamAgentOutput, "codex.streamAgentOutput")
    },
    loop: {
      maxIterations: readPositiveInteger(loop.maxIterations, DEFAULT_FLOW_RALPH_CONFIG.loop.maxIterations, "loop.maxIterations"),
      stopOnNoProgress: readBoolean(loop.stopOnNoProgress, DEFAULT_FLOW_RALPH_CONFIG.loop.stopOnNoProgress, "loop.stopOnNoProgress"),
      logDir: readString(loop.logDir, DEFAULT_FLOW_RALPH_CONFIG.loop.logDir, "loop.logDir"),
      enableLogs: readBoolean(loop.enableLogs, DEFAULT_FLOW_RALPH_CONFIG.loop.enableLogs, "loop.enableLogs")
    }
  };
}

export function loadFlowRalphConfig(configPath = defaultConfigPath()): FlowRalphConfig {
  if (!fs.existsSync(configPath)) {
    return DEFAULT_FLOW_RALPH_CONFIG;
  }

  return parseFlowRalphConfig(fs.readFileSync(configPath, "utf-8"));
}

export function getStageModelConfig(config: FlowRalphConfig, stage: FlowStage): StageModelConfig {
  if (stage === "init") {
    return config.codex.default;
  }

  return {
    model: config.codex.stages[stage]?.model ?? config.codex.default.model,
    reasoningEffort: config.codex.stages[stage]?.reasoningEffort ?? config.codex.default.reasoningEffort
  };
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
