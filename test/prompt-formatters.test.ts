import { describe, test, expect } from "bun:test";
import { toFileUrl, formatTaskList, formatPhaseExcerpt, formatPlanMap } from "../src/features/phase-control/prompt-formatters";

describe("toFileUrl", () => {
  test("prefixes file:// and normalizes backslashes", () => {
    expect(toFileUrl("C:\\a\\b.md")).toBe("file://C:/a/b.md");
    expect(toFileUrl("/a/b.md")).toBe("file:///a/b.md");
  });
});

describe("formatTaskList / formatPhaseExcerpt", () => {
  const iteration = {
    id: 1, name: "API", status: "in_progress", rawContent: undefined, tasks: [
      { id: "1.1", name: "endpoint", status: "completed", children: [] },
      { id: "1.2", name: "wiring", status: "not_started", children: [
        { id: "1.2.1", name: "nested", status: "in_progress", children: [] }
      ] }
    ]
  } as any;

  test("renders markers and indented nesting", () => {
    const out = formatTaskList(iteration);
    expect(out).toContain("- [x] 1.1 endpoint");
    expect(out).toContain("- [ ] 1.2 wiring");
    expect(out).toContain("- [~] 1.2.1 nested");
  });

  test("formatPhaseExcerpt falls back to a synthesized heading when rawContent is empty", () => {
    expect(formatPhaseExcerpt(iteration)).toContain("## Iteration 1: API");
  });
});

describe("formatPlanMap", () => {
  test("marks the current iteration and reports parsed task ids", () => {
    const iterations = [
      { id: 1, name: "API", status: "completed", tasks: [{ id: "1.1", name: "x", status: "completed", children: [] }], requiredChecks: [] },
      { id: 2, name: "UI", status: "not_started", tasks: [], requiredChecks: [] }
    ] as any;
    const out = formatPlanMap(iterations, 2);
    expect(out).toContain("Iteration 1: API [x] (orientation only)");
    expect(out).toContain("Iteration 2: UI [ ] (current)");
    expect(out).toContain("no task ids parsed");
  });

  test("handles an empty plan", () => {
    expect(formatPlanMap([], 1)).toContain("No iterations parsed");
  });
});
