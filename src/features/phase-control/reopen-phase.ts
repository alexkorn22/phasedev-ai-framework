import * as fs from "fs";
import { loadFlowState, saveFlowState, ActivePhase } from "../../entities/change/flow-state";
import { findActiveChangeDir } from "../../entities/change/active-change";
import { buildChangePaths } from "../../entities/change/paths";
import { readFrontmatter, matchFrontmatterBlock } from "../../shared/markdown/frontmatter";
import { normalizeLineEndings } from "../../shared/markdown/normalize-line-endings";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";

export type ReopenablePhase = "design" | "plan";

const REOPEN_MAP: Record<ReopenablePhase, { artifactRelPath: string; targetPhase: ActivePhase }> = {
  design: { artifactRelPath: "architecture/design.md", targetPhase: "technical_design" },
  plan:   { artifactRelPath: "iteration_plan.md",       targetPhase: "iteration_planning" },
};

export interface ReopenResult {
  ok: boolean;
  message: string;
}

export function reopenPhase(projectPath: string, phase: ReopenablePhase): ReopenResult {
  const state = loadFlowState(projectPath);
  if (!state) {
    return { ok: false, message: "No active change. Run: phasedev create-change <name>." };
  }

  const changeDir = findActiveChangeDir(projectPath);
  if (!changeDir) {
    return { ok: false, message: "Cannot locate active change directory." };
  }

  const paths = buildChangePaths(changeDir);
  const config = REOPEN_MAP[phase];
  const artifactPath = phase === "design" ? paths.designPath : paths.iterationPlanPath;

  if (!fs.existsSync(artifactPath)) {
    return { ok: false, message: `${config.artifactRelPath} does not exist. Nothing to reopen.` };
  }

  // Reset approved: false in the artifact frontmatter
  const content = normalizeLineEndings(fs.readFileSync(artifactPath, "utf-8"));
  const block = matchFrontmatterBlock(content);
  if (!block) {
    return { ok: false, message: `${config.artifactRelPath} has no frontmatter. Cannot reopen.` };
  }

  const fm = readFrontmatter(artifactPath);
  if (!fm || fm.approved !== true && String(fm.approved).toLowerCase() !== "true") {
    return { ok: false, message: `${config.artifactRelPath} is not approved. Nothing to reopen.` };
  }

  // Remove approved, approved_by, approved_hash from frontmatter
  const updatedYaml = block.yaml
    .split("\n")
    .filter(line => !/^(approved|approved_by|approved_hash)\s*:/.test(line.trimStart()))
    .join("\n");

  // Ensure approved: false is present
  const newYaml = `approved: false\napproved_by: ""\n${updatedYaml}`;
  const newContent = `${block.prefix}---\n${newYaml}\n---${content.slice(block.endIndex)}`;
  writeFileAtomic(artifactPath, newContent);

  // Move state back to the target phase
  saveFlowState(projectPath, { activePhase: config.targetPhase, activeIteration: null, repairCycleCount: 0 });

  return {
    ok: true,
    message: `Reopened ${phase}. Active phase reset to ${config.targetPhase}. ${config.artifactRelPath} preserved; approval cleared. Run: phasedev phase.`
  };
}
