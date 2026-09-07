import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { digestCommand } from "../src/entities/execution-receipts/command-digest";
import { parseReceiptScope, formatReceiptScope } from "../src/entities/execution-receipts/scope";
import {
  applyClaimReceipt,
  cancelReceiptRecord,
  completeReceiptRecord
} from "../src/entities/execution-receipts/transitions";
import { emptyExecutionReceiptsFile, findCurrentReceipt, parseExecutionReceiptsFile } from "../src/entities/execution-receipts/receipt-store";
import {
  finalValidationReceiptBlockers,
  iterationValidationReceiptBlockers
} from "../src/entities/execution-receipts/prerequisites";
import { requiresManualAcceptance } from "../src/entities/execution-receipts/manual-acceptance";
import {
  buildDiffDigestEntries,
  computeDiffDigest
} from "../src/features/receipt-ops/compute-diff-digest";
import { claimReceipt } from "../src/features/receipt-ops/claim-receipt";
import { completeReceipt } from "../src/features/receipt-ops/complete-receipt";
import { cancelReceipt } from "../src/features/receipt-ops/cancel-receipt";
import { loadExecutionReceiptsFile } from "../src/features/receipt-ops/receipt-context";
import { receiptStatus, validationReceiptBlockers } from "../src/features/receipt-ops/receipt-status";
import { checkValidationCompletion } from "../src/features/phase-control/check-flow";
import { validatePhaseExit } from "../src/features/phase-control/phase-validators";
import { buildChangePaths } from "../src/entities/change/paths";
import { writeFlowState } from "../src/entities/change/flow-state";
import { renderHelp } from "../src/features/cli-help/render-help";
import { CLI_COMMAND_NAMES } from "../src/features/cli-help/cli-command-names";

const cliPath = path.resolve(__dirname, "..", "src", "cli.ts");
const workspaceTempRoot = path.join(__dirname, "..", ".test-workspace");

function createGitWorkspace(label: string): string {
  const dir = path.join(workspaceTempRoot, `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupGitWorkspace(workspacePath: string | undefined): void {
  if (!workspacePath || !workspacePath.startsWith(workspaceTempRoot)) {
    return;
  }
  fs.rmSync(workspacePath, { recursive: true, force: true });
}

function makeGitRepo(dir: string): void {
  const run = (args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf-8" });
  run(["init"]);
  run(["config", "user.email", "test@example.com"]);
  run(["config", "user.name", "Test"]);
  run(["config", "commit.gpgsign", "false"]);
}

function gitCommitAll(dir: string, message: string): string {
  spawnSync("git", ["-C", dir, "add", "-A"], { encoding: "utf-8" });
  spawnSync("git", ["-C", dir, "commit", "-m", message, "--no-gpg-sign"], { encoding: "utf-8" });
  return spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
}

function runCli(args: string[], cwd: string): { stdout: string; exitCode: number } {
  const result = spawnSync("bun", [cliPath, ...args], { cwd, encoding: "utf-8" });
  return { stdout: result.stdout + result.stderr, exitCode: result.status ?? 1 };
}

function writeApproved(filePath: string, body: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
}

function seedChange(projectPath: string, options?: { manualAcceptance?: boolean }) {
  const changeDir = path.join(projectPath, ".phasedev", "changes", "sample-change");
  fs.mkdirSync(path.join(changeDir, "architecture"), { recursive: true });
  fs.mkdirSync(path.join(projectPath, ".phasedev"), { recursive: true });
  fs.writeFileSync(path.join(projectPath, ".phasedev", "config.yaml"), "autoApprove: false\nblockingSeverity: must_fix\nrequireIterationCommit: false\nroles: {}\n", "utf-8");

  writeApproved(path.join(changeDir, "prd.md"), `# PRD\n\n## Intent\n| Field | Value |\n|---|---|\n| Change type | fix |\n| Why | test |\n| Target state | test |\n| Risk boundaries | none |\n\n## Requirements\n| ID | Requirement |\n|---|---|\n| R1 | req |\n\n## Success Criteria\n| ID | Verifies | Criterion | Evidence |\n|---|---|---|---|\n| SC1 | R1 | ok | review |\n`);
  writeApproved(path.join(changeDir, "execution_contract.md"), `# Rules\n\n## Test Commands\n| Gate | Command |\n|---|---|\n| unit | \`bun test unit\` |\n| phase | \`bun test phase\` |\n| full | \`bun test full\` |\n\n## Environment Notes\nnone\n`);
  fs.writeFileSync(path.join(changeDir, "research_facts.md"), "# Research\n", "utf-8");
  writeApproved(path.join(changeDir, "architecture", "design.md"), "# Design\n", true);
  const deferred = options?.manualAcceptance ? "\n- SC2 [Deferred to Final Validation / Manual Acceptance]\n" : "";
  writeApproved(path.join(changeDir, "iteration_plan.md"), `---\napproved: true\napproved_by: tester\n---\n# Plan\n\n## Iteration 1: API [~]\n- [x] 1.1 task\n\n### Checks\n| Check | Command |\n|---|---|\n| unit | bun test unit |\n\n### Check Evidence\n| Check | Command | Result | Evidence |\n|---|---|---|---|\n| unit | bun test unit | passed | ok |\n${deferred}`, true);
  fs.writeFileSync(path.join(changeDir, "validation_findings.md"), `---\ntype: iteration\nverdict: pending\napproved: false\ndate: 2026-01-01\n---\n\n| ID | Status | Severity | Class | Iteration | Finding | Required Fix |\n|---|---|---|---|---|---|---|\n`, "utf-8");
  writeFlowState(path.join(changeDir, "state.json"), {
    activePhase: "iteration_validation",
    activeIteration: 1,
    repairCycleCount: 0
  });
  fs.writeFileSync(path.join(changeDir, "state.json"), JSON.stringify({
    activePhase: "iteration_validation",
    activeIteration: 1,
    repairCycleCount: 0,
    commitLog: { start: gitCommitAll(projectPath, "base"), iterations: {} }
  }, null, 2));
  return changeDir;
}

function passIterationReceipts(projectPath: string, scope = "iteration:1") {
  for (const unit of ["code-review", "security-review", "implementation-check"] as const) {
    const claim = claimReceipt(projectPath, unit, scope);
    expect(claim.ok).toBe(true);
    completeReceipt(projectPath, unit, scope, {
      claimId: claim.claimId!,
      result: "passed"
    });
  }
}

function passFocusedUnitReceipt(projectPath: string, scope: string, command = "bun test unit") {
  const claim = claimReceipt(projectPath, "check:unit", scope, { command });
  expect(claim.ok).toBe(true);
  if (claim.action === "claimed") {
    completeReceipt(projectPath, "check:unit", scope, {
      claimId: claim.claimId!,
      result: "passed",
      command
    });
  }
}

function seedImplementationChange(projectPath: string) {
  const changeDir = seedChange(projectPath);
  writeFlowState(path.join(changeDir, "state.json"), {
    activePhase: "implementation",
    activeIteration: 1,
    repairCycleCount: 0
  });
  return changeDir;
}

function addOpenBlockingFinding(changeDir: string) {
  const findingsPath = path.join(changeDir, "validation_findings.md");
  const content = fs.readFileSync(findingsPath, "utf-8");
  fs.writeFileSync(findingsPath, content.replace(
    "|---|---|---|---|---|---|---|",
    "|---|---|---|---|---|---|---|\n| F1 | open | MUST-FIX | implementation | Iteration 1 | broken | fix it |"
  ));
}

function writeFindingsRepaired(changeDir: string) {
  const findingsPath = path.join(changeDir, "validation_findings.md");
  const content = fs.readFileSync(findingsPath, "utf-8");
  fs.writeFileSync(findingsPath, content
    .replace("verdict: pending", "verdict: repaired")
    .replace(
      "|---|---|---|---|---|---|---|",
      "|---|---|---|---|---|---|---|\n| F1 | resolved | MUST-FIX | implementation | Iteration 1 | broken | fix it |"
    ), "utf-8");
}

function hashLiteralMisreadUtf8(bytes: Buffer): string {
  return createHash("sha256").update(bytes.toString("utf8"), "utf8").digest("hex");
}

async function spawnClaimReceiptJson(cwd: string): Promise<{ exitCode: number; envelope: { ok: boolean; message?: string; data?: { action?: string | null } } }> {
  const proc = Bun.spawn(
    ["bun", cliPath, "claim-receipt", "code-review", "--scope", "iteration:1", "--project-path", cwd, "--json"],
    { cwd, stdout: "pipe", stderr: "pipe" }
  );
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  const envelope = JSON.parse(stdout.trim());
  return { exitCode, envelope };
}

let testTmpDir: string;

describe("execution receipts", () => {
  beforeEach(() => {
    testTmpDir = createGitWorkspace("execution-receipts");
    makeGitRepo(testTmpDir);
  });
  afterEach(() => cleanupGitWorkspace(testTmpDir));

  test("scope parser accepts final and iteration scopes", () => {
    expect(parseReceiptScope("final")).toEqual({ kind: "final" });
    expect(parseReceiptScope("iteration:2")).toEqual({ kind: "iteration", iterationId: 2 });
    expect(parseReceiptScope("bad")).toBeNull();
    expect(formatReceiptScope({ kind: "iteration", iterationId: 3 })).toBe("iteration:3");
  });

  test("diff digest is deterministic and reacts to staged, unstaged, untracked, delete, rename", () => {
    const base = gitCommitAll(testTmpDir, "base");
    fs.writeFileSync(path.join(testTmpDir, "tracked.txt"), "one");
    gitCommitAll(testTmpDir, "tracked");

    const digestAtHead = computeDiffDigest(testTmpDir, base);
    expect(digestAtHead).toMatch(/^[0-9a-f]{64}$/);

    fs.writeFileSync(path.join(testTmpDir, "tracked.txt"), "two");
    const unstagedDigest = computeDiffDigest(testTmpDir, base);
    expect(unstagedDigest).not.toBe(digestAtHead);

    spawnSync("git", ["-C", testTmpDir, "add", "tracked.txt"], { encoding: "utf-8" });
    const stagedDigest = computeDiffDigest(testTmpDir, base);
    expect(stagedDigest).not.toBe(unstagedDigest);

    fs.writeFileSync(path.join(testTmpDir, "new.txt"), "fresh");
    const untrackedDigest = computeDiffDigest(testTmpDir, base);
    expect(untrackedDigest).not.toBe(stagedDigest);

    fs.writeFileSync(path.join(testTmpDir, "rename-old.txt"), "x");
    gitCommitAll(testTmpDir, "rename-old");
    fs.renameSync(path.join(testTmpDir, "rename-old.txt"), path.join(testTmpDir, "rename-new.txt"));
    const renameEntries = buildDiffDigestEntries(testTmpDir, base);
    expect(renameEntries.some(entry => entry.filePath.includes("rename-new"))).toBe(true);

    fs.unlinkSync(path.join(testTmpDir, "rename-new.txt"));
    const deletedDigest = computeDiffDigest(testTmpDir, base);
    expect(deletedDigest).not.toBe(untrackedDigest);
  });

  test("claim transitions support skip, retry, cancel, and wrong claim id", () => {
    let file = emptyExecutionReceiptsFile();
    const base = {
      unit: "code-review" as const,
      scope: "iteration:1",
      diffDigest: "digest-a",
      commandDigest: null,
      claimedAt: "2026-01-01T00:00:00.000Z"
    };

    const first = applyClaimReceipt({ ...base, file });
    expect(first.outcome.action).toBe("claimed");
    file = first.file;
    const claimId = first.outcome.claimId!;

    const second = applyClaimReceipt({ ...base, file });
    expect(second.outcome.ok).toBe(false);

    const completed = completeReceiptRecord({
      file,
      ...base,
      claimId,
      result: "passed",
      completedAt: "2026-01-01T00:01:00.000Z"
    });
    file = completed.file;
    expect(findCurrentReceipt(file, "code-review", "iteration:1", "digest-a", null)?.status).toBe("passed");

    const skip = applyClaimReceipt({ ...base, file });
    expect(skip.outcome.action).toBe("skip");

    const failed = applyClaimReceipt({
      ...base,
      file: emptyExecutionReceiptsFile(),
      diffDigest: "digest-b"
    });
    file = failed.file;
    const failedClaimId = failed.outcome.claimId!;
    const failComplete = completeReceiptRecord({
      file,
      ...base,
      diffDigest: "digest-b",
      claimId: failedClaimId,
      result: "failed",
      completedAt: "2026-01-01T00:02:00.000Z"
    });
    file = failComplete.file;
    const retry = applyClaimReceipt({ ...base, file, diffDigest: "digest-b" });
    expect(retry.outcome.action).toBe("claimed");

    const wrongId = completeReceiptRecord({
      file: retry.file,
      ...base,
      diffDigest: "digest-b",
      claimId: "wrong",
      result: "passed",
      completedAt: "2026-01-01T00:03:00.000Z"
    });
    expect(wrongId.outcome.ok).toBe(false);

    const cancel = cancelReceiptRecord({
      file: retry.file,
      ...base,
      diffDigest: "digest-b",
      claimId: retry.outcome.claimId!,
      reason: "agent crashed",
      cancelledAt: "2026-01-01T00:04:00.000Z"
    });
    expect(cancel.outcome.ok).toBe(true);
  });

  test("command digest invalidates receipts when command changes", () => {
    const changeDir = seedChange(testTmpDir);
    const claim = claimReceipt(testTmpDir, "check:unit", "iteration:1", { command: "bun test unit" });
    expect(claim.ok).toBe(true);
    completeReceipt(testTmpDir, "check:unit", "iteration:1", {
      claimId: claim.claimId!,
      result: "passed",
      command: "bun test unit"
    });

    const retry = claimReceipt(testTmpDir, "check:unit", "iteration:1", { command: "bun test unit" });
    expect(retry.action).toBe("skip");

    const changed = claimReceipt(testTmpDir, "check:unit", "iteration:1", { command: "bun test other" });
    expect(changed.ok).toBe(false);
    expect(changed.message).toContain("recipe");
  });

  test("iteration and final prerequisite ordering with optional manual acceptance", () => {
    const changeDir = seedChange(testTmpDir, { manualAcceptance: true });
    writeFlowState(path.join(changeDir, "state.json"), {
      activePhase: "final_validation",
      activeIteration: null,
      repairCycleCount: 0
    });

    const digest = "abc";
    const file = emptyExecutionReceiptsFile();
    expect(iterationValidationReceiptBlockers({
      file,
      scope: { kind: "iteration", iterationId: 1 },
      diffDigest: digest
    }).length).toBe(3);

    expect(finalValidationReceiptBlockers({
      file,
      diffDigest: digest,
      fullCommandDigest: digestCommand("bun test full"),
      requiresManualAcceptance: true
    }).some(message => message.includes("manual-acceptance"))).toBe(true);

    const implClaim = claimReceipt(testTmpDir, "implementation-check", "final");
    expect(implClaim.ok).toBe(false);
  });

  test("validation completion and phase exit block without receipts and pass with current receipts", () => {
    const changeDir = seedChange(testTmpDir);
    const paths = buildChangePaths(changeDir);

    const blocked = checkValidationCompletion(testTmpDir, { scope: "iteration", iterationId: 1 });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toContain("code-review");

    passIterationReceipts(testTmpDir);
    fs.writeFileSync(paths.iterationPlanPath, fs.readFileSync(paths.iterationPlanPath, "utf-8").replace("## Iteration 1: API [~]", "## Iteration 1: API [x]"), "utf-8");
    fs.writeFileSync(paths.findingsPath, fs.readFileSync(paths.findingsPath, "utf-8").replace("verdict: pending", "verdict: ready"), "utf-8");
    passIterationReceipts(testTmpDir);

    expect(validationReceiptBlockers(testTmpDir, "iteration:1")).toEqual([]);
    const exitReady = validatePhaseExit(testTmpDir, "iteration_validation", paths, 1);
    expect(exitReady.ok).toBe(true);
  });

  test("legacy change without receipts fails closed with recovery commands", () => {
    seedChange(testTmpDir);
    const blockers = validationReceiptBlockers(testTmpDir, "iteration:1");
    expect(blockers.some(line => line.includes("claim-receipt"))).toBe(true);
  });

  test("CLI text, JSON, and help document receipt commands", () => {
    for (const command of ["receipt-status", "claim-receipt", "complete-receipt", "cancel-receipt"]) {
      expect(CLI_COMMAND_NAMES).toContain(command);
      expect(renderHelp()).toContain(`phasedev ${command}`);
    }

    seedChange(testTmpDir);
    const status = runCli(["receipt-status", "--scope", "iteration:1", "--project-path", testTmpDir], testTmpDir);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("RECEIPT-STATUS");

    const json = runCli(["receipt-status", "--scope", "iteration:1", "--project-path", testTmpDir, "--json"], testTmpDir);
    expect(json.stdout).toContain("\"kind\":\"receipt-status\"");
  });

  test("runtime receipt file path is under change runtime and survives archive layout", () => {
    const changeDir = seedChange(testTmpDir);
    passIterationReceipts(testTmpDir);
    const receiptsPath = path.join(changeDir, "runtime", "execution_receipts.json");
    expect(fs.existsSync(receiptsPath)).toBe(true);

    const archiveDir = path.join(testTmpDir, ".phasedev", "changes", "archive", "2026-01-01-sample-change");
    fs.mkdirSync(path.dirname(archiveDir), { recursive: true });
    fs.renameSync(changeDir, archiveDir);
    expect(fs.existsSync(path.join(archiveDir, "runtime", "execution_receipts.json"))).toBe(true);
  });

  test("open blocking findings block validation roles but not focused check claims", () => {
    const changeDir = seedChange(testTmpDir);
    addOpenBlockingFinding(changeDir);

    const roleClaim = claimReceipt(testTmpDir, "code-review", "iteration:1");
    expect(roleClaim.ok).toBe(false);
    expect(roleClaim.message).toContain("blocking findings");

    const checkClaim = claimReceipt(testTmpDir, "check:unit", "iteration:1", { command: "bun test unit" });
    expect(checkClaim.ok).toBe(true);
  });

  test("corrupt execution_receipts.json fails closed and preserves file bytes", () => {
    const changeDir = seedChange(testTmpDir);
    const receiptsPath = path.join(changeDir, "runtime", "execution_receipts.json");
    fs.mkdirSync(path.dirname(receiptsPath), { recursive: true });
    const corruptBytes = "{ not-json";
    fs.writeFileSync(receiptsPath, corruptBytes, "utf-8");

    const loaded = loadExecutionReceiptsFile(receiptsPath);
    expect(loaded.ok).toBe(false);
    expect(fs.readFileSync(receiptsPath, "utf-8")).toBe(corruptBytes);

    const status = receiptStatus(testTmpDir, "iteration:1");
    expect(status.ok).toBe(false);
    expect(fs.readFileSync(receiptsPath, "utf-8")).toBe(corruptBytes);

    const claim = runCli([
      "claim-receipt", "code-review", "--scope", "iteration:1", "--project-path", testTmpDir
    ], testTmpDir);
    expect(claim.exitCode).toBe(1);
    expect(fs.readFileSync(receiptsPath, "utf-8")).toBe(corruptBytes);
  });

  test("malformed receipt schema is rejected without mutation", () => {
    const changeDir = seedChange(testTmpDir);
    const receiptsPath = path.join(changeDir, "runtime", "execution_receipts.json");
    fs.mkdirSync(path.dirname(receiptsPath), { recursive: true });
    const hostile = JSON.stringify({
      version: 1,
      receipts: [{
        unit: "code-review",
        scope: "iteration:1",
        diffDigest: "abc",
        commandDigest: "should-be-null",
        claimId: "x",
        status: "passed",
        result: "passed",
        claimedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z"
      }]
    }, null, 2);
    fs.writeFileSync(receiptsPath, hostile, "utf-8");

    const parsed = parseExecutionReceiptsFile(JSON.parse(hostile));
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some(issue => issue.path.includes("commandDigest"))).toBe(true);

    const claim = claimReceipt(testTmpDir, "code-review", "iteration:1");
    expect(claim.ok).toBe(false);
    expect(fs.readFileSync(receiptsPath, "utf-8")).toBe(hostile);
  });

  test("strict parser rejects incomplete cancelled receipt records", () => {
    const hostile = JSON.stringify({
      version: 1,
      receipts: [{
        unit: "code-review",
        scope: "iteration:1",
        diffDigest: "abc",
        commandDigest: null,
        status: "cancelled",
        cancelReason: "agent crashed",
        completedAt: "2026-01-01T00:01:00.000Z"
      }]
    }, null, 2);

    const parsed = parseExecutionReceiptsFile(JSON.parse(hostile));
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some(issue => issue.path.includes("claimId"))).toBe(true);
    expect(parsed.issues.some(issue => issue.path.includes("claimedAt"))).toBe(true);
  });

  test("missing full gate command digest fails final validation blockers clearly", () => {
    const blockers = finalValidationReceiptBlockers({
      file: emptyExecutionReceiptsFile(),
      diffDigest: "abc",
      fullCommandDigest: null,
      requiresManualAcceptance: false
    });
    expect(blockers[0]).toContain("missing the full gate command");
  });

  test("manual acceptance detection covers authoritative signals and rejects generic wording", () => {
    expect(requiresManualAcceptance({
      planContent: "- SC2 [Deferred to Final Validation / Manual Acceptance]",
      prdContent: ""
    })).toBe(true);

    expect(requiresManualAcceptance({
      planContent: "",
      prdContent: "| SC9 | R1 | ok | manual |"
    })).toBe(true);

    expect(requiresManualAcceptance({
      planContent: "Acceptance evidence requires browser verification in staging.",
      prdContent: ""
    })).toBe(true);

    expect(requiresManualAcceptance({
      planContent: "Final wave requires browser/manual validation before full gate.",
      prdContent: ""
    })).toBe(true);

    expect(requiresManualAcceptance({
      planContent: "Run visual validation of the dashboard layout.",
      prdContent: ""
    })).toBe(false);

    expect(requiresManualAcceptance({
      planContent: "Acceptance evidence requires visual inspection only.",
      prdContent: ""
    })).toBe(false);

    expect(requiresManualAcceptance({
      planContent: "# Plan\n\n## Iteration 1",
      prdContent: "| SC1 | R1 | ok | review |"
    })).toBe(false);
  });

  test("diff digest hashes binary bytes and distinguishes symlink targets", () => {
    const base = gitCommitAll(testTmpDir, "base");
    const binaryPath = path.join(testTmpDir, "blob.bin");
    fs.writeFileSync(binaryPath, Buffer.from([0x00, 0xff, 0x42]));
    const binaryDigest = computeDiffDigest(testTmpDir, base);

    fs.writeFileSync(binaryPath, Buffer.from([0x00, 0xff, 0x43]));
    expect(computeDiffDigest(testTmpDir, base)).not.toBe(binaryDigest);

    const targetA = path.join(testTmpDir, "target-a.txt");
    const targetB = path.join(testTmpDir, "target-b.txt");
    fs.writeFileSync(targetA, "a");
    fs.writeFileSync(targetB, "b");
    const linkPath = path.join(testTmpDir, "link.txt");
    fs.symlinkSync(targetA, linkPath);
    const linkDigestA = computeDiffDigest(testTmpDir, base);
    fs.unlinkSync(linkPath);
    fs.symlinkSync(targetB, linkPath);
    expect(computeDiffDigest(testTmpDir, base)).not.toBe(linkDigestA);

    const entries = buildDiffDigestEntries(testTmpDir, base);
    expect(entries.some(entry => entry.filePath === "link.txt")).toBe(true);
  });

  test("diff digest hashes deleted binary git objects as raw bytes", () => {
    const binaryPath = path.join(testTmpDir, "committed.bin");
    const binaryBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    fs.writeFileSync(binaryPath, binaryBytes);
    gitCommitAll(testTmpDir, "add binary");
    const headWithBinary = spawnSync("git", ["-C", testTmpDir, "rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();

    fs.unlinkSync(binaryPath);
    const expectedHash = createHash("sha256").update(binaryBytes).digest("hex");
    const entries = buildDiffDigestEntries(testTmpDir, headWithBinary);
    const deletedEntry = entries.find(entry => entry.filePath === "committed.bin" && entry.status.startsWith("D"));
    expect(deletedEntry).toBeDefined();
    expect(deletedEntry?.contentHash).toBe(expectedHash);
    expect(deletedEntry?.contentHash).not.toBe(hashLiteralMisreadUtf8(binaryBytes));
  });

  test("implementation exit requires current passed focused receipts for Check Evidence", () => {
    const changeDir = seedImplementationChange(testTmpDir);
    const paths = buildChangePaths(changeDir);

    const blocked = validatePhaseExit(testTmpDir, "implementation", paths, 1);
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some(issue => issue.includes("check:unit"))).toBe(true);

    passFocusedUnitReceipt(testTmpDir, "iteration:1");
    const allowed = validatePhaseExit(testTmpDir, "implementation", paths, 1);
    expect(allowed.ok).toBe(true);
  });

  test("finding_repair requires focused receipts only when product code changed", () => {
    const changeDir = seedChange(testTmpDir);
    const paths = buildChangePaths(changeDir);
    writeFlowState(paths.statePath, {
      activePhase: "finding_repair",
      activeIteration: 1,
      repairCycleCount: 1
    });
    writeFindingsRepaired(changeDir);

    const noCodeExit = validatePhaseExit(testTmpDir, "finding_repair", paths, 1);
    expect(noCodeExit.ok, noCodeExit.issues.join("; ")).toBe(true);

    fs.writeFileSync(path.join(testTmpDir, "src-fix.ts"), "export const x = 1;\n");
    const blocked = validatePhaseExit(testTmpDir, "finding_repair", paths, 1);
    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some(issue => issue.includes("check:unit"))).toBe(true);

    passFocusedUnitReceipt(testTmpDir, "iteration:1");
    expect(validatePhaseExit(testTmpDir, "finding_repair", paths, 1).ok).toBe(true);
  });

  test("final implementation-check completion requires passed check:full without prerequisite cycle", () => {
    seedChange(testTmpDir, { manualAcceptance: false });
    writeFlowState(path.join(testTmpDir, ".phasedev", "changes", "sample-change", "state.json"), {
      activePhase: "final_validation",
      activeIteration: null,
      repairCycleCount: 0
    });

    for (const unit of ["code-review", "security-review"] as const) {
      const claim = claimReceipt(testTmpDir, unit, "final");
      expect(claim.ok, claim.message).toBe(true);
      const completed = completeReceipt(testTmpDir, unit, "final", {
        claimId: claim.claimId!,
        result: "passed"
      });
      expect(completed.ok, completed.message).toBe(true);
    }

    const implClaim = claimReceipt(testTmpDir, "implementation-check", "final");
    expect(implClaim.ok, implClaim.message).toBe(true);

    const premature = completeReceipt(testTmpDir, "implementation-check", "final", {
      claimId: implClaim.claimId!,
      result: "passed"
    });
    expect(premature.ok).toBe(false);
    expect(premature.message).toContain("check:full");

    const fullClaim = claimReceipt(testTmpDir, "check:full", "final", { command: "bun test full" });
    expect(fullClaim.ok).toBe(true);

    const statusWhileFullClaimed = receiptStatus(testTmpDir, "final");
    const implEntry = statusWhileFullClaimed.entries.find(entry => entry.unit === "implementation-check");
    expect(implEntry?.status).toBe("claimed");

    completeReceipt(testTmpDir, "check:full", "final", {
      claimId: fullClaim.claimId!,
      result: "passed",
      command: "bun test full"
    });

    const completeImpl = completeReceipt(testTmpDir, "implementation-check", "final", {
      claimId: implClaim.claimId!,
      result: "passed"
    });
    expect(completeImpl.ok).toBe(true);
  });

  test("concurrent claim-receipt invocations serialize through state lock", async () => {
    const changeDir = seedChange(testTmpDir);
    const receiptsPath = path.join(changeDir, "runtime", "execution_receipts.json");

    const [first, second] = await Promise.all([
      spawnClaimReceiptJson(testTmpDir),
      spawnClaimReceiptJson(testTmpDir)
    ]);

    const outcomes = [first, second];
    const successes = outcomes.filter(outcome => outcome.envelope.ok);
    const failures = outcomes.filter(outcome => !outcome.envelope.ok);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(successes[0]?.exitCode).toBe(0);
    expect(successes[0]?.envelope.data?.action).toBe("claimed");
    expect(failures[0]?.exitCode).toBe(1);
    expect(failures[0]?.envelope.message ?? "").toMatch(/already claimed/i);

    expect(fs.existsSync(receiptsPath)).toBe(true);
    const file = JSON.parse(fs.readFileSync(receiptsPath, "utf-8"));
    const claimed = file.receipts.filter((entry: { status: string }) => entry.status === "claimed");
    expect(claimed.length).toBe(1);
  });
});

describe("phasedev-orchestrator receipt sequence", () => {
  test("SKILL documents claim before dispatch and implementation-check/full ordering", () => {
    const skillMd = fs.readFileSync(path.join(__dirname, "..", "skills", "phasedev-orchestrator", "SKILL.md"), "utf-8");
    expect(skillMd).toMatch(/claim-receipt/i);
    expect(skillMd).toMatch(/complete-receipt/i);
    expect(skillMd).toMatch(/implementation-check[\s\S]*check:full|check:full[\s\S]*implementation-check/i);
  });
});
