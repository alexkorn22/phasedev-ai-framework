# Remove approved_hash Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `approved_hash` content-hash check from the approval mechanism so that `approved: true` in an artifact's frontmatter is the sole, permanent source of truth for approval state.

**Architecture:** `isApproved()` in `src/shared/markdown/frontmatter.ts` currently recomputes a SHA-256 of the artifact body (with special-case normalization for iteration status markers, task checkboxes, and Check Evidence table columns) and compares it against a stored `approved_hash`. This plan deletes that hashing layer entirely: `isApproved()` becomes a plain frontmatter read, `approveArtifact()` stops writing `approved_hash`, and every test fixture/helper that stamped a hash writes plain `approved: true` instead.

**Tech Stack:** TypeScript, Bun test runner (`bun test`), existing PhaseDev CLI (`src/cli.ts`).

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-07-06-remove-approved-hash-design.md`.
- `approved: true` is the only condition for `isApproved()` — no content comparison of any kind.
- Do not touch `approved`/`approved_by` field semantics, `state.json`, or phase routing (`isSetupApproved`/`isDesignApproved`/`isPlanApproved`) beyond what naturally follows from simplifying `isApproved()`.
- Do not clean up legacy `approved_hash` fields already present in existing files on disk — the field is simply ignored going forward.
- Do not touch unrelated uncommitted changes already in the working tree: `.claude/settings.local.json`, `src/features/phase-control/get-phase-prompt.ts`, `src/features/phase-control/get-route-prompt.ts`, or the `describe("code review finding tests", ...)` block appended to `test/cli.test.ts`. These belong to other in-progress work and are out of scope.
- Run `bun test` (full suite) and `npm run typecheck` before the final commit, per the spec's testing section.

---

### Task 1: Simplify `src/shared/markdown/frontmatter.ts` — remove hashing

**Files:**
- Modify: `src/shared/markdown/frontmatter.ts` (full rewrite — this also discards the currently-uncommitted `normalizeTaskCheckboxes`/`normalizeCheckEvidenceTables` additions per the spec's "Незакоммиченная рабочая копия" section)
- Test: `test/frontmatter.test.ts` (full rewrite — drops all hash-specific describe blocks, keeps `"unified frontmatter policy"`)
- Delete: `test/approval-hash.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `isApproved(filePath: string): boolean` — now `true` iff the file exists, has a parsable frontmatter block, and `frontmatter.approved === true` (or the string `"true"`). No `approvalContentHash` export exists after this task — Tasks 2 and 3 must stop importing it.

- [ ] **Step 1: Confirm current test baseline (sanity check before rewrite)**

Run: `bun test test/frontmatter.test.ts test/approval-hash.test.ts`
Expected: PASS (18 tests total: 12 in `test/frontmatter.test.ts` — 5 in `"unified frontmatter policy"` plus 7 across the two `approvalContentHash`-normalization `describe` blocks — and 6 in `test/approval-hash.test.ts`) — this just confirms the baseline before deleting/rewriting.

- [ ] **Step 2: Rewrite `src/shared/markdown/frontmatter.ts`**

Replace the entire file content with:

```typescript
import * as fs from "fs";
import { parse as parseYaml } from "yaml";
import { normalizeLineEndings } from "./normalize-line-endings";

export interface FrontmatterBlock {
  prefix: string;
  yaml: string;
  endIndex: number;
}

export function matchFrontmatterBlock(content: string): FrontmatterBlock | null {
  const match = content.match(/^(﻿?\s*)---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!match) {
    return null;
  }
  return { prefix: match[1], yaml: match[2], endIndex: (match.index ?? 0) + match[0].length };
}

function parseFrontmatterFromContent(content: string): Record<string, any> | null {
  const block = matchFrontmatterBlock(content);
  if (!block) {
    return null;
  }

  try {
    const parsed = parseYaml(block.yaml);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function readFrontmatter(filePath: string): Record<string, any> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  return parseFrontmatterFromContent(content);
}

export function readFrontmatterValue(filePath: string, key: string): string | null {
  const fm = readFrontmatter(filePath);
  if (!fm) {
    return null;
  }
  const value = fm[key];
  return value !== undefined && value !== null ? String(value) : null;
}

export function isApproved(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = normalizeLineEndings(fs.readFileSync(filePath, "utf-8"));
  const fm = parseFrontmatterFromContent(content);
  if (!fm) {
    return false;
  }
  return fm.approved === true || String(fm.approved).toLowerCase() === "true";
}
```

- [ ] **Step 3: Rewrite `test/frontmatter.test.ts`**

Replace the entire file content with:

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { matchFrontmatterBlock, readFrontmatterValue } from "../src/shared/markdown/frontmatter";
import { bodyAfterFrontmatter } from "../src/shared/markdown/headings";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "phasedev-frontmatter-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFile(content: string): string {
  const filePath = path.join(tmpDir, "artifact.md");
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("unified frontmatter policy", () => {
  test("leading blank line before --- still yields frontmatter values", () => {
    const filePath = writeFile("\n---\nverdict: ready\n---\n\n| ID |\n");
    expect(readFrontmatterValue(filePath, "verdict")).toBe("ready");
    expect(bodyAfterFrontmatter(fs.readFileSync(filePath, "utf-8")).hasFrontmatter).toBe(true);
  });

  test("BOM before frontmatter is tolerated", () => {
    const filePath = writeFile("﻿---\napproved: true\n---\n\nBody\n");
    expect(readFrontmatterValue(filePath, "approved")).toBe("true");
  });

  test("CRLF frontmatter parses", () => {
    const filePath = writeFile("---\r\nverdict: ready\r\n---\r\n\r\nBody\r\n");
    expect(readFrontmatterValue(filePath, "verdict")).toBe("ready");
  });

  test("a --- horizontal rule inside the body does not truncate frontmatter", () => {
    const content = "---\nverdict: ready\n---\n\nIntro\n\n---\n\nOutro\n";
    const block = matchFrontmatterBlock(content);
    expect(block).not.toBeNull();
    expect(block?.yaml).toBe("verdict: ready");
    expect(bodyAfterFrontmatter(content).body).toContain("Outro");
  });

  test("content without frontmatter returns null / passthrough", () => {
    expect(matchFrontmatterBlock("# Title\n")).toBeNull();
    expect(bodyAfterFrontmatter("# Title\n")).toEqual({ body: "# Title\n", hasFrontmatter: false });
  });
});
```

- [ ] **Step 4: Delete `test/approval-hash.test.ts`**

Run: `rm test/approval-hash.test.ts`

- [ ] **Step 5: Run frontmatter tests to verify the rewrite is self-consistent**

Run: `bun test test/frontmatter.test.ts`
Expected: PASS (5 tests, all under `"unified frontmatter policy"`)

Note: `test/cli.test.ts`, `test/controller.test.ts`, and `test/e2e-flow.test.ts` still import `approvalContentHash` at this point and will fail to type-check/run until Task 2 updates them — that's expected and handled next.

- [ ] **Step 6: Commit**

```bash
git add src/shared/markdown/frontmatter.ts test/frontmatter.test.ts test/approval-hash.test.ts
git commit -m "refactor: remove approved_hash content hashing from frontmatter"
```

---

### Task 2: Stop writing `approved_hash` in `approveArtifact`

**Files:**
- Modify: `src/features/artifact-ops/approve-artifact.ts`

**Interfaces:**
- Consumes: `matchFrontmatterBlock` from `src/shared/markdown/frontmatter.ts` (unchanged signature from Task 1).
- Produces: `approveArtifact(filePath: string, approvedBy?: string): ApproveResult` — same signature and `ApproveResult` shape as before; the written frontmatter now contains only `approved: true` and `approved_by`, never `approved_hash`.

- [ ] **Step 1: Update `src/features/artifact-ops/approve-artifact.ts`**

Replace the entire file content with:

```typescript
import * as fs from "fs";
import * as path from "path";
import { writeFileAtomic } from "../../shared/fs/write-file-atomic";
import { matchFrontmatterBlock } from "../../shared/markdown/frontmatter";

export interface ApproveResult {
  ok: boolean;
  message: string;
}

export function approveArtifact(filePath: string, approvedBy?: string): ApproveResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, message: `File not found: ${filePath}` };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const block = matchFrontmatterBlock(content);
  if (!block) {
    return { ok: false, message: `${filePath} does not contain YAML frontmatter.` };
  }

  const prefix = block.prefix;
  const afterFrontmatter = content.slice(block.endIndex);

  // Preserve the exact raw frontmatter lines, replace or add approved/approved_by
  const lines = block.yaml.split(/\r?\n/);
  let hasApproved = false;
  let hasApprovedBy = false;

  const newLines = lines.map(line => {
    if (/^approved\s*:/.test(line)) {
      hasApproved = true;
      return "approved: true";
    }
    if (/^approved_by\s*:/.test(line)) {
      hasApprovedBy = true;
      return `approved_by: "${approvedBy ?? "phasedev approve"}"`;
    }
    return line;
  });

  if (!hasApproved) {
    newLines.push("approved: true");
  }
  if (!hasApprovedBy) {
    newLines.push(`approved_by: "${approvedBy ?? "phasedev approve"}"`);
  }

  const newContent = `${prefix}---\n${newLines.join("\n")}\n---${afterFrontmatter}`;
  writeFileAtomic(filePath, newContent);

  return {
    ok: true,
    message: `Approved: ${path.basename(filePath)}${approvedBy ? ` (by: ${approvedBy})` : ""}`
  };
}
```

- [ ] **Step 2: Confirm `reopen-phase.ts` needs no code change**

`src/features/phase-control/reopen-phase.ts` strips any frontmatter line matching `/^(approved|approved_by|approved_hash)\s*:/` when resetting an artifact to unapproved. After this task, `approveArtifact` never writes an `approved_hash` line, so that branch of the filter simply never matches on newly-approved files — it's dead-but-harmless, and it still correctly cleans up a stray legacy `approved_hash` line if one exists on an old artifact from before this change. No edit is required here; this step is a documented decision, not a code change.

Run: `grep -n "approved_hash" src/features/phase-control/reopen-phase.ts`
Expected: one match, inside the filter regex — confirms it's the harmless generic strip described above, not a separate write path.

- [ ] **Step 3: Commit**

```bash
git add src/features/artifact-ops/approve-artifact.ts
git commit -m "refactor: stop writing approved_hash when approving artifacts"
```

---

### Task 3: Update `scripts/generate-agent-prompts.ts` example generator

**Files:**
- Modify: `scripts/generate-agent-prompts.ts:4,218-221`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (this script builds fixture strings directly, it doesn't call `approveArtifact`).
- Produces: `approvedArtifact(body: string): string` — same signature, output frontmatter now omits `approved_hash`.

- [ ] **Step 1: Remove the `approvalContentHash` import**

In `scripts/generate-agent-prompts.ts`, remove line 4:

```typescript
import { approvalContentHash } from "../src/shared/markdown/frontmatter";
```

- [ ] **Step 2: Simplify `approvedArtifact`**

Find (around line 218):

```typescript
function approvedArtifact(body: string): string {
  const trimmedBody = body.trim();
  const contentHash = approvalContentHash(trimmedBody);
  return `---\napproved: true\napproved_hash: "${contentHash}"\n---\n${trimmedBody}\n`;
}
```

Replace with:

```typescript
function approvedArtifact(body: string): string {
  const trimmedBody = body.trim();
  return `---\napproved: true\n---\n${trimmedBody}\n`;
}
```

- [ ] **Step 3: Verify no other references remain in this file**

Run: `grep -n "approved_hash\|approvalContentHash" scripts/generate-agent-prompts.ts`
Expected: no output (empty).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors referencing `scripts/generate-agent-prompts.ts`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-agent-prompts.ts
git commit -m "refactor: drop approved_hash from generated example artifacts"
```

---

### Task 4: Update test fixtures in `cli.test.ts`, `controller.test.ts`, `e2e-flow.test.ts`

**Files:**
- Modify: `test/cli.test.ts:11,25-31`
- Modify: `test/controller.test.ts:15,29-35`
- Modify: `test/e2e-flow.test.ts:5,50-58,391-394,475`

**Interfaces:**
- Consumes: nothing (these are self-contained test helpers writing artifact fixtures directly to disk, not calling `approveArtifact`).
- Produces: no new exports — these are internal test helpers (`writeArtifact` in `cli.test.ts`/`controller.test.ts`, `simulateAgent` in `e2e-flow.test.ts`) whose output no longer contains `approved_hash`.

- [ ] **Step 1: Update `test/cli.test.ts`**

Remove line 11:

```typescript
import { approvalContentHash } from "../src/shared/markdown/frontmatter";
```

Find the `writeArtifact` helper (around lines 25-31):

```typescript
function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (approved) {
    const contentHash = approvalContentHash(body);
    fs.writeFileSync(filePath, `---\napproved: true\napproved_hash: "${contentHash}"\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(filePath, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}
```

Replace with:

```typescript
function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (approved) {
    fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(filePath, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}
```

- [ ] **Step 2: Update `test/controller.test.ts`**

Remove line 15:

```typescript
import { approvalContentHash } from "../src/shared/markdown/frontmatter";
```

Find the `writeArtifact` helper (around lines 29-35):

```typescript
function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (approved) {
    const contentHash = approvalContentHash(body);
    fs.writeFileSync(filePath, `---\napproved: true\napproved_hash: "${contentHash}"\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(filePath, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}
```

Replace with:

```typescript
function writeArtifact(filePath: string, body: string, approved = true) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (approved) {
    fs.writeFileSync(filePath, `---\napproved: true\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(filePath, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}
```

- [ ] **Step 3: Update `test/e2e-flow.test.ts`**

Remove line 5:

```typescript
import { approvalContentHash } from "../src/shared/markdown/frontmatter";
```

Find the `simulateAgent` helper (around lines 50-58):

```typescript
function simulateAgent(file: string, body: string, approved = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (approved) {
    // Write with approved: false first to compute hash over the same body
    const temp = `---\napproved: false\n---\n${body}`;
    const hash = approvalContentHash(temp);
    fs.writeFileSync(file, `---\napproved: true\napproved_hash: "${hash}"\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(file, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}
```

Replace with:

```typescript
function simulateAgent(file: string, body: string, approved = false): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (approved) {
    fs.writeFileSync(file, `---\napproved: true\n---\n${body}`, "utf-8");
  } else {
    fs.writeFileSync(file, `---\napproved: false\n---\n${body}`, "utf-8");
  }
}
```

Then find and update the two now-stale comments referencing hashing:

Around line 391 (before the `designPath`/`writeFile` block), find:

```typescript
    // Write without approval in frontmatter; then use simulateAgent for correct hash
```

Replace with:

```typescript
    // Write without approval in frontmatter; approve via CLI below
```

Around line 394, find:

```typescript
    // Approve via CLI to get proper approved_hash
```

Replace with:

```typescript
    // Approve via CLI
```

Around line 475, find the identical comment:

```typescript
    // Approve plan via CLI to get proper approved_hash
```

Replace with:

```typescript
    // Approve plan via CLI
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "approved_hash\|approvalContentHash" test/`
Expected: no output (empty) — confirms `test/approval-hash.test.ts` deletion (Task 1) and these three files are fully cleaned up.

- [ ] **Step 5: Commit**

```bash
git add test/cli.test.ts test/controller.test.ts test/e2e-flow.test.ts
git commit -m "test: stop stamping approved_hash in test fixtures"
```

---

### Task 5: Full verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing — this task only confirms the change is correct end-to-end.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS, 0 failures. All suites that previously depended on `approvalContentHash` (`test/cli.test.ts`, `test/controller.test.ts`, `test/e2e-flow.test.ts`, `test/frontmatter.test.ts`) pass with the plain `approved: true` fixtures.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 3: Confirm no remaining references to the removed hashing mechanism in source/tests**

Run: `grep -rln "approved_hash\|approvalContentHash" src/ test/ scripts/`
Expected: no output. (`temp/plan/archive/2026-07-05-phasedev-review-fixes.md` and `docs/superpowers/specs/2026-07-06-remove-approved-hash-design.md` are historical/spec documents and are intentionally not touched.)

- [ ] **Step 4: Manual smoke test of the approve flow**

```bash
rm -rf /tmp/phasedev-hash-smoke
mkdir -p /tmp/phasedev-hash-smoke
bun run src/cli.ts init-project --project-path /tmp/phasedev-hash-smoke
bun run src/cli.ts create-change smoke-test --project-path /tmp/phasedev-hash-smoke
```

Then manually edit `/tmp/phasedev-hash-smoke/.phasedev/changes/smoke-test/prd.md` to add a minimal valid PRD body, and run:

```bash
bun run src/cli.ts approve prd.md --project-path /tmp/phasedev-hash-smoke
cat /tmp/phasedev-hash-smoke/.phasedev/changes/smoke-test/prd.md
```

Expected: the file's frontmatter shows `approved: true` and `approved_by: "phasedev approve"` with **no** `approved_hash` line. Then hand-edit the file body (e.g. add a stray sentence) and confirm the artifact is still treated as approved:

```bash
bun run src/cli.ts check --project-path /tmp/phasedev-hash-smoke
```

Expected: `check` does not report the PRD as unapproved (no `change_intake_approval` block referencing prd.md) — the content edit did not invalidate approval.

Clean up:

```bash
rm -rf /tmp/phasedev-hash-smoke
```

---
