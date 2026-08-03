import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { Tier, TIER_VALUES } from "../role/role";

export type HarnessModels = Partial<Record<Tier, string>>;

export interface ModelTiers {
  harnesses: Record<string, HarnessModels>;
  source: "file" | "missing";
}

const MISSING: ModelTiers = { harnesses: {}, source: "missing" };

export function modelTiersPath(): string {
  const override = process.env.PHASEDEV_MODELS_FILE;
  if (override && override.trim() !== "") {
    return override;
  }
  return path.join(os.homedir(), ".config", "phasedev", "models.yaml");
}

export function parseModelTiers(content: string): Record<string, HarnessModels> {
  const parsed = parseYaml(content) ?? {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("[models] Model tiers file must map harness names to tier objects — ignored.");
    return {};
  }

  const harnesses: Record<string, HarnessModels> = {};
  for (const [harness, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      console.warn(`[models] Harness "${harness}" must map tiers to model names — ignored.`);
      continue;
    }

    const models: HarnessModels = {};
    for (const [tier, model] of Object.entries(value as Record<string, unknown>)) {
      if (!TIER_VALUES.includes(tier as Tier)) {
        console.warn(`[models] Unknown tier "${tier}" for harness "${harness}" — ignored. Valid tiers: ${TIER_VALUES.join(", ")}.`);
        continue;
      }
      if (typeof model !== "string" || model.trim() === "") {
        console.warn(`[models] Model for ${harness}.${tier} must be a non-empty string — ignored.`);
        continue;
      }
      models[tier as Tier] = model.trim();
    }

    harnesses[harness] = models;
  }

  return harnesses;
}

/**
 * A missing, unreadable, empty, or malformed file is a degradation, never an
 * error: spawn-plan falls back to printing tiers so the flow never blocks on
 * machine-level configuration.
 */
export function loadModelTiers(filePath = modelTiersPath()): ModelTiers {
  let content: string;
  try {
    if (!fs.existsSync(filePath)) {
      return MISSING;
    }
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return MISSING;
  }

  if (content.trim() === "") {
    return MISSING;
  }

  let harnesses: Record<string, HarnessModels>;
  try {
    harnesses = parseModelTiers(content);
  } catch {
    console.warn(`[models] Could not parse ${filePath} — model tiers are unavailable.`);
    return MISSING;
  }

  if (Object.keys(harnesses).length === 0) {
    return MISSING;
  }

  return { harnesses, source: "file" };
}

export function resolveModel(tiers: ModelTiers, harness: string, tier: Tier): string | undefined {
  return tiers.harnesses[harness]?.[tier];
}

export function knownHarnesses(tiers: ModelTiers): string[] {
  return Object.keys(tiers.harnesses).sort();
}
