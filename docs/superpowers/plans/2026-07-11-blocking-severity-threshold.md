# Configurable Blocking-Severity Threshold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every coding task MUST invoke the `dev-core` skill before its first edit.

**Goal:** Add a `config.yaml` key `blockingSeverity` (`must_fix | recommended | nit`, default `must_fix`) that chooses the minimal validation-finding severity that blocks the flow, threaded through a single derivation point so all consumers follow.

**Architecture:** A new severity model in the `validation-findings` entity owns the ordering and the `severityBlocks` / `blockingSeverityLabel` helpers. The findings parser derives `blocksPr` from a defaulted threshold parameter; `openBlockingRows` / `openNonBlockingRows` key off `blocksPr`. Every consumer receives the threshold as a defaulted parameter (default `must_fix`) or reads it from `Config`; CLI handlers load config and pass `config.blockingSeverity`. Prompt templates render a config-driven blocking-policy placeholder.

**Tech Stack:** TypeScript, Bun test runner. Package dir: `PhaseDev` repo root (this repo). Manual edits use `apply_patch`.

## Global Constraints

- `blockingSeverity` enum values, verbatim: `must_fix`, `recommended`, `nit`. Default `must_fix`.
- Ordering `nit < recommended < must_fix`; a row blocks when `rank(rowSeverity) >= rank(threshold)`.
- Default threshold MUST reproduce current behavior bit-for-bit; no migration; all existing tests stay green without edits, EXCEPT where a test is explicitly extended for a new threshold.
- `blockingSeverityLabel("must_fix")` MUST return exactly `"MUST-FIX"` so existing controller messages are byte-identical at the default.
- Do NOT filter blocking at call sites (`rows.filter(severity===...)`); derive only via `blocksPr` / the threaded threshold.
- Do NOT change: `maxRepairCycles`/`repairCycleCount`, findings table format, `state.json` shape, per-phase thresholds, security-class-always-MUST-FIX rule.
- Frozen contracts remain binding except the `ready_with_risks` amendment (spec §2.6, approved 2026-07-11).
- Dependency direction: entrypoints→features→entities→shared. `blocking-severity.ts` and `config.ts` import within/below entities only; no entity imports `config`'s runtime except `config.ts` importing the severity type/values.
- Verification commands (run focused first, then full): see each task; final gate `bun test` + `npm run typecheck` from repo root.
- Spec: `docs/superpowers/specs/2026-07-11-blocking-severity-threshold-design.md`.

---

### Task 1: Severity model (`blocking-severity.ts`)

**Files:**
- Create: `src/entities/validation-findings/blocking-severity.ts`
- Test: `test/blocking-severity.test.ts`

**Interfaces:**
- Consumes: `ValidationFindingSeverity` type from `src/entities/validation-findings/parse-validation-findings.ts`.
- Produces:
  - `type BlockingSeverity = "must_fix" | "recommended" | "nit"`
  - `const BLOCKING_SEVERITY_VALUES: readonly BlockingSeverity[]`
  - `const DEFAULT_BLOCKING_SEVERITY: BlockingSeverity` (= `"must_fix"`)
  - `function severityBlocks(rowSeverity: ValidationFindingSeverity, threshold: BlockingSeverity): boolean`
  - `function blockingSeverityLabel(threshold: BlockingSeverity): string`

- [ ] **Step 1: Write the failing test**

Create `test/blocking-severity.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import {
  BLOCKING_SEVERITY_VALUES,
  DEFAULT_BLOCKING_SEVERITY,
  severityBlocks,
  blockingSeverityLabel
} from "../src/entities/validation-findings/blocking-severity";

describe("severityBlocks", () => {
  test("must_fix threshold blocks only MUST-FIX", () => {
    expect(severityBlocks("MUST-FIX", "must_fix")).toBe(true);
    expect(severityBlocks("RECOMMENDED", "must_fix")).toBe(false);
    expect(severityBlocks("NIT", "must_fix")).toBe(false);
  });

  test("recommended threshold blocks MUST-FIX and RECOMMENDED", () => {
    expect(severityBlocks("MUST-FIX", "recommended")).toBe(true);
    expect(severityBlocks("RECOMMENDED", "recommended")).toBe(true);
    expect(severityBlocks("NIT", "recommended")).toBe(false);
  });

  test("nit threshold blocks everything", () => {
    expect(severityBlocks("MUST-FIX", "nit")).toBe(true);
    expect(severityBlocks("RECOMMENDED", "nit")).toBe(true);
    expect(severityBlocks("NIT", "nit")).toBe(true);
  });
});

describe("blockingSeverityLabel", () => {
  test("labels name the blocking set", () => {
    expect(blockingSeverityLabel("must_fix")).toBe("MUST-FIX");
    expect(blockingSeverityLabel("recommended")).toBe("MUST-FIX or RECOMMENDED");
    expect(blockingSeverityLabel("nit")).toBe("MUST-FIX, RECOMMENDED, or NIT");
  });
});

describe("constants", () => {
  test("default is must_fix and values are the three severities", () => {
    expect(DEFAULT_BLOCKING_SEVERITY).toBe("must_fix");
    expect([...BLOCKING_SEVERITY_VALUES]).toEqual(["must_fix", "recommended", "nit"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/blocking-severity.test.ts`
Expected: FAIL (module `blocking-severity` not found).

- [ ] **Step 3: Write minimal implementation**

Create `src/entities/validation-findings/blocking-severity.ts`:

```ts
import { ValidationFindingSeverity } from "./parse-validation-findings";

export type BlockingSeverity = "must_fix" | "recommended" | "nit";

export const BLOCKING_SEVERITY_VALUES: readonly BlockingSeverity[] = [
  "must_fix",
  "recommended",
  "nit"
] as const;

export const DEFAULT_BLOCKING_SEVERITY: BlockingSeverity = "must_fix";

const ROW_SEVERITY_RANK: Record<ValidationFindingSeverity, number> = {
  NIT: 0,
  RECOMMENDED: 1,
  "MUST-FIX": 2
};

const THRESHOLD_RANK: Record<BlockingSeverity, number> = {
  nit: 0,
  recommended: 1,
  must_fix: 2
};

export function severityBlocks(rowSeverity: ValidationFindingSeverity, threshold: BlockingSeverity): boolean {
  return ROW_SEVERITY_RANK[rowSeverity] >= THRESHOLD_RANK[threshold];
}

const LABELS: Record<BlockingSeverity, string> = {
  must_fix: "MUST-FIX",
  recommended: "MUST-FIX or RECOMMENDED",
  nit: "MUST-FIX, RECOMMENDED, or NIT"
};

export function blockingSeverityLabel(threshold: BlockingSeverity): string {
  return LABELS[threshold];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test test/blocking-severity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/validation-findings/blocking-severity.ts test/blocking-severity.test.ts
git commit -m "feat: add blocking-severity model for validation findings"
```

---

### Task 2: Thread threshold into the findings parser

**Files:**
- Modify: `src/entities/validation-findings/parse-validation-findings.ts`
- Test: `test/parser.test.ts` (add a new `describe` block; do not edit existing cases)

**Interfaces:**
- Consumes: `severityBlocks`, `blockingSeverityLabel`, `DEFAULT_BLOCKING_SEVERITY`, `BlockingSeverity` from `./blocking-severity`.
- Produces:
  - `parseValidationFindingsArtifact(filePath: string, blockingSeverity?: BlockingSeverity): ValidationFindingsArtifact` (defaulted to `DEFAULT_BLOCKING_SEVERITY`)
  - `parseCurrentValidationFindings(filePath: string, blockingSeverity?: BlockingSeverity): ValidationFindingState[]`
  - `openBlockingRows` / `openNonBlockingRows` now derived from `row.blocksPr`.

- [ ] **Step 1: Write the failing test**

Append to `test/parser.test.ts` inside its top-level `describe` (uses the existing `writeTmp` helper defined in that file):

```ts
describe("blockingSeverity threshold", () => {
  const twoRows = `---
verdict: repair_required
type: iteration
date: 2026-07-11
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | RECOMMENDED | implementation | Iteration 1 | Minor issue. | Improve it. |
| F2 | resolved | MUST-FIX | implementation | Iteration 1 | Fixed defect. | Was fixed. |
`;

  test("must_fix (default) treats RECOMMENDED as non-blocking", () => {
    const file = writeTmp(twoRows);
    const artifact = parseValidationFindingsArtifact(file);
    expect(artifact.openBlockingRows.map(r => r.id)).toEqual([]);
    expect(artifact.openNonBlockingRows.map(r => r.id)).toEqual(["F1"]);
  });

  test("recommended threshold makes an open RECOMMENDED blocking", () => {
    const file = writeTmp(twoRows);
    const artifact = parseValidationFindingsArtifact(file, "recommended");
    expect(artifact.openBlockingRows.map(r => r.id)).toEqual(["F1"]);
    expect(artifact.openNonBlockingRows.map(r => r.id)).toEqual([]);
    expect(artifact.rows.find(r => r.id === "F1")?.blocksPr).toBe(true);
  });

  test("recommended threshold: ready_with_risks with open RECOMMENDED is inconsistent", () => {
    const file = writeTmp(twoRows.replace("verdict: repair_required", "verdict: ready_with_risks"));
    const messages = parseValidationFindingsArtifact(file, "recommended").issues.map(i => i.message);
    expect(messages).toContain("`verdict: ready_with_risks` is not allowed while open or reopened MUST-FIX or RECOMMENDED findings exist.");
  });

  test("nit threshold blocks an open NIT finding", () => {
    const nitFile = writeTmp(`---
verdict: repair_required
type: iteration
date: 2026-07-11
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
| F1 | open | NIT | implementation | Iteration 1 | Cosmetic. | Tidy up. |
`);
    const artifact = parseValidationFindingsArtifact(nitFile, "nit");
    expect(artifact.openBlockingRows.map(r => r.id)).toEqual(["F1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/parser.test.ts -t "blockingSeverity threshold"`
Expected: FAIL (recommended-threshold assertions fail; default still blocks only MUST-FIX).

- [ ] **Step 3: Implement**

In `parse-validation-findings.ts`:

1. Add import at top: `import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY, severityBlocks, blockingSeverityLabel } from "./blocking-severity";`
2. Change `artifactWithDerivedRows` derivations (currently lines 132–134) to key off `blocksPr`:

```ts
  const openRows = rows.filter(row => isOpenStatus(row.status));
  const openBlockingRows = openRows.filter(row => row.blocksPr);
  const openNonBlockingRows = openRows.filter(row => !row.blocksPr);
```

3. Change `parseValidationFindingsArtifact` signature:

```ts
export function parseValidationFindingsArtifact(
  filePath: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): ValidationFindingsArtifact {
```

4. In the row push (currently line 281) set `blocksPr` from the threshold:

```ts
        blocksPr: severityBlocks(severity as ValidationFindingSeverity, blockingSeverity),
```

5. In the verdict-consistency block (currently lines 310–323), replace the three
   `MUST-FIX`-worded messages with the label. Concretely:

```ts
    const blockingLabel = blockingSeverityLabel(blockingSeverity);
    if (artifact.verdict === "ready_with_risks" && artifact.openBlockingRows.length > 0) {
      artifact.issues.push({
        code: "verdict_ready_with_risks_with_open_blocking",
        message: `\`verdict: ready_with_risks\` is not allowed while open or reopened ${blockingLabel} findings exist.`
      });
    }
    if (artifact.verdict === "repair_required" && artifact.openBlockingRows.length === 0) {
      artifact.issues.push(genericIssue(`\`verdict: repair_required\` requires at least one open or reopened ${blockingLabel} finding.`));
    }
    if (artifact.verdict === "repaired" && artifact.openBlockingRows.length > 0) {
      artifact.issues.push({
        code: "verdict_repaired_with_open_blocking",
        message: `\`verdict: repaired\` is not allowed while open or reopened ${blockingLabel} findings exist.`
      });
    }
```

   (Leave the `verdict: ready` message untouched — it names no severity.)

6. Change `parseCurrentValidationFindings` to forward the threshold:

```ts
export function parseCurrentValidationFindings(
  filePath: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): ValidationFindingState[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return parseValidationFindingsArtifact(filePath, blockingSeverity).rows.map(row => {
    // ...unchanged body...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/parser.test.ts`
Expected: PASS — new block passes AND the pre-existing default-threshold assertions (including the exact `MUST-FIX` message strings around line 2278–2279) stay green.

- [ ] **Step 5: Commit**

```bash
git add src/entities/validation-findings/parse-validation-findings.ts test/parser.test.ts
git commit -m "feat: derive findings blocking from a threshold parameter"
```

---

### Task 3: Config key `blockingSeverity`

**Files:**
- Modify: `src/entities/config/config.ts`
- Test: `test/config.test.ts` (add cases)

**Interfaces:**
- Consumes: `BlockingSeverity`, `BLOCKING_SEVERITY_VALUES` from `../validation-findings/blocking-severity`.
- Produces: `Config.blockingSeverity: BlockingSeverity`; `DEFAULT_CONFIG.blockingSeverity === "must_fix"`; `parseConfig` throws on invalid value.

- [ ] **Step 1: Write the failing test**

Append to `test/config.test.ts` inside the `parseConfig` describe:

```ts
test("parses blockingSeverity values", () => {
  expect(parseConfig(`blockingSeverity: must_fix`).blockingSeverity).toBe("must_fix");
  expect(parseConfig(`blockingSeverity: recommended`).blockingSeverity).toBe("recommended");
  expect(parseConfig(`blockingSeverity: nit`).blockingSeverity).toBe("nit");
});

test("defaults blockingSeverity to must_fix when absent", () => {
  expect(parseConfig(`{}`).blockingSeverity).toBe("must_fix");
  expect(DEFAULT_CONFIG.blockingSeverity).toBe("must_fix");
});

test("rejects an invalid blockingSeverity", () => {
  expect(() => parseConfig(`blockingSeverity: sometimes`)).toThrow(/blockingSeverity/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/config.test.ts -t blockingSeverity`
Expected: FAIL (property undefined; no throw).

- [ ] **Step 3: Implement**

In `config.ts`:

1. Add import: `import { BlockingSeverity, BLOCKING_SEVERITY_VALUES } from "../validation-findings/blocking-severity";`
2. `Config` interface: add `blockingSeverity: BlockingSeverity;`
3. `DEFAULT_CONFIG`: add `blockingSeverity: "must_fix",`
4. Add reader after `readPositiveInteger`:

```ts
function readBlockingSeverity(value: unknown, fallback: BlockingSeverity, key: string): BlockingSeverity {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !BLOCKING_SEVERITY_VALUES.includes(value as BlockingSeverity)) {
    throw new Error(`Config key ${key} must be one of: ${BLOCKING_SEVERITY_VALUES.join(", ")}.`);
  }
  return value as BlockingSeverity;
}
```

5. In `parseConfig` return object add:

```ts
    blockingSeverity: readBlockingSeverity(root.blockingSeverity, DEFAULT_CONFIG.blockingSeverity, "blockingSeverity")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entities/config/config.ts test/config.test.ts
git commit -m "feat: add blockingSeverity config key"
```

---

### Task 4: Threshold-aware verdict correction in manage-findings

**Files:**
- Modify: `src/features/artifact-ops/manage-findings.ts`
- Test: `test/manage-findings.test.ts` (add cases)

**Interfaces:**
- Consumes: `severityBlocks`, `blockingSeverityLabel`, `DEFAULT_BLOCKING_SEVERITY`, `BlockingSeverity`, `ValidationFindingSeverity` from the validation-findings entity.
- Produces:
  - `addFinding(filePath, id, title, severity, requiredFix, className?, iteration?, createContext?, blockingSeverity?: BlockingSeverity): ManageFindingsResult`
  - `reopenFinding(filePath, id, evidence, blockingSeverity?: BlockingSeverity): ManageFindingsResult`
  - `setFindingsVerdict(filePath, verdict, context, blockingSeverity?: BlockingSeverity): ManageFindingsResult`
  - `blockingSeverity` defaults to `DEFAULT_BLOCKING_SEVERITY` on all three.

- [ ] **Step 1: Write the failing test**

Append to `test/manage-findings.test.ts` (uses the file's existing `FM` helper and temp-workspace setup; adapt `filePath` to the pattern used by the surrounding tests — a temp file seeded with `FM(<verdict>)` plus a header/separator):

```ts
describe("blockingSeverity-aware verdict correction", () => {
  test("recommended threshold: adding a RECOMMENDED finding downgrades ready to repair_required", () => {
    const filePath = path.join(tmpDir, "findings.md");
    fs.writeFileSync(filePath, FM("ready") + "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n|---|---|---|---|---|---|---|---|\n", "utf-8");

    const result = addFinding(filePath, null, "New concern", "RECOMMENDED", "Fix later", undefined, "Iteration 1", undefined, "recommended");

    expect(result.ok).toBe(true);
    expect(result.message).toContain("verdict updated to repair_required");
    expect(fs.readFileSync(filePath, "utf-8")).toContain("verdict: repair_required");
  });

  test("must_fix (default): adding a RECOMMENDED finding to ready yields ready_with_risks", () => {
    const filePath = path.join(tmpDir, "findings2.md");
    fs.writeFileSync(filePath, FM("ready") + "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n|---|---|---|---|---|---|---|---|\n", "utf-8");

    const result = addFinding(filePath, null, "New concern", "RECOMMENDED", "Fix later", undefined, "Iteration 1");

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toContain("verdict: ready_with_risks");
  });

  test("recommended threshold: set-verdict rejects ready_with_risks while an open RECOMMENDED exists", () => {
    const filePath = path.join(tmpDir, "findings3.md");
    fs.writeFileSync(filePath, FM("repair_required") + "| ID | Status | Severity | Class | Iteration | Finding | Required Fix | Resolution |\n|---|---|---|---|---|---|---|---|\n| F1 | open | RECOMMENDED | implementation | Iteration 1 | Concern | Fix it | |\n", "utf-8");

    const result = setFindingsVerdict(filePath, "ready_with_risks", { type: "iteration", date: "2026-07-11" }, "recommended");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("MUST-FIX or RECOMMENDED");
  });
});
```

> Note: bind `tmpDir` the same way the surrounding tests in this file do (they use `createTempWorkspace` in `beforeEach`). If the file exposes the workspace under a different variable name, reuse that name.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/manage-findings.test.ts -t "blockingSeverity-aware"`
Expected: FAIL (recommended-threshold cases behave as must_fix).

- [ ] **Step 3: Implement**

In `manage-findings.ts`:

1. Extend the import from the validation-findings parser file to also import the severity helpers, e.g.:
   `import { severityBlocks, blockingSeverityLabel, DEFAULT_BLOCKING_SEVERITY, BlockingSeverity } from "../../entities/validation-findings/blocking-severity";`
   and ensure `ValidationFindingSeverity` is importable (from `parse-validation-findings`).
2. `correctedVerdict` becomes threshold-aware:

```ts
function correctedVerdict(current: string, addedSeverity: string, blockingSeverity: BlockingSeverity): string | null {
  const isBlocking = severityBlocks(addedSeverity.toUpperCase() as ValidationFindingSeverity, blockingSeverity);
  if (isBlocking && ["ready", "ready_with_risks", "repaired"].includes(current)) return "repair_required";
  if (!isBlocking && current === "ready") return "ready_with_risks";
  return null;
}
```

3. `applyVerdictCorrection` forwards the threshold:

```ts
function applyVerdictCorrection(parsed: ReturnType<typeof parseTable>, addedSeverity: string, blockingSeverity: BlockingSeverity): string {
  const current = readVerdictLine(parsed.frontmatter);
  if (current === null || !isKnownVerdict(current)) return "";
  const next = correctedVerdict(current, addedSeverity, blockingSeverity);
  if (!next) return "";
  parsed.frontmatter = parsed.frontmatter.replace(/^verdict:\s*.*$/m, `verdict: ${next}`);
  return `; verdict updated to ${next}`;
}
```

4. `verdictConsistencyIssue` becomes threshold-aware:

```ts
function verdictConsistencyIssue(verdict: string, rows: FindingTableRow[], blockingSeverity: BlockingSeverity): string | null {
  const openRows = rows.filter(r => ["open", "reopened"].includes(r.status.toLowerCase()));
  const openBlocking = openRows.filter(r => severityBlocks(r.severity.toUpperCase() as ValidationFindingSeverity, blockingSeverity));
  const label = blockingSeverityLabel(blockingSeverity);
  if (verdict === "ready" && openRows.length > 0) return "`verdict: ready` is allowed only when there are no open or reopened findings.";
  if (verdict === "ready_with_risks" && openBlocking.length > 0) return `\`verdict: ready_with_risks\` is not allowed while open or reopened ${label} findings exist.`;
  if (verdict === "repair_required" && openBlocking.length === 0) return `\`verdict: repair_required\` requires at least one open or reopened ${label} finding.`;
  if (verdict === "repaired" && openBlocking.length > 0) return `\`verdict: repaired\` is not allowed while open or reopened ${label} findings exist.`;
  return null;
}
```

5. Add the defaulted parameter to the three public functions and pass it through:
   - `addFinding(..., createContext?: FindingsCreateContext, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; update its call `applyVerdictCorrection(parsed, normalizedSeverity, blockingSeverity)`.
   - `reopenFinding(filePath, id, evidence, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; update its `applyVerdictCorrection(parsed, row.severity, blockingSeverity)`.
   - `setFindingsVerdict(filePath, verdict, context, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; update both `verdictConsistencyIssue(...)` calls to pass `blockingSeverity`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/manage-findings.test.ts`
Expected: PASS (new cases pass; existing default-threshold cases unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/features/artifact-ops/manage-findings.ts test/manage-findings.test.ts
git commit -m "feat: make findings verdict correction blockingSeverity-aware"
```

---

### Task 5: Thread threshold into routing (`resolveRoute`)

**Files:**
- Modify: `src/features/phase-control/flow-route.ts`
- Test: `test/controller.test.ts` (add cases using the existing `setupChange` / `validationFindings` helpers)

**Interfaces:**
- Consumes: `BlockingSeverity`, `DEFAULT_BLOCKING_SEVERITY` from the entity.
- Produces: `resolveRoute(projectPath: string, changeName?: string, blockingSeverity?: BlockingSeverity): Route`.

- [ ] **Step 1: Write the failing test**

Append to `test/controller.test.ts` (mirrors the existing "repair route reports repair stage" test but with a RECOMMENDED finding and the `recommended` threshold):

```ts
test("recommended threshold routes an open RECOMMENDED finding to finding_repair", () => {
  setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
    findings: validationFindings("repair_required", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Naming is inconsistent. | Rename for clarity. |\n")
  });

  expect(resolveRoute(testTmpDir, undefined, "recommended").kind).toBe("finding_repair");
});

test("must_fix (default) does not route an open RECOMMENDED finding to finding_repair", () => {
  setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
    findings: validationFindings("ready_with_risks", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Naming is inconsistent. | Rename for clarity. |\n")
  });

  expect(resolveRoute(testTmpDir).kind).not.toBe("finding_repair");
});
```

> Note: the first case uses `verdict: repair_required` so that, under `recommended`, the artifact is verdict-consistent (an open RECOMMENDED is blocking) and routes into `finding_repair`. The second case uses `ready_with_risks`, valid under the default threshold.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/controller.test.ts -t "recommended threshold routes"`
Expected: FAIL (defaults to must_fix; RECOMMENDED not blocking → no finding_repair route).

- [ ] **Step 3: Implement**

In `flow-route.ts`:

1. Add import: `import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";`
2. Signature:

```ts
export function resolveRoute(
  projectPath: string,
  changeName?: string,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): Route {
```

3. Pass the threshold to the parser (currently line 138):
   `const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);`
4. In the repaired-verdict fallback (currently lines 183–186) change the predicate
   from severity to `blocksPr`:

```ts
      const blockingIterations = findings.rows
        .filter(row => row.blocksPr)
        .map(row => parseFindingRowIteration(row.phase))
        .filter((n): n is number => n != null);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/controller.test.ts`
Expected: PASS (new cases pass; existing routing tests unchanged since default is must_fix).

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/flow-route.ts test/controller.test.ts
git commit -m "feat: make resolveRoute blockingSeverity-aware"
```

---

### Task 6: Thread threshold into phase validators

**Files:**
- Modify: `src/features/phase-control/phase-validators.ts`
- Test: `test/controller.test.ts` (add an exit-gate case)

**Interfaces:**
- Consumes: `BlockingSeverity`, `DEFAULT_BLOCKING_SEVERITY`.
- Produces:
  - `validatePhase(projectPath, phase, paths, activeIteration, blockingSeverity?: BlockingSeverity): PhaseValidation`
  - `validatePhaseExit(projectPath, phase, paths, activeIteration, blockingSeverity?: BlockingSeverity): PhaseValidation`

- [ ] **Step 1: Write the failing test**

Append to `test/controller.test.ts` (import `validatePhaseExit` alongside the existing `validatePhase` import):

```ts
test("recommended threshold: finding_repair exit is blocked while an open RECOMMENDED remains", () => {
  const changeDir = setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
    findings: validationFindings("repair_required", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Concern. | Fix it. |\n")
  });
  const paths = buildChangePaths(changeDir);

  const gate = validatePhaseExit(testTmpDir, "finding_repair", paths, 1, "recommended");

  expect(gate.ok).toBe(false);
  expect(gate.issues.join("\n")).toContain("blocking finding");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/controller.test.ts -t "finding_repair exit is blocked"`
Expected: FAIL (default must_fix treats RECOMMENDED as non-blocking → gate passes).

- [ ] **Step 3: Implement**

In `phase-validators.ts`:

1. Add import: `import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";`
2. `validatePhase` signature gains the trailing parameter:

```ts
export function validatePhase(
  projectPath: string,
  phase: ActivePhase,
  paths: ChangePaths,
  activeIteration: number | null,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): PhaseValidation {
```

3. Pass `blockingSeverity` into every `parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity)` call inside the switch (the `iteration_validation`, `final_validation`, and `finding_repair` cases — currently lines 111, 153, 191).
4. In the `finding_repair` case, also update the blocking-set label in the message (currently line 212) — replace the hardcoded `(MUST-FIX)` with `(${blockingSeverityLabel(blockingSeverity)})` after importing `blockingSeverityLabel`. At default this stays `(MUST-FIX)`.
5. `validatePhaseExit` signature gains the parameter and forwards it:

```ts
export function validatePhaseExit(
  projectPath: string,
  phase: ActivePhase,
  paths: ChangePaths,
  activeIteration: number | null,
  blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY
): PhaseValidation {
  const base = validatePhase(projectPath, phase, paths, activeIteration, blockingSeverity);
  if (!base.ok) {
    return base;
  }

  if (phase === "finding_repair") {
    const findings = parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity);
    // ...unchanged issue construction...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/phase-validators.ts test/controller.test.ts
git commit -m "feat: make phase validators blockingSeverity-aware"
```

---

### Task 7: Wire the threshold through remaining flow consumers

**Files:**
- Modify: `src/features/phase-control/check-flow.ts`
- Modify: `src/features/phase-control/advance-flow.ts`
- Modify: `src/features/phase-control/current-flow-state.ts`
- Modify: `src/features/phase-control/sync-state.ts`
- Modify: `src/features/phase-control/get-route-prompt.ts`
- Modify: `src/features/flow-status/get-status.ts`
- Modify: `src/features/artifact-ops/validate-artifact.ts`
- Test: `test/controller.test.ts` (one end-to-end-ish case via `checkPhase`)

**Interfaces:**
- Produces (all default to `DEFAULT_BLOCKING_SEVERITY`):
  - `checkPhase(projectPath, phaseOverride, changeName?, blockingSeverity?)`
  - `checkValidationCompletion(projectPath, options, changeName?, blockingSeverity?)`
  - `resolveCurrentState(projectPath, changeName?, blockingSeverity?)`
  - `syncState(projectPath, changeName?, blockingSeverity?)`
  - `getFlowStatus(projectPath, changeName?, blockingSeverity?)`
  - `validateArtifact(filePath, blockingSeverity?)`
  - `advanceFlow` / `getRoutePrompt` keep their signatures (already receive `Config`) and read `config.blockingSeverity`.

- [ ] **Step 1: Write the failing test**

Append to `test/controller.test.ts`:

```ts
test("recommended threshold: check reports finding_repair for an open RECOMMENDED", () => {
  setupChange(`
# Plan

## Iteration 1: API [~]
- [x] 1.1 Implement endpoint
`, {
    findings: validationFindings("repair_required", "iteration", "| F1 | open | RECOMMENDED | implementation | Iteration 1 | Concern. | Fix it. |\n")
  });

  const result = checkPhase(testTmpDir, undefined, undefined, "recommended");

  expect(result.phase).toBe("finding_repair");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/controller.test.ts -t "check reports finding_repair"`
Expected: FAIL (checkPhase has no 4th parameter; resolveRoute defaults to must_fix).

- [ ] **Step 3: Implement**

For each file, add `import { BlockingSeverity, DEFAULT_BLOCKING_SEVERITY } from "../../entities/validation-findings/blocking-severity";` (adjust relative path for `get-status.ts` / `validate-artifact.ts` which live under `../phase-control`/`../../entities` respectively) and thread the parameter:

- `check-flow.ts`
  - `checkPhase(projectPath, phaseOverride, changeName?, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`: pass to `resolveRoute(projectPath, changeName, blockingSeverity)` (line 76) and to `validatePhase(projectPath, phase, paths, activeIteration, blockingSeverity)` (line 98).
  - `checkValidationCompletion(projectPath, options, changeName?, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`: pass to `resolveRoute` (line 116) and `parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity)` (line 124).
- `advance-flow.ts` (already has `config`): pass `config.blockingSeverity` to `validatePhaseExit` (line 283) and to all `resolveRoute(projectPath, changeName, config.blockingSeverity)` calls (lines 276, 291, 305).
- `current-flow-state.ts`: `resolveCurrentState(projectPath, changeName?, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; pass to `resolveRoute` (line 12).
- `sync-state.ts`: `syncState(projectPath, changeName?, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; pass to `resolveRoute` (line 27).
- `get-route-prompt.ts` (already has `config`): pass `config.blockingSeverity` to `resolveRoute(projectPath, undefined, config.blockingSeverity)` (line 41).
- `get-status.ts`: `getFlowStatus(projectPath, changeName?, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; pass to `resolveCurrentState(projectPath, changeName, blockingSeverity)` (line 29) and `parseValidationFindingsArtifact(paths.findingsPath, blockingSeverity)` (line 60).
- `validate-artifact.ts`: `validateArtifact(filePath, blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY)`; in the `validation_findings` dispatch entry (line 30–33) call `parseValidationFindingsArtifact(f, blockingSeverity)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/controller.test.ts && npm run typecheck`
Expected: PASS and clean typecheck (all internal callers still compile because the parameter is defaulted).

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/check-flow.ts src/features/phase-control/advance-flow.ts src/features/phase-control/current-flow-state.ts src/features/phase-control/sync-state.ts src/features/phase-control/get-route-prompt.ts src/features/flow-status/get-status.ts src/features/artifact-ops/validate-artifact.ts test/controller.test.ts
git commit -m "feat: thread blockingSeverity through flow consumers"
```

---

### Task 8: Config-driven blocking-policy prose in prompt templates

**Files:**
- Create: `src/features/phase-control/blocking-severity-policy.ts`
- Modify: `src/features/phase-control/validation-common-contract.ts`
- Modify: `src/features/phase-control/prompt-render-helpers.ts`
- Modify: `src/features/phase-control/get-phase-prompt.ts`
- Modify: `templates/validation_common.md`
- Modify: `templates/artifacts/validation_findings.md`
- Test: `test/template-render-blocking-policy.test.ts` (new)

**Interfaces:**
- Produces: `renderBlockingSeverityPolicy(threshold: BlockingSeverity): string` in `blocking-severity-policy.ts`.
- `renderValidationCommonContract(stage, config)` supplies `blocking_severity_policy` to `renderTemplate`.
- `renderValidationFindingsTemplate(type: "iteration" | "final", date: string, blockingSeverity: BlockingSeverity)` supplies `blocking_severity_policy`.

- [ ] **Step 1: Write the failing test**

Create `test/template-render-blocking-policy.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { renderBlockingSeverityPolicy } from "../src/features/phase-control/blocking-severity-policy";
import { renderValidationCommonContract } from "../src/features/phase-control/validation-common-contract";
import { renderValidationFindingsTemplate } from "../src/features/phase-control/prompt-render-helpers";
import { DEFAULT_CONFIG } from "../src/entities/config/config";

describe("renderBlockingSeverityPolicy", () => {
  test("names the blocking set per threshold", () => {
    expect(renderBlockingSeverityPolicy("must_fix")).toContain("`RECOMMENDED` and `NIT` findings are non-blocking");
    expect(renderBlockingSeverityPolicy("recommended")).toContain("`MUST-FIX`, `RECOMMENDED`");
    expect(renderBlockingSeverityPolicy("nit")).toContain("ready_with_risks` is unavailable");
  });
});

describe("templates embed the policy without unresolved placeholders", () => {
  test("validation_common renders the recommended policy", () => {
    const rendered = renderValidationCommonContract("iteration_validation", { ...DEFAULT_CONFIG, blockingSeverity: "recommended" });
    expect(rendered).toContain("`NIT` findings are non-blocking");
    expect(rendered).not.toContain("{{");
  });

  test("validation_findings renders the nit policy", () => {
    const rendered = renderValidationFindingsTemplate("iteration", "2026-07-11", "nit");
    expect(rendered).toContain("every open finding blocks");
    expect(rendered).not.toContain("{{");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/template-render-blocking-policy.test.ts`
Expected: FAIL (`renderBlockingSeverityPolicy` missing; `renderValidationFindingsTemplate` has 2-arg signature).

- [ ] **Step 3: Implement**

1. Create `src/features/phase-control/blocking-severity-policy.ts`:

```ts
import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";

const POLICY: Record<BlockingSeverity, string> = {
  must_fix:
    "Blocking severities for this change: `MUST-FIX`. `RECOMMENDED` and `NIT` findings are non-blocking. `verdict: ready_with_risks` is allowed only when every open or reopened finding is `RECOMMENDED` or `NIT`.",
  recommended:
    "Blocking severities for this change: `MUST-FIX`, `RECOMMENDED`. `NIT` findings are non-blocking. `verdict: ready_with_risks` is allowed only when every open or reopened finding is `NIT`.",
  nit:
    "Blocking severities for this change: `MUST-FIX`, `RECOMMENDED`, `NIT` — every open finding blocks. `verdict: ready_with_risks` is unavailable; any open or reopened finding requires `verdict: repair_required`."
};

export function renderBlockingSeverityPolicy(threshold: BlockingSeverity): string {
  return POLICY[threshold];
}
```

2. `templates/validation_common.md` — in the **Readiness decision rule** section, add a policy bullet and make the `ready_with_risks` bullet reference it. Replace the current bullet (line 58) and insert the placeholder:

```markdown
Readiness decision rule:

- {{blocking_severity_policy}}
- `verdict: ready` means the validation scope is confirmed correctly solved for approved requirements, full code review found no open findings, full security review found no open findings, and review coverage was complete.
- `verdict: ready_with_risks` means the validation scope is confirmed correctly solved for blocking requirements, full code and security review coverage was complete, and open findings are limited to severities below the configured blocking threshold (see the blocking-severity policy above).
```

   (Leave the remaining two bullets of that section unchanged.)

3. `validation-common-contract.ts` — import `renderBlockingSeverityPolicy` and add the variable in `renderValidationCommonContract`:

```ts
  return renderTemplate("validation_common", {
    ...variables,
    skill_policy_inline_ref: renderSkillPolicyInlineRef(stage, config),
    skill_compliance_line: renderSkillComplianceLine(stage, config),
    blocking_severity_policy: renderBlockingSeverityPolicy(config.blockingSeverity)
  });
```

4. `templates/artifacts/validation_findings.md` — in the **Verdict contract** block replace the two severity-specific bullets (lines 23–24) and append the placeholder after `{{repaired_verdict_note}}`:

```markdown
Verdict contract:
- ready: use only when there are no open or reopened findings.
- ready_with_risks: use only when every open/reopened finding is below the blocking threshold (see blocking policy below).
- repair_required: use when at least one open/reopened finding is at or above the blocking threshold.
{{repaired_verdict_note}}
{{blocking_severity_policy}}
```

5. `prompt-render-helpers.ts` — `renderValidationFindingsTemplate` gains a `blockingSeverity` argument and supplies the variable:

```ts
export function renderValidationFindingsTemplate(type: "iteration" | "final", date: string, blockingSeverity: BlockingSeverity): string {
  return renderTemplate("artifacts/validation_findings", {
    date,
    artifact_type: type,
    allowed_verdicts: type === "iteration" ? ITERATION_ALLOWED_VERDICTS : FINAL_ALLOWED_VERDICTS,
    repaired_verdict_note: type === "iteration" ? REPAIRED_VERDICT_NOTE : "",
    blocking_severity_policy: renderBlockingSeverityPolicy(blockingSeverity)
  });
}
```

   Add imports for `renderBlockingSeverityPolicy` and `BlockingSeverity`. Update `finalValidationArtifactContract` to accept and forward a `blockingSeverity` argument into its `renderValidationFindingsTemplate("final", date, blockingSeverity)` call.

6. `get-phase-prompt.ts` — thread `config.blockingSeverity`:
   - `validationFindingsContract(...)` gains a `blockingSeverity` parameter and calls `renderValidationFindingsTemplate("iteration", date, blockingSeverity)`; its callers `renderIterationValidation` and `renderFindingRepair` pass `config.blockingSeverity`.
   - `renderFinalValidation` passes `config.blockingSeverity` into `finalValidationArtifactContract(...)`.
   - The repair-queue formatter `formatRepairQueue(findingsPath)` and `renderFindingRepair`: pass `config.blockingSeverity` into `parseCurrentValidationFindings(findingsPath, config.blockingSeverity)` so the queue reflects the threshold. Thread a `blockingSeverity` parameter into `formatRepairQueue`.
   - In `getPhasePrompt`, pass `config.blockingSeverity` into the `resolveRoute(projectPath, changeName, config.blockingSeverity)` call feeding `detectStateRouteConflict` (line 284).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/template-render-blocking-policy.test.ts test/controller.test.ts && npm run typecheck`
Expected: PASS; no template renders with `{{` remaining.

- [ ] **Step 5: Commit**

```bash
git add src/features/phase-control/blocking-severity-policy.ts src/features/phase-control/validation-common-contract.ts src/features/phase-control/prompt-render-helpers.ts src/features/phase-control/get-phase-prompt.ts templates/validation_common.md templates/artifacts/validation_findings.md test/template-render-blocking-policy.test.ts
git commit -m "feat: render config-driven blocking-severity policy in validation prompts"
```

---

### Task 9: CLI wiring + documented config key

**Files:**
- Modify: `src/cli.ts`
- Modify: `config.yaml` (repo root)
- Test: `test/cli.test.ts` (add an end-to-end case)

**Interfaces:**
- Consumes: existing `loadConfig`, `resolveConfigPath`, `parseConfigPath` in `cli.ts`.
- Produces: `status`, `check`, `check-validation`, `add-finding`, `reopen-finding`, `set-verdict`, `validate-artifact` command handlers pass `config.blockingSeverity`.

- [ ] **Step 1: Write the failing test**

Add to `test/cli.test.ts` a case that seeds a project whose `.phasedev/config.yaml` sets `blockingSeverity: recommended`, drives the flow to an iteration-validation state with an open `RECOMMENDED` finding via the CLI (`add-finding` + `set-verdict repair_required`), then asserts `phasedev check` reports `finding_repair`. Follow the existing cli.test.ts harness for invoking the CLI (it already spawns/loads the CLI entrypoint and creates a temp project). Concretely, after setup:

```ts
// config.yaml in the project sets: blockingSeverity: recommended
// add an open RECOMMENDED finding through the CLI, verdict repair_required
runCli(["add-finding", "Naming inconsistent", "RECOMMENDED", "--required-fix", "Rename", "--class", "implementation", "--iteration", "Iteration 1", "--project-path", projectPath]);
runCli(["set-verdict", "repair_required", "--project-path", projectPath]);

const check = runCli(["check", "--project-path", projectPath]);
expect(check.stdout).toContain("finding_repair");
```

> Use whatever `runCli` / project-setup helpers `test/cli.test.ts` already defines; do not invent a new harness. If the file drives the CLI by importing `main`, reuse that path. The load-bearing assertion is that a project-level `blockingSeverity: recommended` makes an open RECOMMENDED finding route to `finding_repair` through the real CLI.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test test/cli.test.ts -t "blockingSeverity"`
Expected: FAIL (CLI does not yet pass the threshold; check reports a non-repair phase).

- [ ] **Step 3: Implement**

In `src/cli.ts`, for each of the seven command branches, load config once near the top of the branch (matching the existing pattern):

```ts
    const config = loadConfig(resolveConfigPath(projectPath, parseConfigPath(args)));
```

and pass `config.blockingSeverity`:

- `status`: `getFlowStatus(projectPath, changeName, config.blockingSeverity)` (line 242).
- `add-finding`: `addFinding(targetFile, id, title, severity, requiredFix, className, iteration, findingsCreateContext(projectPath, changeName), config.blockingSeverity)` (line 446).
- `reopen-finding`: `reopenFinding(targetFile, id, evidence, config.blockingSeverity)` (line 540).
- `set-verdict`: `setFindingsVerdict(targetFile, verdict, findingsCreateContext(projectPath, changeName), config.blockingSeverity)` (line 577).
- `validate-artifact`: `validateArtifact(resolvedPath, config.blockingSeverity)` (line 368).
- `check`: `checkPhase(projectPath, phaseOverride, changeName, config.blockingSeverity)` (line 885).
- `check-validation`: `checkValidationCompletion(projectPath, parsed.options, changeName, config.blockingSeverity)` (line 907).

(The `advance` branch already loads `config` — no change beyond Task 7's internal use.)

In `config.yaml` (repo root), after `maxIterations: 10` (line 52), add:

```yaml

# Minimal validation-finding severity that blocks the flow (must_fix | recommended | nit).
# Default must_fix: only MUST-FIX findings block. recommended also blocks RECOMMENDED; nit blocks everything.
blockingSeverity: must_fix
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/cli.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts config.yaml test/cli.test.ts
git commit -m "feat: pass configured blockingSeverity from CLI commands and document the key"
```

---

### Task 10: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the focused suites named in CLAUDE.md**

Run:
```bash
bun test test/parser.test.ts test/controller.test.ts
bun test test/cli.test.ts test/config.test.ts
bun test test/blocking-severity.test.ts test/manage-findings.test.ts test/template-render-blocking-policy.test.ts
```
Expected: all PASS.

- [ ] **Step 2: Run the full suite and typecheck**

Run:
```bash
bun test
npm run typecheck
```
Expected: full suite green, typecheck clean (cross-module change → full suite is mandatory).

- [ ] **Step 3: CLI smoke of the new knob**

Run:
```bash
phasedev init --project-path /tmp/bseverity-smoke
grep blockingSeverity /tmp/bseverity-smoke/.phasedev/config.yaml
```
Expected: the generated project config contains `blockingSeverity: must_fix` (init copies root `config.yaml` verbatim).

- [ ] **Step 4: Commit any incidental fixes**

If the full suite surfaced an unadapted caller or a template drift, fix it in the owning file, re-run, and commit with a scoped message. Otherwise no commit.

---

## Self-Review

**Spec coverage:**
- §4.1 severity model → Task 1.
- §5.1 parser threading → Task 2.
- §4.2 config key → Task 3.
- §5.2 manage-findings → Task 4.
- §5.2 resolveRoute (+ fallback blocksPr) → Task 5.
- §5.2 validators → Task 6.
- §5.2/§5.3 remaining consumers + advance/get-route-prompt config read → Task 7.
- §6 templates + policy helper + renderers → Task 8.
- §5.4 CLI wiring + §7 documented key → Task 9.
- §9 verification → Task 10.
- §6.3 phase6b_final_validation.md — intentionally NOT modified (documented in spec §8); no task, by design.

**Type consistency:** `BlockingSeverity`, `DEFAULT_BLOCKING_SEVERITY`, `severityBlocks`, `blockingSeverityLabel`, `renderBlockingSeverityPolicy` names are used identically across tasks. `renderValidationFindingsTemplate(type, date, blockingSeverity)` 3-arg form introduced in Task 8 matches its callers updated in the same task. `parseValidationFindingsArtifact(filePath, blockingSeverity?)` and `parseCurrentValidationFindings(filePath, blockingSeverity?)` signatures are consistent between Tasks 2, 5, 6, 7, 8.

**Placeholder scan:** no TBD/TODO; every code step shows the code; every test step shows assertions. Two tests (Task 4, Task 9) reuse existing per-file harness variables (`tmpDir`, `runCli`) rather than reproducing them — flagged inline so the implementer binds to the file's real helper names.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-11-blocking-severity-threshold.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
