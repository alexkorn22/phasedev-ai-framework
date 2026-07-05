import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { updateIterationStatus } from "../src/entities/iteration-plan/update-iteration-status";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("update-iteration-status");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

describe("updateIterationStatus", () => {
  test("returns false and writes nothing when the file is missing", () => {
    const missing = path.join(testTmpDir, "iteration_plan.md");

    expect(updateIterationStatus(missing, 1, "in_progress")).toBe(false);
    expect(fs.existsSync(missing)).toBe(false);
  });

  test("returns false when no iteration heading matches", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\n\n## Iteration 01: API [ ]\n", "utf-8");

    expect(updateIterationStatus(plan, 1, "in_progress")).toBe(false);
    expect(fs.readFileSync(plan, "utf-8")).toContain("## Iteration 01: API [ ]");
  });

  test("returns true and flips the checkbox when the heading matches", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\n\n## Iteration 1: API [ ]\n", "utf-8");

    expect(updateIterationStatus(plan, 1, "completed")).toBe(true);
    expect(fs.readFileSync(plan, "utf-8")).toContain("## Iteration 1: API [x]");
  });

  test("rewrites a CRLF plan with consistent LF line endings, not a mix", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\r\n\r\n## Iteration 1: API [ ]\r\n- [ ] 1.1 Implement endpoint\r\n", "utf-8");

    expect(updateIterationStatus(plan, 1, "completed")).toBe(true);

    const rewritten = fs.readFileSync(plan, "utf-8");
    expect(rewritten).not.toContain("\r");
    expect(rewritten).toContain("## Iteration 1: API [x]");
    expect(rewritten).toContain("- [ ] 1.1 Implement endpoint");
  });
});
