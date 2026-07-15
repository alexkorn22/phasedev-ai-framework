import { describe, it, test, expect } from "bun:test";
import {
  iterationCommitBlocker, finalCommitBlocker,
  approvalBlocker, testCommandBlocker, invalidPlanBlocker, invalidPrdBlocker,
  invalidRulesBlocker, invalidResearchBlocker, invalidDesignBlocker,
  archiveReadinessBlocker, validationFindingsBlocker, autoApprovalBlocker
} from "../src/features/phase-control/prompt-blockers";

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

describe("artifact blockers", () => {
  test("approvalBlocker names the artifact, links it, and is blocked", () => {
    const p = approvalBlocker("technical_design", "Approve the design", "/x/design.md", "design.md", "my-change");
    expect(p.blocked).toBe(true);
    expect(p.reason).toBe("Approve the design");
    expect(p.phase).toBe("technical_design");
    expect(p.prompt).toContain("file:///x/design.md");
    expect(p.prompt).toContain('phasedev advance --change "my-change"');
  });

  test("testCommandBlocker lists the missing gates", () => {
    const p = testCommandBlocker("change_intake", "/x/execution_contract.md", ["unit", "full"]);
    expect(p.blocked).toBe(true);
    expect(p.prompt).toContain("unit, full");
    expect(p.reason).toBe("Missing test command");
  });

  test("invalidPlanBlocker lists issues on the iteration_planning phase", () => {
    const p = invalidPlanBlocker("/x/iteration_plan.md", ["bad heading"], "my-change");
    expect(p.phase).toBe("iteration_planning");
    expect(p.prompt).toContain("bad heading");
  });

  test("invalidPrdBlocker targets change_intake", () => {
    expect(invalidPrdBlocker("/x/prd.md", ["missing R1"]).phase).toBe("change_intake");
  });

  test("invalidRulesBlocker targets change_intake", () => {
    expect(invalidRulesBlocker("/x/execution_contract.md", ["no gates"]).phase).toBe("change_intake");
  });

  test("invalidResearchBlocker targets code_research", () => {
    expect(invalidResearchBlocker("/x/research_facts.md", ["no facts"]).phase).toBe("code_research");
  });

  test("invalidDesignBlocker targets technical_design", () => {
    expect(invalidDesignBlocker("/x/design.md", ["no decisions"]).phase).toBe("technical_design");
  });

  test("archiveReadinessBlocker carries the title and details", () => {
    const p = archiveReadinessBlocker("Conflict", "/x/change", "diverged", undefined);
    expect(p.blocked).toBe(true);
    expect(p.prompt).toContain("Conflict");
    expect(p.prompt).toContain("diverged");
    expect(p.prompt).toContain("phasedev archive <change-name>");
    expect(p.prompt).not.toContain("--change");
    expect(p.prompt).not.toContain("phasedev advance");
  });

  test("validationFindingsBlocker targets finding_repair", () => {
    expect(validationFindingsBlocker("/x/validation_findings.md", ["no table"]).phase).toBe("finding_repair");
  });
});

describe("autoApprovalBlocker", () => {
  test("lists every artifact path as a file URL, per-phase (change_intake_approval)", () => {
    const p = autoApprovalBlocker("change_intake", "Setup approval", ["/x/prd.md", "/x/execution_contract.md"], "my-change");
    expect(p.blocked).toBe(true);
    expect(p.phase).toBe("change_intake");
    expect(p.prompt).toContain("file:///x/prd.md");
    expect(p.prompt).toContain("file:///x/execution_contract.md");
  });

  test("technical_design_approval lists the design artifact", () => {
    const p = autoApprovalBlocker("technical_design", "Design approval", ["/x/architecture/design.md"], "my-change");
    expect(p.prompt).toContain("file:///x/architecture/design.md");
  });

  test("iteration_planning_approval lists the plan artifact", () => {
    const p = autoApprovalBlocker("iteration_planning", "Plan approval", ["/x/iteration_plan.md"], "my-change");
    expect(p.prompt).toContain("file:///x/iteration_plan.md");
  });

  test("instructs approval via the auto-approve-subagent, scoped to the change", () => {
    const p = autoApprovalBlocker("technical_design", "Design approval", ["/x/design.md"], "my-change");
    expect(p.prompt).toContain('phasedev approve <file> --by "auto-approve-subagent" --change "my-change"');
  });

  test("bans manual approval and points at rerunning advance", () => {
    const p = autoApprovalBlocker("technical_design", "Design approval", ["/x/design.md"], "my-change");
    expect(p.prompt).toContain("Do NOT approve manually");
    expect(p.prompt).toContain('phasedev advance --change "my-change"');
  });

  test("uses a bare approve/advance command when changeName is undefined", () => {
    const p = autoApprovalBlocker("technical_design", "Design approval", ["/x/design.md"], undefined);
    expect(p.prompt).toContain('phasedev approve <file> --by "auto-approve-subagent"');
    expect(p.prompt).not.toContain("--change");
    expect(p.prompt).toContain("phasedev advance");
  });
});
