import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { renderKnowledgeContext } from "../src/features/phase-control/prompt-render-helpers";
import { initProject } from "../src/features/project-init/init-project";
import { cleanupTempWorkspace, createTempWorkspace } from "./helpers/temp-workspace";

describe("Knowledge context and project init", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempWorkspace("knowledge-test");
  });

  afterEach(() => {
    cleanupTempWorkspace(projectDir);
  });

  it("initProject creates knowledge directories and default seed files", () => {
    const res = initProject(projectDir);
    expect(res.ok).toBe(true);

    const knowledgeDir = path.join(projectDir, ".phasedev", "knowledge");
    const phasesDir = path.join(knowledgeDir, "phases");
    const antipatterns = path.join(knowledgeDir, "antipatterns.md");
    const generalMemory = path.join(knowledgeDir, "general-memory.md");

    expect(fs.existsSync(knowledgeDir)).toBe(true);
    expect(fs.existsSync(phasesDir)).toBe(true);
    expect(fs.existsSync(antipatterns)).toBe(true);
    expect(fs.existsSync(generalMemory)).toBe(true);
  });

  it("renderKnowledgeContext returns empty when files only have placeholder comments", () => {
    initProject(projectDir);
    const context = renderKnowledgeContext(projectDir, "implementation");
    expect(context).toBe("");
  });

  it("renderKnowledgeContext renders content when real lessons are added", () => {
    initProject(projectDir);
    const knowledgeDir = path.join(projectDir, ".phasedev", "knowledge");
    fs.appendFileSync(path.join(knowledgeDir, "antipatterns.md"), "\n- Never mutate global state in handlers\n");
    fs.appendFileSync(path.join(knowledgeDir, "general-memory.md"), "\n- Use bun for fast test execution\n");

    const phaseMemoryPath = path.join(knowledgeDir, "phases", "implementation.md");
    fs.writeFileSync(phaseMemoryPath, "# Implementation Gotchas\n\n- Mock external API responses\n");

    const context = renderKnowledgeContext(projectDir, "implementation");
    expect(context).toContain("=== PROJECT KNOWLEDGE & ANTI-PATTERNS ===");
    expect(context).toContain("Never mutate global state in handlers");
    expect(context).toContain("Use bun for fast test execution");
    expect(context).toContain("Mock external API responses");

    // Phase memory for other phase is not injected
    const designContext = renderKnowledgeContext(projectDir, "technical_design");
    expect(designContext).not.toContain("Mock external API responses");
    expect(designContext).toContain("Never mutate global state in handlers");
  });
});
