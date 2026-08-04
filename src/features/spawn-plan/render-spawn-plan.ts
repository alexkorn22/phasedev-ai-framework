import { Config } from "../../entities/config/config";
import { knownHarnesses, ModelTiers, resolveModel } from "../../entities/model-tiers/model-tiers";
import { Tier } from "../../entities/role/role";

export interface SpawnPlanRole {
  name: string;
  model: string;
  skills: string[];
  comment?: string;
}

export interface SpawnPlanResult {
  ok: boolean;
  message: string;
  roles: SpawnPlanRole[];
}

const HEADER_TAIL = [
  "Which roles this phase needs and how many sub-agents is your judgment.",
  "The skills and model of a chosen role are mandatory."
];

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function degradationNote(
  tiers: ModelTiers,
  harness: string,
  missingTiers: Set<Tier>,
  affectedRoleNames: string[]
): string | undefined {
  if (tiers.source === "missing") {
    return "Tier-to-model mapping is not configured — run every sub-agent on the session model. The model column shows tiers.";
  }

  const harnesses = knownHarnesses(tiers);
  if (!harnesses.includes(harness)) {
    return `Harness "${harness}" is not in the model tiers file — run every sub-agent on the session model. The model column shows tiers. Known harnesses: ${harnesses.join(", ")}.`;
  }

  if (missingTiers.size > 0) {
    const sortedTiers = [...missingTiers].sort();
    return `Harness "${harness}" has no model mapped for tier(s): ${sortedTiers.join(", ")} — those roles fall back to printing the tier name, which is not a real model. Run ${affectedRoleNames.join(", ")} on the session model for now, and add the missing tier(s) to the harness in ~/.config/phasedev/models.yaml (or PHASEDEV_MODELS_FILE).`;
  }

  return undefined;
}

export function renderSpawnPlan(config: Config, tiers: ModelTiers, harness: string): SpawnPlanResult {
  const missingTiers = new Set<Tier>();
  const affectedRoleNames: string[] = [];
  const roles: SpawnPlanRole[] = config.roles.map(role => {
    const model = resolveModel(tiers, harness, role.tier);
    if (model === undefined) {
      missingTiers.add(role.tier);
      affectedRoleNames.push(role.name);
    }
    return {
      name: role.name,
      model: model ?? role.tier,
      skills: role.skills,
      ...(role.comment === undefined ? {} : { comment: role.comment })
    };
  });

  const header = [`Roles for sub-agent dispatch (${harness}).`, ...HEADER_TAIL].join("\n");
  const note = degradationNote(tiers, harness, missingTiers, affectedRoleNames);

  if (roles.length === 0) {
    return {
      ok: true,
      roles,
      message: [header, "", "No roles are configured in config.yaml.", ...(note ? ["", note] : [])].join("\n")
    };
  }

  const nameWidth = Math.max(...roles.map(role => role.name.length));
  const modelWidth = Math.max(...roles.map(role => role.model.length));
  const rows = roles.map(role => {
    const skills = role.skills.length > 0 ? role.skills.join(", ") : "none";
    const comment = role.comment === undefined ? "" : ` | ${role.comment}`;
    return `${pad(role.name, nameWidth)} | ${pad(role.model, modelWidth)} | ${skills}${comment}`;
  });

  return {
    ok: true,
    roles,
    message: [header, "", ...rows, ...(note ? ["", note] : [])].join("\n")
  };
}

export function renderMissingHarnessUsage(tiers: ModelTiers): string {
  const harnesses = knownHarnesses(tiers);
  const known = harnesses.length > 0
    ? `Known harnesses: ${harnesses.join(", ")}.`
    : "Known harnesses: no model tiers file was found, so any harness name resolves to tiers.";

  return [
    "[PHASEDEV SPAWN-PLAN] FAILED: --harness is required.",
    "Usage: phasedev spawn-plan --harness <name> [--project-path <path>] [--config <path>]",
    known
  ].join("\n");
}
