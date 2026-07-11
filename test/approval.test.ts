import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { isSetupApproved, isDesignApproved, isPlanApproved } from "../src/entities/change/approval";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let dir: string;
beforeEach(() => { dir = createTempWorkspace("approval"); });
afterEach(() => { cleanupTempWorkspace(dir); });

function write(rel: string, approved: boolean) {
  const p = path.join(dir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `---\napproved: ${approved}\n---\nbody\n`, "utf-8");
}

describe("isSetupApproved", () => {
  test("reports both files missing", () => {
    expect(isSetupApproved(dir)).toEqual({ approved: false, missing: ["prd.md", "execution_contract.md"] });
  });
  test("reports only the unapproved file", () => {
    write("prd.md", true);
    write("execution_contract.md", false);
    expect(isSetupApproved(dir)).toEqual({ approved: false, missing: ["execution_contract.md"] });
  });
  test("approved when both are approved", () => {
    write("prd.md", true);
    write("execution_contract.md", true);
    expect(isSetupApproved(dir)).toEqual({ approved: true, missing: [] });
  });
});

describe("isDesignApproved / isPlanApproved", () => {
  test("design approval reads architecture/design.md", () => {
    write("architecture/design.md", true);
    expect(isDesignApproved(dir)).toBe(true);
  });
  test("plan approval reads iteration_plan.md", () => {
    write("iteration_plan.md", false);
    expect(isPlanApproved(dir)).toBe(false);
  });
});
