import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { setIterationStatus } from "../src/features/iteration-ops/set-iteration-status";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let testTmpDir: string;

beforeEach(() => {
  testTmpDir = createTempWorkspace("set-iteration-status");
});

afterEach(() => {
  cleanupTempWorkspace(testTmpDir);
});

describe("setIterationStatus", () => {
  test("returns ok:true when heading is updated successfully", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\n\n## Iteration 1: API [ ]\n", "utf-8");

    const result = setIterationStatus(testTmpDir, 1, "completed", plan);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("[x]");
    expect(fs.readFileSync(plan, "utf-8")).toContain("## Iteration 1: API [x]");
  });

  test("returns ok:false when the iteration is not found in the plan", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\n\n## Iteration 1: API [ ]\n", "utf-8");

    const result = setIterationStatus(testTmpDir, 99, "completed", plan);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("99");
  });

  test("returns ok:false when the heading is inside a fenced code block", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\n\n```\n## Iteration 1: API [ ]\n```\n", "utf-8");

    const result = setIterationStatus(testTmpDir, 1, "completed", plan);
    expect(result.ok).toBe(false);
  });

  test("returns ok:false for non-existent file", () => {
    const plan = path.join(testTmpDir, "nonexistent.md");
    const result = setIterationStatus(testTmpDir, 1, "completed", plan);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not found");
  });

  test("returns ok:true when heading already has the requested status (no-op, not an error)", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    fs.writeFileSync(plan, "# Plan\n\n## Iteration 1: API [x]\n", "utf-8");

    // Setting completed when already [x] is a no-op but not an error
    const result = setIterationStatus(testTmpDir, 1, "completed", plan);
    expect(result.ok).toBe(true);
  });

  test("returns ok:false and does not mutate when the iteration id is duplicated", () => {
    const plan = path.join(testTmpDir, "iteration_plan.md");
    const original = "# Plan\n\n## Iteration 3: A [ ]\n## Iteration 3: B [ ]\n";
    fs.writeFileSync(plan, original, "utf-8");

    const result = setIterationStatus(testTmpDir, 3, "completed", plan);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("3");
    expect(result.message.toLowerCase()).toContain("duplicate");
    expect(fs.readFileSync(plan, "utf-8")).toBe(original);
  });
});
