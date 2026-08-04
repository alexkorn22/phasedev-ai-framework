export type Tier = "cheap" | "standard" | "strong";

export const TIER_VALUES: readonly Tier[] = ["cheap", "standard", "strong"];

export interface RoleConfig {
  name: string;
  tier: Tier;
  skills: string[];
  comment?: string;
}

const KNOWN_ROLE_KEYS = new Set(["tier", "skills", "comment"]);

function asRecord(value: unknown, key: string): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Config key ${key} must be an object.`);
  }

  return value as Record<string, unknown>;
}

export function readSkillArray(value: unknown, key: string): string[] {
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
    if (seen.has(skill)) {
      console.warn(`[config] Skill "${skill}" is listed twice in ${key}. Dropping the duplicate.`);
      continue;
    }
    seen.add(skill);
    skills.push(skill);
  }

  return skills;
}

function readComment(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Config key ${key} must be a string.`);
  }
  const comment = value.trim();
  return comment === "" ? undefined : comment;
}

function readTier(value: unknown, key: string): Tier {
  if (typeof value !== "string" || !TIER_VALUES.includes(value as Tier)) {
    throw new Error(`Config key ${key} must be one of: ${TIER_VALUES.join(", ")}.`);
  }
  return value as Tier;
}

function parseRole(name: string, value: unknown, key: string): RoleConfig {
  const role = asRecord(value, key);

  for (const roleKey of Object.keys(role)) {
    if (!KNOWN_ROLE_KEYS.has(roleKey)) {
      console.warn(`[config] Unknown key "${roleKey}" in ${key} — ignored. Valid keys: tier, skills, comment.`);
    }
  }

  const comment = readComment(role.comment, `${key}.comment`);
  return {
    name,
    tier: readTier(role.tier, `${key}.tier`),
    skills: readSkillArray(role.skills, `${key}.skills`),
    ...(comment === undefined ? {} : { comment })
  };
}

/**
 * Role names are free-form: PhaseDev validates the shape of a role, never its
 * name, so a project can add its own role without a framework change.
 * Source order is preserved for ordinary role names, but a role name that is
 * an integer-like string (e.g. "2") sorts ahead of the rest, in ascending
 * numeric order, because of JavaScript object key ordering.
 */
export function parseRoles(value: unknown, key: string): RoleConfig[] {
  const roles = asRecord(value, key);
  return Object.entries(roles).map(([name, role]) => parseRole(name, role, `${key}.${name}`));
}
