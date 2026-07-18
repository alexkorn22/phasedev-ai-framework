# B28 Core — spec_sync Sub-Agent + Live-Spec Lint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delegate all archive-phase spec work to a `spec_sync` sub-agent (with ripple search, gap control, and escalation of ambiguous divergences) and add a mechanical, token-free live-spec lint to `phasedev check-archive`.

**Architecture:** Two independent pieces. (1) A new `live-spec-lint` module in `src/features/phase-control`, called from `checkArchiveCompletion()`; violations in specs touched by the current archive are errors, the rest of the corpus produces warnings returned in a new `warnings` field and printed to stderr only by the CLI wrapper. (2) Prompt-contract rewrites of `templates/phase7_archive.md` and `templates/quick_archive.md`: the orchestrator spawns one `spec_sync` sub-agent instead of editing specs itself, and must stop on escalations before setting `.phase-archive.json` to `completed`.

**Tech Stack:** TypeScript (bun), bun:test. No new dependencies.

**Authoritative spec:** `docs/superpowers/specs/2026-07-18-b28-spec-sync-archive-design.md` — read it before starting any task.

## Global Constraints

- Invoke the `dev-core` skill before writing any code (repo hard gate; every delegation prompt for these tasks must repeat this instruction).
- Frozen contracts stay untouched: `state.json` shape, `config.yaml` keys, `.phase-archive.json` fields, archive mutation ownership (`phasedev archive` only, `advance` archive-silent). `commitLog` is read via existing accessors only.
- No new CLI commands, no new artifacts, no new config keys.
- Executable/config code and all template text in English.
- Root `src/` stays thin; new logic goes in `src/features/phase-control`.
- Explicit return types for exported functions; no `any`.
- Checks: `bun test <focused files>` first, then full `bun test` and `npm run typecheck` after cross-module changes.
- Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (repo rule; the commit commands below omit it for brevity — append it when committing).

---

### Task 1: `live-spec-lint` module

**Files:**
- Create: `src/features/phase-control/live-spec-lint.ts`
- Test: `test/live-spec-lint.test.ts`

**Interfaces:**
- Consumes: `SYSTEM_DIR` from `src/entities/change/paths.ts` (value `".phasedev"`), `blankFencedCodeLines(lines: string[]): string[]` from `src/shared/markdown/code-fences.ts`.
- Produces (used by Task 2):
  - `interface LiveSpecLintResult { errors: string[]; warnings: string[] }`
  - `liveSpecsRootFor(archivePath: string): string | null`
  - `deltaSectionHeadings(content: string): Set<string>`
  - `isRuleCExempt(sections: Set<string>): boolean`
  - `lintLiveSpecs(liveSpecsRoot: string, touchedCapabilities: Set<string>, ruleCExemptCapabilities: Set<string>): LiveSpecLintResult`

Decision locked here (spec deviation, documented): the delta format has no
capability-level rename representation, so the Rule C exemption is purely
section-based — a delta whose sections are only `## REMOVED Requirements` /
`## RENAMED Requirements` exempts its capability from the "live spec must
exist" rule. No "check the new name instead" logic.

- [ ] **Step 1: Write the failing tests**

Create `test/live-spec-lint.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  deltaSectionHeadings,
  isRuleCExempt,
  lintLiveSpecs,
  liveSpecsRootFor
} from "../src/features/phase-control/live-spec-lint";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "live-spec-lint-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeLiveSpec(root: string, capability: string, content: string): void {
  const dir = path.join(root, capability);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "spec.md"), content);
}

const CLEAN_SPEC = "# Reporting Specification\n\n## Purpose\n\nDescribes reporting.\n\n### Requirement: Render report\nThe system SHALL render.\n";

describe("liveSpecsRootFor", () => {
  test("derives <project>/.phasedev/specs from an archive path", () => {
    const archivePath = path.join(tmpDir, "proj", ".phasedev", "changes", "archive", "2026-07-18-my-change");
    expect(liveSpecsRootFor(archivePath)).toBe(path.join(tmpDir, "proj", ".phasedev", "specs"));
  });

  test("returns null when no .phasedev ancestor exists", () => {
    expect(liveSpecsRootFor(path.join(tmpDir, "elsewhere", "archive-dir"))).toBeNull();
  });
});

describe("deltaSectionHeadings / isRuleCExempt", () => {
  test("collects delta section headings outside code fences", () => {
    const content = "## ADDED Requirements\n\n```md\n## MODIFIED Requirements\n```\n\n## REMOVED Requirements\n";
    const sections = deltaSectionHeadings(content);
    expect(sections).toEqual(new Set(["## ADDED Requirements", "## REMOVED Requirements"]));
  });

  test("REMOVED-only and RENAMED-only deltas are Rule C exempt", () => {
    expect(isRuleCExempt(new Set(["## REMOVED Requirements"]))).toBe(true);
    expect(isRuleCExempt(new Set(["## REMOVED Requirements", "## RENAMED Requirements"]))).toBe(true);
  });

  test("deltas containing ADDED or MODIFIED sections are not exempt", () => {
    expect(isRuleCExempt(new Set(["## ADDED Requirements"]))).toBe(false);
    expect(isRuleCExempt(new Set(["## ADDED Requirements", "## REMOVED Requirements"]))).toBe(false);
    expect(isRuleCExempt(new Set())).toBe(false);
  });
});

describe("lintLiveSpecs", () => {
  test("clean corpus produces no errors or warnings", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", CLEAN_SPEC);
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("Rule A: delta heading in a touched live spec is an error", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", "## ADDED Requirements\n\n### Requirement: X\nThe system SHALL x.\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("## ADDED Requirements"))).toBe(true);
  });

  test("Rule A: delta heading in an untouched live spec is a warning only", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", CLEAN_SPEC);
    writeLiveSpec(root, "billing", "## MODIFIED Requirements\n\n### Requirement: Y\nThe system SHALL y.\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors).toEqual([]);
    expect(result.warnings.some(issue => issue.includes("billing/spec.md"))).toBe(true);
  });

  test("Rule A is fence-aware: delta heading inside a code fence passes", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", "## Purpose\n\nDelta format example:\n\n```md\n## ADDED Requirements\n```\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("Rule B: first ## heading must be ## Purpose; a single leading # title is allowed", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    writeLiveSpec(root, "reporting", "# Reporting Specification\n\n## Requirements\n\n### Requirement: X\nThe system SHALL x.\n");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("## Purpose"))).toBe(true);
  });

  test("Rule C: capability with a delta but no live spec file is an error", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    fs.mkdirSync(root, { recursive: true });
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("reporting"))).toBe(true);
  });

  test("Rule C exemption: exempt capability with no live spec passes", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    fs.mkdirSync(root, { recursive: true });
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set(["reporting"]));
    expect(result.errors).toEqual([]);
  });

  test("missing specs root: Rule C still applies, content lint is skipped", () => {
    const root = path.join(tmpDir, ".phasedev", "specs");
    const result = lintLiveSpecs(root, new Set(["reporting"]), new Set());
    expect(result.errors.some(issue => issue.includes("reporting"))).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/live-spec-lint.test.ts`
Expected: FAIL — module `../src/features/phase-control/live-spec-lint` not found.

- [ ] **Step 3: Write the implementation**

Create `src/features/phase-control/live-spec-lint.ts`:

```ts
import * as fs from "fs";
import * as path from "path";
import { SYSTEM_DIR } from "../../entities/change/paths";
import { blankFencedCodeLines } from "../../shared/markdown/code-fences";

export interface LiveSpecLintResult {
  errors: string[];
  warnings: string[];
}

const DELTA_SECTION_HEADINGS = new Set([
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
  "## RENAMED Requirements"
]);

const RULE_C_EXEMPT_SECTIONS = new Set(["## REMOVED Requirements", "## RENAMED Requirements"]);

export function liveSpecsRootFor(archivePath: string): string | null {
  let current = path.resolve(archivePath);
  while (true) {
    if (path.basename(current) === SYSTEM_DIR) {
      return path.join(current, "specs");
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

export function deltaSectionHeadings(content: string): Set<string> {
  const lines = blankFencedCodeLines(content.split(/\r?\n/));
  const sections = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (DELTA_SECTION_HEADINGS.has(trimmed)) {
      sections.add(trimmed);
    }
  }
  return sections;
}

export function isRuleCExempt(sections: Set<string>): boolean {
  if (sections.size === 0) {
    return false;
  }
  return [...sections].every(section => RULE_C_EXEMPT_SECTIONS.has(section));
}

function lintLiveSpecContent(content: string, label: string): string[] {
  const problems: string[] = [];
  const lines = blankFencedCodeLines(content.split(/\r?\n/));
  let firstSectionHeading: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (DELTA_SECTION_HEADINGS.has(trimmed)) {
      problems.push(`${label}: delta heading "${trimmed}" must not appear in a live spec.`);
    }
    if (firstSectionHeading === null && trimmed.startsWith("## ")) {
      firstSectionHeading = trimmed;
    }
  }

  if (firstSectionHeading !== "## Purpose") {
    const found = firstSectionHeading ? ` (found "${firstSectionHeading}")` : "";
    problems.push(`${label}: first "##" heading must be "## Purpose"${found}.`);
  }

  return problems;
}

export function lintLiveSpecs(
  liveSpecsRoot: string,
  touchedCapabilities: Set<string>,
  ruleCExemptCapabilities: Set<string>
): LiveSpecLintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const capability of [...touchedCapabilities].sort()) {
    if (ruleCExemptCapabilities.has(capability)) {
      continue;
    }
    if (!fs.existsSync(path.join(liveSpecsRoot, capability, "spec.md"))) {
      errors.push(
        `Live spec missing for capability with a delta in this archive: ${SYSTEM_DIR}/specs/${capability}/spec.md`
      );
    }
  }

  if (!fs.existsSync(liveSpecsRoot)) {
    return { errors, warnings };
  }

  for (const entry of fs.readdirSync(liveSpecsRoot).sort()) {
    const specPath = path.join(liveSpecsRoot, entry, "spec.md");
    if (!fs.existsSync(specPath)) {
      continue;
    }
    const problems = lintLiveSpecContent(fs.readFileSync(specPath, "utf-8"), `${entry}/spec.md`);
    if (touchedCapabilities.has(entry)) {
      errors.push(...problems);
    } else {
      warnings.push(...problems);
    }
  }

  return { errors, warnings };
}
```

Note the severity rule: content problems (Rules A/B) in a touched capability are
errors even when the capability is Rule C-exempt — the exemption covers only
file existence.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/live-spec-lint.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/live-spec-lint.ts test/live-spec-lint.test.ts
git commit -m "feat(B28): live-spec lint module — delta headings, Purpose-first, merge-happened rules"
```

---

### Task 2: Wire the lint into `checkArchiveCompletion` and the CLI

**Files:**
- Modify: `src/features/phase-control/check-archive.ts` (interface `ArchiveCheckResult` at :6-10, function `checkArchiveCompletion` at :190-236, spec loop at :211-216)
- Modify: `src/cli.ts` (`handleCheckArchive` at :807-815)
- Test: `test/archive-command.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes (from Task 1): `liveSpecsRootFor`, `deltaSectionHeadings`, `isRuleCExempt`, `lintLiveSpecs`, `LiveSpecLintResult` from `./live-spec-lint`.
- Produces: `ArchiveCheckResult` gains `warnings: string[]` (always present, `[]` when none). All existing callers (`archive-command.ts:74,158`, `quick-check.ts:37`, `phase-validators.ts:228`) read only `.ok`/`.message`/`.issues` and stay untouched.

- [ ] **Step 1: Write the failing tests**

Append to `test/archive-command.test.ts` (follow the file's existing imports and tmp-dir helpers; the tests below assume a helper that builds a project dir with `.phasedev/changes/archive/<date>-<name>` containing a valid completed `.phase-archive.json` — reuse the file's existing archive-fixture helper; if the existing helper does not create archive specs, write them with `fs` directly):

```ts
import { checkArchiveCompletion } from "../src/features/phase-control/check-archive";

describe("checkArchiveCompletion live-spec lint (B28)", () => {
  // buildCompletedArchive(projectDir, changeName) must produce:
  //   <projectDir>/.phasedev/changes/archive/2026-07-18-<changeName>/.phase-archive.json (status completed)
  // Reuse or adapt the existing completed-archive fixture in this test file.

  function writeArchiveDelta(archivePath: string, capability: string, content: string): void {
    const dir = path.join(archivePath, "specs", capability);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "spec.md"), content);
  }

  function writeLiveSpec(projectDir: string, capability: string, content: string): void {
    const dir = path.join(projectDir, ".phasedev", "specs", capability);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "spec.md"), content);
  }

  const ADDED_DELTA = "## ADDED Requirements\n\n### Requirement: Render\nThe system SHALL render.\n\n#### Scenario: Basic\n- WHEN opened\n- THEN rendered\n";
  const REMOVED_DELTA = "## REMOVED Requirements\n\n### Requirement: Old model\nReason: superseded.\n";
  const CLEAN_LIVE = "## Purpose\n\nReporting capability.\n\n### Requirement: Render\nThe system SHALL render.\n";

  test("fails when a delta'd capability has no live spec (Rule C)", () => {
    const archivePath = buildCompletedArchive(projectDir, "my-change");
    writeArchiveDelta(archivePath, "reporting", ADDED_DELTA);
    const result = checkArchiveCompletion(archivePath);
    expect(result.ok).toBe(false);
    expect(result.issues.some(issue => issue.includes("reporting"))).toBe(true);
  });

  test("passes for a REMOVED-only delta with no live spec (Rule C exemption)", () => {
    const archivePath = buildCompletedArchive(projectDir, "my-change");
    writeArchiveDelta(archivePath, "reporting", REMOVED_DELTA);
    const result = checkArchiveCompletion(archivePath);
    expect(result.ok).toBe(true);
  });

  test("fails when a touched live spec keeps a delta heading, warns for untouched", () => {
    const archivePath = buildCompletedArchive(projectDir, "my-change");
    writeArchiveDelta(archivePath, "reporting", ADDED_DELTA);
    writeLiveSpec(projectDir, "reporting", "## ADDED Requirements\n\n### Requirement: Render\nThe system SHALL render.\n");
    writeLiveSpec(projectDir, "billing", "## MODIFIED Requirements\n\n### Requirement: Pay\nThe system SHALL pay.\n");
    const result = checkArchiveCompletion(archivePath);
    expect(result.ok).toBe(false);
    expect(result.issues.some(issue => issue.includes("reporting/spec.md"))).toBe(true);
    expect(result.warnings.some(warning => warning.includes("billing/spec.md"))).toBe(true);
  });

  test("passes with a clean merged live spec and reports zero warnings", () => {
    const archivePath = buildCompletedArchive(projectDir, "my-change");
    writeArchiveDelta(archivePath, "reporting", ADDED_DELTA);
    writeLiveSpec(projectDir, "reporting", CLEAN_LIVE);
    const result = checkArchiveCompletion(archivePath);
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test test/archive-command.test.ts`
Expected: new tests FAIL (`warnings` undefined; Rule C issues absent). Pre-existing tests must still pass.

- [ ] **Step 3: Implement the integration**

In `src/features/phase-control/check-archive.ts`:

1. Add the import:

```ts
import { deltaSectionHeadings, isRuleCExempt, lintLiveSpecs, liveSpecsRootFor } from "./live-spec-lint";
```

2. Extend the result interface:

```ts
export interface ArchiveCheckResult {
  ok: boolean;
  message: string;
  issues: string[];
  warnings: string[];
}
```

3. In `checkArchiveCompletion`, collect touched/exempt capabilities inside the existing spec loop and run the lint after it. Replace the body of the `else` branch holding the `for (const relativeFile of relativeSpecFiles(specsPath))` loop and the return blocks:

```ts
  let warnings: string[] = [];
  if (archivePath && archiveStat?.isDirectory()) {
    changeName = validateArchiveState(archivePath, issues).changeName;

    const specsPath = path.join(archivePath, "specs");
    const specsStat = fs.statSync(specsPath, { throwIfNoEntry: false });
    if (specsStat && !specsStat.isDirectory()) {
      issues.push(`Archive specs path must be a directory when present: ${specsPath}`);
    } else {
      const touchedCapabilities = new Set<string>();
      const ruleCExemptCapabilities = new Set<string>();

      for (const relativeFile of relativeSpecFiles(specsPath)) {
        validateSpecPath(relativeFile, changeName, issues);
        if (relativeFile.endsWith("/spec.md")) {
          validateSpecContent(specsPath, relativeFile, issues);

          const capability = relativeFile.split("/")[0];
          touchedCapabilities.add(capability);
          const sections = deltaSectionHeadings(fs.readFileSync(path.join(specsPath, relativeFile), "utf-8"));
          if (isRuleCExempt(sections)) {
            ruleCExemptCapabilities.add(capability);
          }
        }
      }

      const liveSpecsRoot = liveSpecsRootFor(archivePath);
      if (liveSpecsRoot) {
        const lint = lintLiveSpecs(liveSpecsRoot, touchedCapabilities, ruleCExemptCapabilities);
        issues.push(...lint.errors);
        warnings = lint.warnings;
      }
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      warnings,
      message: [
        "[FLOW ARCHIVE CHECK] FAILED: archive is incomplete.",
        ...issues.map(issue => `- ${issue}`)
      ].join("\n")
    };
  }

  return {
    ok: true,
    issues: [],
    warnings,
    message: "[FLOW ARCHIVE CHECK] OK: archive is complete."
  };
```

When `liveSpecsRootFor` returns `null` (archive path not under a `.phasedev`
tree — the case in several existing unit tests), the lint is skipped entirely.
This is intentional: it preserves existing test fixtures and only activates the
lint for real project layouts.

4. In `src/cli.ts`, `handleCheckArchive` prints warnings to stderr before the result (warnings must not change exit code or `ok`):

```ts
function handleCheckArchive(ctx: CommandContext): void {
  const result = checkArchiveCompletion(parseArchivePath(ctx.args));
  for (const warning of result.warnings) {
    console.warn(`[FLOW ARCHIVE CHECK] warning: ${warning}`);
  }
  reportCliResult(ctx.jsonMode, {
    ok: result.ok,
    kind: "check-archive",
    humanMessage: result.message,
    data: { warnings: result.warnings },
    issues: result.issues
  });
}
```

- [ ] **Step 4: Run focused tests**

Run: `bun test test/archive-command.test.ts test/live-spec-lint.test.ts test/quick-flow.test.ts`
Expected: PASS. If a pre-existing archive test now fails on the lint, its fixture lives under a real `.phasedev` layout with a delta spec and no live spec — fix the fixture by adding the matching live spec (`## Purpose` + requirement), not by weakening the lint.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/check-archive.ts src/cli.ts test/archive-command.test.ts
git commit -m "feat(B28): check-archive lints live specs; corpus warnings on stderr"
```

---

### Task 3: Rewrite `templates/phase7_archive.md` for the spec_sync delegation

**Files:**
- Modify: `templates/phase7_archive.md`
- Test: `test/cli.test.ts` (template `describe` block around :2270-2460)

**Interfaces:**
- Consumes: nothing from earlier tasks (template-only).
- Produces: template markers asserted by tests — the strings `spec_sync`, `escalation`, `## Ripple search`, `## Gap control`, `## Truth direction and escalations` in `phase7_archive.md`. No new template variables (`archiveTemplateVariables` in `src/features/phase-control/archive-stage.ts:15-34` stays unchanged; the delegation references `state.json` inside `{{archive_path}}` textually).

- [ ] **Step 1: Write the failing test**

Add to the template `describe` block in `test/cli.test.ts` (next to "archive prompt keeps archive state and delta spec inputs" at ~:2443):

```ts
  test("archive prompt delegates spec work to a spec_sync sub-agent with escalation gate (B28)", () => {
    const archiveTemplate = readTemplate("phase7_archive.md");

    expect(archiveTemplate).toContain("spec_sync");
    expect(archiveTemplate).toContain("Do not classify requirements, create delta specs, or edit any spec yourself");
    expect(archiveTemplate).toContain("## Ripple search");
    expect(archiveTemplate).toContain("## Gap control");
    expect(archiveTemplate).toContain("## Truth direction and escalations");
    expect(archiveTemplate).toContain("do not set `.phase-archive.json` to completed");
    expect(archiveTemplate).toContain("commitLog");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli.test.ts`
Expected: the new test FAILS (markers absent); all other tests pass.

- [ ] **Step 3: Edit the template**

Apply these edits to `templates/phase7_archive.md` (line numbers from the current file):

1. Replace line 3 (the task summary) with:

```md
Your task is to complete the already archived change: delegate specification work to a `spec_sync` sub-agent, resolve its escalations with the user, run the archive self-check, and complete the machine state.
```

2. Replace the `## Archive Procedure` numbered list (lines 47-55) with:

```md
Work only with requirement-level changes derived from the archived change artifacts for `{{change_name}}`.

1. Read inputs.
2. Spawn exactly one `spec_sync` sub-agent. Its delegation prompt is the full content of the sections `Spec-level classification`, `Delta-first specs`, `Sync specs`, `## Ripple search`, `## Gap control`, `## UI literals`, and `## Truth direction and escalations` below, plus the artifact links above. Do not classify requirements, create delta specs, or edit any spec yourself.
3. Read the sub-agent report. If it contains escalations: stop, present every escalation to the user as a question, and do not set `.phase-archive.json` to completed until all are resolved. After the user answers, re-dispatch `spec_sync` with the decisions to apply and repeat this step.
4. When the report has no unresolved escalations, set `.phase-archive.json` to completed.
5. Run the archive self-check.
6. Report, then stop: include the sub-agent's classification table, changed specs or skipped sync, ripple/gap findings, and escalation outcomes.
```

3. Replace the `## Sync specs` section body (lines 127-132) with:

```md
## Sync specs

After creating delta specs, merge them into `.phasedev/specs`. Merging is never copying a delta file over a live spec:
- carefully add new capabilities;
- update existing capabilities only within the requirements of the current change;
- preserve existing requirements/scenarios that the current change does not modify;
- when a requirement replaces a cancelled model, remove the obsolete requirement — do not leave it next to the new one;
- delta section headings (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`) must never appear in a live spec;
- normalize every touched live spec so that its first `##` heading is `## Purpose` (a single leading `# ` title line may precede it).
```

4. Insert after the `## Sync specs` section, before `## Complete archive state`:

```md
## Ripple search

After the merge, check the rest of the spec corpus against what the change actually did:

1. Read `commitLog` from `state.json` inside `{{archive_path}}` and take the change diff `commitLog.start..HEAD`. If `commitLog` is absent or has no `start` (the repository had no commits when the change was created), fall back to the change branch's full diff via git, and state in the report which diff source was used.
2. From the diff, extract added/removed/renamed names: files, exported symbols, classes, routes, CSS variables, database fields, environment variables, and user-facing string literals.
3. Grep every extracted name across all files under `.phasedev/specs`. For every hit, decide whether the change made that statement false. Token grep is the floor, not the ceiling: inside specs touched by the change, verify statements by meaning, not only by matched names.

## Gap control

For every persistent entity the diff adds (database column, route, environment variable, public CSS variable): if it is mentioned in no spec at all, record a finding `requirement not written` in the report. A zero-hit grep for a new entity is a finding, not a clean result.

## UI literals

Any spec statement that quotes user-facing text must be checked against the actual constant in code. When the change deliberately updated the literal, fix the spec text to match the code.

## Truth direction and escalations

A divergence between a spec statement and the code is a finding, not an automatic edit:
- Edit the spec only in the obvious case: the spec lags behind a deliberate decision recorded in this change's `prd.md` or `iteration_plan.md`.
- In every ambiguous case (the code may be defective, or the intent is unclear), do NOT edit. Add an escalation item to the report: spec file, quoted statement, what the code actually does, and why the truth direction is unclear.
- The final report must list all spec edits, all ripple and gap findings, and all escalations. An empty escalation list must be stated explicitly.
```

5. In the `## Spec-level classification` intro (line 59), replace "classify every `R#` requirement in the final response using this exact table" with "the `spec_sync` sub-agent classifies every `R#` requirement in its report using this exact table" (the table and rules stay unchanged).

Leave untouched: input links, path resolution rules, `Delta-first specs` body and format block, `## Complete archive state`, `## Archive self-check`, `## Artifact allowlist` (its three entries still hold), Visual Formatting Scope.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/cli.test.ts`
Expected: PASS, including the pre-existing template assertions ("archive prompt keeps archive state and delta spec inputs", "stage templates preserve executable artifact allowlists", skill-policy placement).

- [ ] **Step 5: Commit**

```bash
git add templates/phase7_archive.md test/cli.test.ts
git commit -m "feat(B28): archive prompt delegates spec work to spec_sync sub-agent"
```

---

### Task 4: Rewrite `templates/quick_archive.md` with the adapted quick contract

**Files:**
- Modify: `templates/quick_archive.md`
- Test: `test/cli.test.ts` (same template `describe` block)

**Interfaces:**
- Consumes: nothing from earlier tasks (template-only). Existing template variables suffice: `{{change_name}}`, `{{archive_path}}`, `{{worklog_path}}`, `{{main_specs_path}}`, `{{change_specs_path}}`, `{{archive_state_path}}` (rendered in `src/features/phase-control/quick-phase-prompt.ts:52`).
- Produces: template markers asserted by tests — `spec_sync`, `worklog`, merge and escalation wording in `quick_archive.md`.

Behavior note (approved in the design spec): quick archive previously never
merged deltas into `.phasedev/specs`; this task adds that step. The verdict #3
trigger for writing a spec is preserved.

- [ ] **Step 1: Write the failing test**

Add to the template `describe` block in `test/cli.test.ts`:

```ts
  test("quick archive prompt delegates spec work to spec_sync and merges into live specs (B28)", () => {
    const template = readTemplate("quick_archive.md");

    expect(template).toContain("spec_sync");
    expect(template).toContain("worklog.md");
    expect(template).toContain("{{main_specs_path}}");
    expect(template).toContain("do not set the archive completed");
    expect(template).toContain("commitLog");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli.test.ts`
Expected: new test FAILS; the existing "quick_archive template receives the config skill policy before its archived-change line" test still passes.

- [ ] **Step 3: Replace the template content**

Replace the full content of `templates/quick_archive.md` with (keep line 1 and the link block exactly as they are today):

````md
{{phase_opening_summary}}# Quick Phase: Archive

{{skill_policy}}

This quick change is being archived (not deleted). If the spec-revision verdict was #3, delegate all specification work to one `spec_sync` sub-agent; otherwise write no spec. Then mark the archive completed.

Archived change: {{change_name}}
Archive path: {{archive_path}}
Worklog: {{worklog_path}}
Project specs: {{main_specs_path}}
Change specs (delta spec target when verdict #3): {{change_specs_path}}
Archive state file: {{archive_state_path}}

## Procedure

1. If the spec-revision verdict was #3: spawn exactly one `spec_sync` sub-agent — do not edit specs yourself. Its delegation prompt must instruct it to:
   - classify the implemented behavior from `worklog.md` (`## Short Specification` plus the implemented plan) — quick changes have no PRD and no `R#` requirements;
   - write a delta spec under `{{change_specs_path}}` following the delta-spec format (`specs/<capability>/spec.md` with ADDED/MODIFIED/REMOVED/RENAMED Requirements sections, normative SHALL/MUST requirement text, `### Requirement: ` and `#### Scenario: ` headings);
   - merge the delta into the project specs at {{main_specs_path}} — never copy: preserve requirements the change does not modify, remove requirements describing a cancelled model, keep delta section headings out of live specs, and normalize every touched live spec so its first `##` heading is `## Purpose`;
   - run the ripple search: read `commitLog` from `state.json` inside `{{archive_path}}` and diff `commitLog.start..HEAD` (fall back to the change branch's diff when `commitLog` is absent, stating the source used); extract added/removed/renamed names (files, exported symbols, routes, CSS variables, database fields, environment variables, user-facing string literals); grep each across the project specs and flag statements the change made false; flag added persistent entities mentioned in no spec (`requirement not written`); check quoted user-facing literals against the code constants;
   - never edit a spec when a divergence is ambiguous (the code may be defective, or the intent is unclear) — report it as an escalation: spec file, quoted statement, what the code actually does, why the truth direction is unclear. An empty escalation list must be stated explicitly.
2. If the sub-agent report contains escalations: stop, present them to the user as questions, and do not set the archive completed until all are resolved (re-dispatch `spec_sync` with the decisions to apply).
3. Set `.phase-archive.json` status to `completed` at {{archive_state_path}}.

## Self-check

```bash
phasedev check-archive --archive-path {{archive_path}}
```

## Completion

Stop after `.phase-archive.json` status is `completed`.

Final report skill-compliance:
{{skill_compliance_line}}
````

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/cli.test.ts test/quick-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/quick_archive.md test/cli.test.ts
git commit -m "feat(B28): quick archive delegates to spec_sync and merges deltas into live specs"
```

---

### Task 5: e2e, docs sync, full verification

**Files:**
- Modify: `test/e2e-flow.test.ts` (archive/check-archive section around :393-410 and :761-763) — only if the new lint breaks it
- Modify: `CLAUDE.md` → "Archive Phase" section
- Modify: `docs/superpowers/specs/2026-07-18-b28-spec-sync-archive-design.md` (tick acceptance checkboxes)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: green full suite + typecheck; docs consistent with shipped behavior.

- [ ] **Step 1: Run the e2e and full suite**

Run: `bun test`
Expected: likely one failure mode — `e2e-flow.test.ts` calls `run(["check-archive", "--archive-path", fullArchivePath])` expecting exit 0; if the e2e fixture archives a delta spec without a matching live spec, Rule C now fails it.

- [ ] **Step 2: Fix the e2e fixture (only if Step 1 failed)**

In `test/e2e-flow.test.ts`, before the `check-archive` invocation, create the merged live spec matching the delta capability the test writes (use the capability name actually present in the test's delta fixture):

```ts
  const liveSpecDir = path.join(projectDir, ".phasedev", "specs", "<capability-from-fixture>");
  fs.mkdirSync(liveSpecDir, { recursive: true });
  fs.writeFileSync(
    path.join(liveSpecDir, "spec.md"),
    "## Purpose\n\nMerged by e2e fixture.\n\n### Requirement: <requirement from fixture>\nThe system SHALL behave as archived.\n"
  );
```

Run: `bun test test/e2e-flow.test.ts`
Expected: PASS.

- [ ] **Step 3: Sync CLAUDE.md**

In the "Archive Phase" section of `CLAUDE.md`, replace the sentence:

```md
Agents executing the Archive prompt MUST write delta specs under the archived change and then update `.phase-archive.json`; they MUST NOT call an archive script.
```

with:

```md
Agents executing the Archive prompt MUST delegate all spec work (delta specs, merge into `.phasedev/specs`, ripple search, escalation of ambiguous divergences) to a single `spec_sync` sub-agent, stop on unresolved escalations before completing, and then update `.phase-archive.json`; they MUST NOT call an archive script. `phasedev check-archive` additionally lints live specs: violations in specs touched by the current archive block completion; the rest of the corpus produces stderr warnings.
```

If `CLAUDE.md` is a symlink to `AGENTS.md`, edit `AGENTS.md` (the symlink target) — do not replace the symlink with a regular file.

- [ ] **Step 4: Full verification**

Run: `bun test && npm run typecheck`
Expected: both PASS with zero failures. Report actual output honestly.

- [ ] **Step 5: Tick spec acceptance criteria and commit**

Mark the satisfied checkboxes in `docs/superpowers/specs/2026-07-18-b28-spec-sync-archive-design.md` (all five should now hold), then:

```bash
git add test/e2e-flow.test.ts CLAUDE.md AGENTS.md docs/superpowers/specs/2026-07-18-b28-spec-sync-archive-design.md
git commit -m "docs(B28): sync CLAUDE.md archive contract; e2e live-spec fixture; tick acceptance"
```

(Adjust the `git add` list to the files actually changed.)

---

## Manual acceptance (behavioral, not automated)

From the design spec — run once after implementation, by hand:

Build a synthetic fixture project with a chain of changes where a later change
reverses an earlier decision, then run a real archive with the new prompt.
Expected: the `spec_sync` sub-agent reproduces bug-report finding classes 1-3
(cancelled model removed from live specs, phantom behavior removed, cross-spec
ripple caught), flags an added persistent entity mentioned in no spec, and
escalates instead of silently editing where the truth direction is ambiguous.
