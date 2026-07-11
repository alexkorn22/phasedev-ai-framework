import { describe, it, expect } from "bun:test";
import { iterationCommitBlocker, finalCommitBlocker } from "../src/features/phase-control/prompt-blockers";

describe("commit blockers", () => {
  it("iterationCommitBlocker names the iteration, suggests a message, points at advance and the opt-out", () => {
    const p = iterationCommitBlocker(2, "Wire the gate", "my-change", "my-change");
    expect(p.blocked).toBe(true);
    expect(p.reason).toBe("Iteration commit required");
    expect(p.phase).toBe("iteration_validation");
    expect(p.prompt).toContain("Iteration 2 validated");
    expect(p.prompt).toContain("phasedev(my-change): iteration 2 — Wire the gate");
    expect(p.prompt).toContain('phasedev advance --change "my-change"');
    expect(p.prompt).toContain("requireIterationCommit: false");
  });

  it("iterationCommitBlocker uses a bare advance command when changeName is undefined", () => {
    const p = iterationCommitBlocker(1, "N", "slug", undefined);
    expect(p.prompt).toContain("phasedev advance");
    expect(p.prompt).not.toContain("--change");
  });

  it("finalCommitBlocker blocks before archive with a suggested final message", () => {
    const p = finalCommitBlocker("my-change", "my-change");
    expect(p.blocked).toBe(true);
    expect(p.reason).toBe("Commit required before archive");
    expect(p.phase).toBe("final_validation");
    expect(p.prompt).toContain("phasedev(my-change): final validation");
  });
});
