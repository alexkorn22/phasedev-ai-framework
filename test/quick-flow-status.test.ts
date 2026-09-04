import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getFlowStatus, renderFlowStatus } from "../src/features/flow-status/get-status";
import { listChanges, renderChanges } from "../src/features/flow-status/list-changes";

describe("quick flow status & list", () => {
  it("getFlowStatus reports Mode: quick and only lists worklog.md without false MISSING artifacts", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-status-"));
    const changeDir = path.join(root, ".phasedev", "changes", "q1");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "quick_plan", activeIteration: null, repairCycleCount: 0, flowMode: "quick" })
    );
    fs.writeFileSync(
      path.join(changeDir, "worklog.md"),
      "# Worklog\n\n## Task\nSurgical quick fix.\n"
    );

    const status = getFlowStatus(root, "q1");
    expect(status.mode).toBe("quick");
    expect(status.phase).toBe("quick_plan");
    expect(status.routeKind).toBe("quick");

    // Must contain worklog.md, must NOT contain prd.md, design.md etc.
    expect(status.artifacts.length).toBe(1);
    expect(status.artifacts[0].name).toBe("worklog.md");
    expect(status.artifacts[0].exists).toBe(true);

    const rendered = renderFlowStatus(status);
    expect(rendered).toContain("Mode: quick");
    expect(rendered).toContain("worklog.md: EXISTS");
    expect(rendered).not.toContain("prd.md: MISSING");
    expect(rendered).not.toContain("architecture/design.md: MISSING");
  });

  it("listChanges extracts task summary from worklog.md and displays [quick] badge", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pd-list-"));
    const changeDir = path.join(root, ".phasedev", "changes", "quick-fix");
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(
      path.join(changeDir, "state.json"),
      JSON.stringify({ activePhase: "quick_implementation", activeIteration: null, repairCycleCount: 0, flowMode: "quick" })
    );
    fs.writeFileSync(
      path.join(changeDir, "worklog.md"),
      "# Worklog\n\n## Task\nFix memory leak in logger stream.\n\n## Plan\nDo fix.\n"
    );

    const entries = listChanges(root);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("quick-fix");
    expect(entries[0].flowMode).toBe("quick");
    expect(entries[0].taskSummary).toBe("Fix memory leak in logger stream.");

    const rendered = renderChanges(entries);
    expect(rendered).toContain("quick-fix [quick]");
    expect(rendered).toContain("Task: Fix memory leak in logger stream.");
  });
});
