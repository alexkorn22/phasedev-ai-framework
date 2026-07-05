import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const skillMdPath = path.join(repoRoot, "skills", "phasedev-orchestrator", "SKILL.md");
const flowRoutePath = path.join(repoRoot, "src", "features", "phase-control", "flow-route.ts");

function routeKindsInCode(): Set<string> {
  const source = fs.readFileSync(flowRoutePath, "utf-8");
  const kinds = new Set<string>();
  for (const match of source.matchAll(/kind: "([a-z_]+)"/g)) {
    kinds.add(match[1]);
  }
  return kinds;
}

function routeKindTokensInSkillMd(): string[] {
  const doc = fs.readFileSync(skillMdPath, "utf-8");
  const tokens = new Set<string>();
  for (const match of doc.matchAll(/`(invalid_[a-z_]+|[a-z_]+_approval)`/g)) {
    tokens.add(match[1]);
  }
  return Array.from(tokens).sort();
}

describe("phasedev-orchestrator SKILL.md route-kind drift", () => {
  test("every invalid_*/*_approval route kind named in SKILL.md exists in flow-route.ts", () => {
    const codeKinds = routeKindsInCode();
    const skillTokens = routeKindTokensInSkillMd();

    expect(skillTokens.length).toBeGreaterThan(0);

    const missing = skillTokens.filter(token => !codeKinds.has(token));
    expect(missing).toEqual([]);
  });
});
