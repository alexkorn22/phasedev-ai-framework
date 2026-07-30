import { describe, test, expect, spyOn } from "bun:test";
import { parse as parseYaml } from "yaml";
import { parseRoles, readSkillArray, TIER_VALUES } from "../src/entities/role/role";

function rolesFrom(yaml: string) {
  return parseRoles(parseYaml(yaml)?.roles, "roles");
}

describe("parseRoles", () => {
  test("parses roles preserving source order", () => {
    const roles = rolesFrom(`
roles:
  research:    { tier: cheap, skills: [codebase-recon] }
  implementer: { tier: standard, skills: [tdd-method, typescript-standards] }
`);
    expect(roles).toEqual([
      { name: "research", tier: "cheap", skills: ["codebase-recon"] },
      { name: "implementer", tier: "standard", skills: ["tdd-method", "typescript-standards"] }
    ]);
  });

  test("returns an empty catalog for missing or empty roles", () => {
    expect(parseRoles(undefined, "roles")).toEqual([]);
    expect(rolesFrom("roles: {}\n")).toEqual([]);
  });

  test("accepts every tier value", () => {
    expect(TIER_VALUES).toEqual(["cheap", "standard", "strong"]);
    const roles = rolesFrom(`
roles:
  a: { tier: cheap, skills: [s] }
  b: { tier: standard, skills: [s] }
  c: { tier: strong, skills: [s] }
`);
    expect(roles.map(role => role.tier)).toEqual(["cheap", "standard", "strong"]);
  });

  test("rejects an invalid tier", () => {
    expect(() => rolesFrom("roles:\n  a: { tier: turbo, skills: [s] }\n")).toThrow(
      "Config key roles.a.tier must be one of: cheap, standard, strong."
    );
  });

  test("rejects a missing tier", () => {
    expect(() => rolesFrom("roles:\n  a: { skills: [s] }\n")).toThrow(
      "Config key roles.a.tier must be one of: cheap, standard, strong."
    );
  });

  test("rejects non-object roles and non-object role entries", () => {
    expect(() => parseRoles([], "roles")).toThrow("Config key roles must be an object.");
    expect(() => rolesFrom("roles:\n  a: not-an-object\n")).toThrow("Config key roles.a must be an object.");
  });

  test("rejects skills that are not an array of non-empty strings", () => {
    expect(() => rolesFrom("roles:\n  a: { tier: cheap, skills: nope }\n")).toThrow(
      "Config key roles.a.skills must be an array of non-empty strings."
    );
    expect(() => rolesFrom("roles:\n  a: { tier: cheap, skills: ['', b] }\n")).toThrow(
      "Config key roles.a.skills[0] must be a non-empty string."
    );
  });

  test("allows a role with no skills", () => {
    expect(rolesFrom("roles:\n  a: { tier: cheap }\n")).toEqual([{ name: "a", tier: "cheap", skills: [] }]);
  });

  test("deduplicates skills with a warning and keeps first occurrence", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const roles = rolesFrom("roles:\n  a: { tier: cheap, skills: [x, y, x] }\n");
    expect(roles[0].skills).toEqual(["x", "y"]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("trims skill names", () => {
    expect(rolesFrom("roles:\n  a: { tier: cheap, skills: ['  x  '] }\n")[0].skills).toEqual(["x"]);
  });

  test("warns and ignores an unknown key inside a role", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const roles = rolesFrom("roles:\n  a: { tier: cheap, skills: [x], model: opus }\n");
    expect(roles).toEqual([{ name: "a", tier: "cheap", skills: ["x"] }]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("readSkillArray", () => {
  test("returns an empty array for undefined", () => {
    expect(readSkillArray(undefined, "k")).toEqual([]);
  });
});
