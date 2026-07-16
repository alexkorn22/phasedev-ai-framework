import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { resetChange } from "../src/features/flow-state/reset-change";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let dir: string;
beforeEach(() => { dir = createTempWorkspace("reset-change"); });
afterEach(() => { cleanupTempWorkspace(dir); });

function makeActiveChange(name: string): string {
  const changeDir = path.join(dir, ".phasedev", "changes", name);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "state.json"),
    JSON.stringify({ activePhase: "change_intake", activeIteration: null, repairCycleCount: 0 }), "utf-8");
  return changeDir;
}

describe("resetChange", () => {
  test("reports nothing to reset when no active change exists", () => {
    const r = resetChange(dir, true);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("No active change");
  });

  test("refuses without --yes and flags blocked", () => {
    makeActiveChange("c1");
    const r = resetChange(dir, false);
    expect(r.ok).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.message).toContain("Use --yes");
  });

  test("moves the change to .trash when forced", () => {
    const changeDir = makeActiveChange("c1");
    const r = resetChange(dir, true);
    expect(r.ok).toBe(true);
    expect(fs.existsSync(changeDir)).toBe(false);
    const trash = path.join(dir, ".phasedev", "changes", ".trash");
    const moved = fs.readdirSync(trash);
    expect(moved.length).toBe(1);
  });
});
