import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { resolveArtifactPath } from "../src/features/artifact-ops/resolve-artifact-path";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let workspace: string;

function initProject(): void {
  fs.mkdirSync(path.join(workspace, ".phasedev"), { recursive: true });
}

function createChangeWithFile(changeName: string, fileName: string): string {
  const changeDir = path.join(workspace, ".phasedev", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  const filePath = path.join(changeDir, fileName);
  fs.writeFileSync(filePath, "content", "utf-8");
  return filePath;
}

beforeEach(() => { workspace = createTempWorkspace("resolve-artifact-path"); });
afterEach(() => { cleanupTempWorkspace(workspace); });

describe("resolveArtifactPath", () => {
  test("returns an existing file path as-is", () => {
    initProject();
    const existing = path.join(workspace, "prd.md");
    fs.writeFileSync(existing, "x", "utf-8");
    expect(resolveArtifactPath(workspace, existing)).toBe(existing);
  });

  test("resolves a relative name against the active change dir", () => {
    initProject();
    const filePath = createChangeWithFile("my-change", "design.md");
    expect(resolveArtifactPath(workspace, "design.md")).toBe(filePath);
  });

  test("returns an unresolved name unchanged", () => {
    initProject();
    createChangeWithFile("my-change", "design.md");
    expect(resolveArtifactPath(workspace, "missing.md")).toBe("missing.md");
  });
});
