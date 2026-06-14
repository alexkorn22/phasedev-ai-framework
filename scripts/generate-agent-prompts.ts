import * as fs from "fs";
import * as path from "path";
import { getInitPrompt, getNextPrompt } from "../src/features/stage-control";
import { loadConfig, resolveConfigPath } from "../src/entities/config/config";
import { buildChangePaths, ChangePaths } from "../src/entities/change/paths";
import { Stage } from "../src/entities/stage/types";

interface StageOutput {
  file: string;
  bytes: number;
  stage: Stage;
  sourceProjectPath: string;
  generatedProjectPath: string;
}

interface Options {
  projectPath: string;
  outDir: string;
  configPath?: string;
}

const repoRoot = path.resolve(__dirname, "..");
const generatedChangeName = "generated-agent-prompts";

function parseArgs(args: string[]): Options {
  let projectPath = process.cwd();
  let outDir = path.join(repoRoot, "temp", "generated-agent-prompts");
  let configPath: string | undefined;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--project-path" && next) {
      projectPath = next;
      index++;
      continue;
    }
    if (arg === "--out-dir" && next) {
      outDir = next;
      index++;
      continue;
    }
    if (arg === "--config" && next) {
      configPath = next;
      index++;
    }
  }

  return {
    projectPath: path.resolve(projectPath),
    outDir: path.resolve(outDir),
    configPath: configPath ? path.resolve(configPath) : undefined
  };
}

function resetDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function isSameOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function copyProject(source: string, target: string, excludedRoots: string[]): void {
  const resolvedExcludedRoots = excludedRoots.map(excluded => path.resolve(excluded));
  fs.cpSync(source, target, {
    recursive: true,
    filter: sourcePath => {
      const resolvedSourcePath = path.resolve(sourcePath);
      if (resolvedExcludedRoots.some(excluded => isSameOrInside(resolvedSourcePath, excluded))) {
        return false;
      }

      const normalized = sourcePath.replace(/\\/g, "/");
      return !normalized.includes("/node_modules/") &&
        !normalized.includes("/.git/");
    }
  });
}

function savePrompt(
  promptsDir: string,
  fileName: string,
  stage: Stage,
  promptText: string,
  options: Options,
  generatedProjectPath: string
): StageOutput {
  const filePath = path.join(promptsDir, fileName);
  writeFile(filePath, promptText);
  return {
    file: filePath,
    bytes: fs.statSync(filePath).size,
    stage,
    sourceProjectPath: options.projectPath,
    generatedProjectPath
  };
}

function configFor(projectPath: string, options: Options) {
  return loadConfig(resolveConfigPath(projectPath, options.configPath));
}

function saveNextPrompt(
  projectPath: string,
  promptsDir: string,
  fileName: string,
  expectedStage: Exclude<Stage, "init">,
  options: Options
): StageOutput {
  const prompt = getNextPrompt(projectPath, configFor(projectPath, options));
  if (prompt.stage !== expectedStage) {
    throw new Error(`Expected ${expectedStage} prompt, got ${prompt.stage} for ${fileName}.`);
  }

  return savePrompt(promptsDir, fileName, prompt.stage, prompt.prompt, options, projectPath);
}

function approvedArtifact(body: string): string {
  return `---\napproved: true\n---\n${body.trim()}\n`;
}

function prdBody(): string {
  return `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Generate every PhaseDev stage prompt through the real flow controller. |
| Target state | Each stage prompt is rendered from a valid controller state. |
| Risk boundaries | Prompt generation uses an isolated copied project and does not modify the source project. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | The generator must render prompts by calling the real PhaseDev prompt builders. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | Output contains one saved prompt file for every configured PhaseDev stage. | review |
`;
}

function rulesBody(): string {
  return `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test\` |
| phase | \`bun test\` |
| full | \`bun test\` |
`;
}

function researchBody(): string {
  return `# Research Facts

## PRD Intent Trace

| Field | PRD Value | Status | Evidence | Notes |
|---|---|---|---|---|
| Change type | fix | not_applicable | prd-only | Classification comes from PRD. |
| Why | Generate every PhaseDev stage prompt through the real flow controller. | not_applicable | prd-only | User intent is encoded in PRD. |
| Target state | Each stage prompt is rendered from a valid controller state. | confirmed | F1 | The controller entrypoint is available in the copied project. |
| Risk boundaries | Prompt generation uses an isolated copied project and does not modify the source project. | confirmed | F2 | The scaffold writes only inside the generated project copy. |

## Requirements & Success Criteria Trace

| ID | Status | Code Evidence | Spec Context | Gaps/Blockers |
|---|---|---|---|---|
| R1 | confirmed | F1 | none | none |
| SC1 | confirmed | F2 | none | none |

## Source Facts

| Fact ID | Type | Source | Fact | Supports |
|---|---|---|---|---|
| F1 | code | \`package.json:1\` | The copied project has repository files available for controller-based prompt generation. | R1 |
| F2 | code | \`package.json:1\` | The generation scaffold runs in an isolated copied project under the output directory. | SC1 |

## Research Gaps & Blockers

No non-blocking gaps.
`;
}

function designBody(): string {
  return `# Design

## Executive Summary

| Area | Decision |
|---|---|
| Approval scope | Generate stage prompts from controller states in one isolated scaffold. |
| Out of scope | Product implementation changes in the source project. |
| Key decision | D1 uses the real flow controller as the only prompt renderer. |
| Validation | Manifest and saved prompt files prove every stage was rendered. |

## Traceability Mapping

| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |
|---|---|---|---|---|
| R1 | F1 | D1 | Prompt text comes from PhaseDev controller calls, not handwritten prompt files. | Plan advances the scaffold one stage at a time. |
| SC1 | F2 | D1 | Output directory stores a prompt per stage plus manifest. | Plan verifies all expected stages are saved. |

## Architecture Package Map
| File | Purpose | Visual content | Review priority |
|---|---|---|---|
| \`architecture/design.md\` | Entry point and approval summary for prompt generation design. | traceability table, decision table | high |

## Key Design Decisions

| Decision ID | Decision | Rationale | Applies To | Impacts |
|---|---|---|---|---|
| D1 | Render prompts only via PhaseDev controller APIs. | This prevents generated prompt output from diverging from runtime behavior. | R1, SC1 | generation scaffold, prompt manifest |

## Contracts, Interfaces & Boundaries

| Boundary | Contract | Applies To |
|---|---|---|
| Prompt renderer | Each prompt is produced by getInitPrompt or getNextPrompt for the generated project state. | D1 |

## Risks & Open Questions
None.
`;
}

function planBody(status: "implementation" | "phase_validation" | "final_validation" | "archive"): string {
  const phaseStatus = status === "implementation" ? " " : status === "phase_validation" ? "~" : "x";
  const taskStatus = status === "implementation" ? " " : "x";
  const evidenceResult = status === "implementation" ? "pending" : "passed";
  const evidenceText = status === "implementation" ? "not run yet" : "prompt generation check passed";

  return `# Implementation Plan

## Approval Summary

| Area | Decision |
|---|---|
| Approval scope | Generate all PhaseDev stage prompts from controller states. |
| Out of scope | Mutating the source project. |
| Sequencing risk | Low; scaffold state is isolated under the output directory. |
| Validation | Use the configured full check command from rules.md. |

## Generation Bundle

| Area | Required | Plan |
|---|---|---|
| Production code | yes | Exercise controller prompt generation through scaffold states. |
| Tests | yes | Run configured PhaseDev test command after scaffold generation. |
| Docs/specs | not_applicable | No source documentation changes are required. |
| Migrations | not_applicable | No persistence migration is involved. |
| Feature flags/rollout | not_applicable | No rollout controls are involved. |
| Observability | not_applicable | Manifest output is sufficient for this scaffold. |
| Rollback path | not_applicable | Delete the generated output directory. |

## Phase Overview

| Phase | Goal | Main work items | Required checks |
|---|---|---|---|
| Phase 1 | Generate prompt files. | 1.1 | unit |

## Phase 1: Prompt Generation [${phaseStatus}]

### Goal

Generate all stage prompts from real controller calls. Satisfies R1, SC1, and D1.

### Expected Change Surface

| Area / Path Pattern | Change Type | Ownership | Trace |
|---|---|---|---|
| \`temp/generated-agent-prompts/**\` | create | Prompt generation output | R1, SC1, D1 |

### Tasks

- [${taskStatus}] 1.1 Render and save every stage prompt

### Checks

- unit: \`bun test\`

### Check Evidence

| Check | Command Or Method | Result | Evidence | Notes |
|---|---|---|---|---|
| unit | \`bun test\` | ${evidenceResult} | ${evidenceText} | scaffold |
`;
}

function validationFindings(
  verdict: "ready" | "repair_required",
  type: "phase" | "final",
  rows = ""
): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-06-14
---

| ID | Status | Severity | Class | Phase | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}

function writeBaseArtifacts(paths: ChangePaths): void {
  writeFile(paths.prdPath, approvedArtifact(prdBody()));
  writeFile(paths.rulesPath, approvedArtifact(rulesBody()));
}

function writeResearch(paths: ChangePaths): void {
  writeFile(paths.researchPath, researchBody());
}

function writeDesign(paths: ChangePaths): void {
  writeFile(paths.designPath, approvedArtifact(designBody()));
}

function writePlan(paths: ChangePaths, status: "implementation" | "phase_validation" | "final_validation" | "archive"): void {
  writeFile(paths.planPath, approvedArtifact(planBody(status)));
}

function writeRepairFindings(paths: ChangePaths): void {
  writeFile(
    paths.findingsPath,
    validationFindings(
      "repair_required",
      "phase",
      "| F1 | open | MUST-FIX | implementation | Phase 1 | Saved prompt manifest misses a stage. | Restore the missing generated prompt. |\n"
    )
  );
}

function writePhaseReadyFindings(paths: ChangePaths): void {
  writeFile(paths.findingsPath, validationFindings("ready", "phase"));
}

function writeFinalReadyFindings(paths: ChangePaths): void {
  writeFile(paths.findingsPath, validationFindings("ready", "final"));
}

function writeCombinedPromptFile(manifest: StageOutput[], combinedPath: string): void {
  writeFile(
    combinedPath,
    manifest
      .map(entry => [
        `# ${path.basename(entry.file, ".md")}`,
        "",
        fs.readFileSync(entry.file, "utf-8").trimEnd(),
        ""
      ].join("\n"))
      .join("\n---\n\n")
  );
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const promptsDir = path.join(options.outDir, "prompts");
  const generatedProjectPath = path.join(options.outDir, "generated-project");
  const manifestPath = path.join(options.outDir, "manifest.json");
  const combinedPath = path.join(options.outDir, "all-agent-prompts.md");

  resetDir(options.outDir);
  fs.mkdirSync(promptsDir, { recursive: true });
  copyProject(options.projectPath, generatedProjectPath, [options.outDir, generatedProjectPath]);
  fs.rmSync(path.join(generatedProjectPath, ".phasedev", "changes"), { recursive: true, force: true });

  const changeDir = path.join(generatedProjectPath, ".phasedev", "changes", generatedChangeName);
  const paths = buildChangePaths(changeDir);
  const manifest: StageOutput[] = [];

  const initPrompt = getInitPrompt(generatedProjectPath, configFor(generatedProjectPath, options));
  manifest.push(savePrompt(promptsDir, "00-init.md", initPrompt.stage, initPrompt.prompt, options, generatedProjectPath));

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "01-stage-0-setup.md", "setup", options));
  writeBaseArtifacts(paths);

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "02-stage-1-research.md", "research", options));
  writeResearch(paths);

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "03-stage-2-design.md", "design", options));
  writeDesign(paths);

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "04-stage-3-plan.md", "plan", options));
  writePlan(paths, "implementation");

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "05-stage-4-implementation.md", "implementation", options));
  writePlan(paths, "phase_validation");

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "06-stage-5a-phase-validation.md", "phase_validation", options));
  writePlan(paths, "final_validation");
  writePhaseReadyFindings(paths);

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "07-stage-5b-final-validation.md", "final_validation", options));
  writeRepairFindings(paths);

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "08-stage-5r-repair.md", "repair", options));
  writePlan(paths, "archive");
  writeFinalReadyFindings(paths);

  manifest.push(saveNextPrompt(generatedProjectPath, promptsDir, "09-stage-6-archive.md", "archive", options));

  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeCombinedPromptFile(manifest, combinedPath);

  console.log(JSON.stringify({
    projectPath: options.projectPath,
    generatedProjectPath,
    outDir: options.outDir,
    promptsDir,
    manifestPath,
    combinedPath,
    manifest
  }, null, 2));
}

main();
