import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createHash } from "crypto";
import { getInitPrompt } from "../src/features/phase-control";
import { getRoutePrompt } from "../src/features/phase-control/get-route-prompt";
import { startArchiveStage } from "../src/features/phase-control/archive-stage";
import { loadConfig, resolveConfigPath } from "../src/entities/config/config";
import { buildChangePaths, ChangePaths } from "../src/entities/change/paths";
import { Phase } from "../src/entities/phase/types";
import { shellQuote } from "../src/shared/shell/shell-quote";

interface StageOutput {
  file: string;
  bytes: number;
  phase: Phase;
  sourceProjectPath: string;
  workingProjectPath: string;
}

interface Options {
  projectPath: string;
  outDir: string;
  configPath?: string;
  allowMutation: boolean;
}

const repoRoot = path.resolve(__dirname, "..");
const generatedChangeName = "generated-agent-prompts";
const flowArtifactRelativePaths = [
  "prd.md",
  "execution_contract.md",
  "research_facts.md",
  "iteration_plan.md",
  "validation_findings.md",
  path.join("architecture", "design.md")
];

function defaultProjectPath(): string {
  return repoRoot;
}

function parseArgs(args: string[]): Options {
  let projectPath = defaultProjectPath();
  let outDir = path.join(repoRoot, "temp", "generated-agent-prompts");
  let configPath: string | undefined;
  let allowMutation = false;

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
      continue;
    }
    if (arg === "--allow-mutation") {
      allowMutation = true;
    }
  }

  return {
    projectPath: path.resolve(projectPath),
    outDir: path.resolve(outDir),
    configPath: configPath ? path.resolve(configPath) : undefined,
    allowMutation
  };
}

// This script scaffolds a fake project under workingProjectPath, resets the
// out-dir, and runs the archive mutation (startArchiveStage). That is only
// safe on a scratch scaffold, never on a real project. Require --out-dir to
// sit under a `temp/` segment unless the caller explicitly opts in with
// --allow-mutation.
function assertMutationIsSafe(options: Options, workingProjectPath: string): void {
  if (options.allowMutation) {
    return;
  }

  const scratchRoots = [path.join(repoRoot, "temp"), os.tmpdir()];
  const isScratchPath = scratchRoots.some(root => workingProjectPath.startsWith(`${root}${path.sep}`));
  if (!isScratchPath) {
    throw new Error(
      `generate-agent-prompts.ts refuses to run against "${workingProjectPath}": it is not under a "temp/" scratch directory. ` +
      "This script resets directories and runs the archive mutation on the scaffold. " +
      "Pass --out-dir under temp/, or pass --allow-mutation to override at your own risk."
    );
  }
}

function resetDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function ensureSandboxSupportFiles(projectPath: string): void {
  const packageJsonPath = path.join(projectPath, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    writeFile(packageJsonPath, `${JSON.stringify({ name: "generated-agent-prompts-sandbox", private: true }, null, 2)}\n`);
  }
}

function generatedWorkingProjectPath(options: Options): string {
  return path.join(options.outDir, "sandbox-project");
}

function toFileUrl(absolutePath: string): string {
  return `file://${absolutePath.replace(/\\/g, "/")}`;
}

function snapshotPromptArtifactLinks(promptText: string, options: Options, workingProjectPath: string, fileName: string, phase: Phase): string {
  const sourceChangeDir = path.join(workingProjectPath, ".phasedev", "changes", generatedChangeName);
  const snapshotProjectPath = path.join(options.outDir, "artifact-snapshots", path.basename(fileName, ".md"));
  const snapshotChangeDir = path.join(snapshotProjectPath, ".phasedev", "changes", generatedChangeName);
  let rewrittenPrompt = promptText;

  for (const relativePath of flowArtifactRelativePaths) {
    const sourcePath = path.join(sourceChangeDir, relativePath);
    const snapshotPath = path.join(snapshotChangeDir, relativePath);

    if (fs.existsSync(sourcePath)) {
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
      fs.copyFileSync(sourcePath, snapshotPath);
    }

    rewrittenPrompt = rewrittenPrompt
      .split(toFileUrl(sourcePath)).join(toFileUrl(snapshotPath))
      .split(sourcePath).join(snapshotPath);
  }

  if (phase === "iteration_validation" || phase === "final_validation" || phase === "finding_repair") {
    rewrittenPrompt = rewrittenPrompt
      .split(`--project-path ${shellQuote(workingProjectPath)}`)
      .join(`--project-path ${shellQuote(snapshotProjectPath)}`);
  }

  const bundleNote = bundleSnapshotNote(phase);
  if (bundleNote) {
    rewrittenPrompt = `${rewrittenPrompt.trimEnd()}\n\n${bundleNote}\n`;
  }

  return rewrittenPrompt;
}

// These notes only make sense for the generated-bundle fixtures, where linked
// artifacts and self-check project paths are rewritten to snapshot fixture
// locations. Live `phasedev phase` prompts point at the real active change, so
// the notes are injected here by the generator instead of living in templates.
function bundleSnapshotNote(phase: Phase): string {
  switch (phase) {
    case "iteration_validation":
      return "Generated bundle note: If only a generated prompt bundle is being evaluated and its linked sandbox files are unavailable, use the embedded artifact contract and current phase label in this prompt; mention the missing sandbox files only as an evaluation limitation, not as a validation finding.";
    case "final_validation":
      return "Generated bundle note: snapshot Output paths and snapshot self-check project paths are fixture paths for bundle self-check coherence; during live `phasedev phase`, use the active change folder and Output path provided by the live prompt instead.";
    case "finding_repair":
      return "Generated bundle note: in generated prompt bundles, snapshot Output paths and snapshot self-check project paths are fixture paths for bundle self-check coherence; during live `phasedev phase`, use the active change folder and Output path provided by the live prompt instead.";
    default:
      return "";
  }
}

function savePrompt(
  promptsDir: string,
  fileName: string,
  phase: Phase,
  promptText: string,
  options: Options,
  workingProjectPath: string
): StageOutput {
  const filePath = path.join(promptsDir, fileName);
  writeFile(filePath, snapshotPromptArtifactLinks(promptText, options, workingProjectPath, fileName, phase));
  return {
    file: filePath,
    bytes: fs.statSync(filePath).size,
    phase,
    sourceProjectPath: options.projectPath,
    workingProjectPath
  };
}

function sourceConfig(options: Options) {
  return loadConfig(resolveConfigPath(options.projectPath, options.configPath));
}

function saveNextPrompt(
  projectPath: string,
  promptsDir: string,
  fileName: string,
  expectedPhase: Exclude<Phase, "init">,
  options: Options,
  config: ReturnType<typeof loadConfig>
): StageOutput {
  const prompt = getRoutePrompt(projectPath, config);
  if (prompt.phase !== expectedPhase) {
    throw new Error(`Expected ${expectedPhase} prompt, got ${prompt.phase} for ${fileName}.`);
  }

  return savePrompt(promptsDir, fileName, prompt.phase, prompt.prompt, options, projectPath);
}

function approvedArtifact(body: string): string {
  const trimmedBody = body.trim();
  const contentHash = createHash("sha256").update(trimmedBody, "utf-8").digest("hex").slice(0, 12);
  return `---\napproved: true\napproved_hash: "${contentHash}"\n---\n${trimmedBody}\n`;
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

## Constraints
None.

## Verification Gates
Standard test gates apply.

## Manual Checks
None.

## Environment Notes
Test fixture only.
`;
}

function researchBody(factSource: string): string {
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
| F1 | code | \`${factSource}\` | The sandbox project has repository files available for controller-based prompt generation. | R1 |
| F2 | code | \`${factSource}\` | The generation scaffold runs in an isolated generated project under the output directory. | SC1 |

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
| Prompt renderer | Each prompt is produced by getInitPrompt or getRoutePrompt for the generated project state. | D1 |

## Risks & Open Questions
None.
`;
}

function planBody(status: "implementation" | "iteration_validation" | "final_validation" | "archive"): string {
  const phaseStatus = status === "implementation" ? " " : status === "iteration_validation" ? "~" : "x";
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
| Validation | Use the configured full check command from execution_contract.md. |

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

## Iteration Overview

| Iteration | Goal | Main work items | Required checks |
|---|---|---|---|
| Iteration 1 | Generate prompt files. | 1.1 | unit |

## Iteration 1: Prompt Generation [${phaseStatus}]

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
  type: "iteration" | "final",
  rows = ""
): string {
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-06-14
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}

function writeBaseArtifacts(paths: ChangePaths): void {
  writeFile(paths.prdPath, approvedArtifact(prdBody()));
  writeFile(paths.executionContractPath, approvedArtifact(rulesBody()));
}

function writeResearch(paths: ChangePaths, projectPath: string): void {
  const factSource = fs.existsSync(path.join(projectPath, "math.ts"))
    ? "math.ts:1"
    : "package.json:1";
  writeFile(paths.researchPath, researchBody(factSource));
}

function writeDesign(paths: ChangePaths): void {
  writeFile(paths.designPath, approvedArtifact(designBody()));
}

function writePlan(paths: ChangePaths, status: "implementation" | "iteration_validation" | "final_validation" | "archive"): void {
  writeFile(paths.iterationPlanPath, approvedArtifact(planBody(status)));
}

function writeRepairFindings(paths: ChangePaths): void {
  writeFile(
    paths.findingsPath,
    validationFindings(
      "repair_required",
      "iteration",
      "| F1 | open | MUST-FIX | implementation | Phase 1 | Saved prompt manifest misses a stage. | Restore the missing generated prompt. |\n"
    )
  );
}

function writePhaseReadyFindings(paths: ChangePaths): void {
  writeFile(paths.findingsPath, validationFindings("ready", "iteration"));
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

function restoreActiveChangeArtifactSnapshot(changeDir: string): void {
  const archiveRoot = path.join(path.dirname(changeDir), "archive");
  if (!fs.existsSync(archiveRoot) || fs.existsSync(changeDir)) {
    return;
  }

  const archivedChangeDir = fs.readdirSync(archiveRoot)
    .filter(entry => entry.endsWith(`-${generatedChangeName}`))
    .map(entry => path.join(archiveRoot, entry))
    .filter(entry => fs.statSync(entry).isDirectory())
    .sort()
    .at(-1);

  if (!archivedChangeDir) {
    return;
  }

  for (const relativePath of flowArtifactRelativePaths) {
    const sourcePath = path.join(archivedChangeDir, relativePath);
    if (fs.existsSync(sourcePath)) {
      const targetPath = path.join(changeDir, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const promptsDir = path.join(options.outDir, "prompts");
  const manifestPath = path.join(options.outDir, "manifest.json");
  const combinedPath = path.join(options.outDir, "all-agent-prompts.md");
  const workingProjectPath = generatedWorkingProjectPath(options);
  assertMutationIsSafe(options, workingProjectPath);

  resetDir(options.outDir);
  fs.mkdirSync(promptsDir, { recursive: true });
  ensureSandboxSupportFiles(workingProjectPath);

  const changeDir = path.join(workingProjectPath, ".phasedev", "changes", generatedChangeName);
  const paths = buildChangePaths(changeDir);
  const manifest: StageOutput[] = [];
  const config = sourceConfig(options);

  const initPrompt = getInitPrompt(workingProjectPath, config);
  manifest.push(savePrompt(promptsDir, "00-init.md", initPrompt.phase, initPrompt.prompt, options, workingProjectPath));

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "01-stage-0-setup.md", "change_intake", options, config));
  writeBaseArtifacts(paths);

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "02-stage-1-research.md", "code_research", options, config));
  writeResearch(paths, workingProjectPath);

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "03-stage-2-design.md", "technical_design", options, config));
  writeDesign(paths);

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "04-stage-3-plan.md", "iteration_planning", options, config));
  writePlan(paths, "implementation");

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "05-stage-4-implementation.md", "implementation", options, config));
  writePlan(paths, "iteration_validation");

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "06-stage-5a-phase-validation.md", "iteration_validation", options, config));
  writePlan(paths, "final_validation");
  writePhaseReadyFindings(paths);

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "07-stage-5b-final-validation.md", "final_validation", options, config));
  writeRepairFindings(paths);

  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "08-stage-5r-repair.md", "finding_repair", options, config));
  writePlan(paths, "archive");
  writeFinalReadyFindings(paths);

  // getRoutePrompt is read-only: the archive mutation (move + .phase-archive.json)
  // is owned by advance/startArchiveStage. Run it explicitly so the archive
  // prompt renders against the pending archive, like after a real advance.
  startArchiveStage(workingProjectPath, changeDir, new Date(), config);
  manifest.push(saveNextPrompt(workingProjectPath, promptsDir, "09-stage-6-archive.md", "archive", options, config));

  restoreActiveChangeArtifactSnapshot(changeDir);

  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeCombinedPromptFile(manifest, combinedPath);

  console.log(JSON.stringify({
    projectPath: options.projectPath,
    workingProjectPath,
    outDir: options.outDir,
    promptsDir,
    manifestPath,
    combinedPath,
    manifest
  }, null, 2));
}

main();
