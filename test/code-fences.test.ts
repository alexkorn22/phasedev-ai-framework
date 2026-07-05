import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { blankFencedCodeLines, fencedCodeLineMask } from "../src/shared/markdown/code-fences";
import { parsePlan } from "../src/entities/iteration-plan/parse-plan";
import { updateIterationStatus } from "../src/entities/iteration-plan/update-iteration-status";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

let tmpDir: string;

beforeEach(() => {
  tmpDir = createTempWorkspace("code-fences");
});

afterEach(() => {
  cleanupTempWorkspace(tmpDir);
});

describe("fencedCodeLineMask", () => {
  test("masks fence delimiters and their content, including ~~~ fences", () => {
    const lines = ["a", "```ts", "code", "```", "b", "~~~", "more", "~~~", "c"];
    expect(fencedCodeLineMask(lines)).toEqual([false, true, true, true, false, true, true, true, false]);
  });

  test("an unclosed fence extends to the end of the input", () => {
    const lines = ["a", "```", "code", "still code"];
    expect(fencedCodeLineMask(lines)).toEqual([false, true, true, true]);
  });

  test("a shorter closing fence does not close a longer opening fence", () => {
    const lines = ["````", "```", "inner", "````", "outside"];
    expect(fencedCodeLineMask(lines)).toEqual([true, true, true, true, false]);
  });

  test("blankFencedCodeLines keeps indices stable", () => {
    const lines = ["keep", "```", "drop", "```", "keep too"];
    expect(blankFencedCodeLines(lines)).toEqual(["keep", "", "", "", "keep too"]);
  });
});

describe("fence-aware plan parsing", () => {
  test("a fenced iteration heading and task never become live plan structure", () => {
    const planPath = path.join(tmpDir, "iteration_plan.md");
    fs.writeFileSync(planPath, `# Plan

## Iteration 1: Real [ ]

### Goal

Show a fenced example:

\`\`\`markdown
## Iteration 9: Example [ ]
- [ ] 9.1 example task
\`\`\`

### Tasks

- [ ] 1.1 Real task
`, "utf-8");

    const plan = parsePlan(planPath);

    expect(plan.length).toBe(1);
    expect(plan[0].id).toBe(1);
    expect(plan[0].tasks.length).toBe(1);
    expect(plan[0].tasks[0].id).toBe("1.1");
    // rawContent keeps the fenced example intact for prompt excerpts
    expect(plan[0].rawContent).toContain("## Iteration 9: Example [ ]");
  });

  test("updateIterationStatus edits the real heading, not a fenced example above it", () => {
    const planPath = path.join(tmpDir, "iteration_plan.md");
    fs.writeFileSync(planPath, `# Plan

\`\`\`markdown
## Iteration 1: Example [ ]
\`\`\`

## Iteration 1: Real [ ]

- [ ] 1.1 Task
`, "utf-8");

    updateIterationStatus(planPath, 1, "completed");

    const content = fs.readFileSync(planPath, "utf-8");
    expect(content).toContain("## Iteration 1: Example [ ]");
    expect(content).toContain("## Iteration 1: Real [x]");
  });
});
