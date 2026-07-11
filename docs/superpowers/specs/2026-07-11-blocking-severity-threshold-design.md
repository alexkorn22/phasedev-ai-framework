# Configurable Blocking-Severity Threshold — Design Spec

**Status:** Approved design (do not redesign). Written 2026-07-11.
**Scope owner:** PhaseDev AI Framework (`PhaseDev` package, TypeScript + Bun).

## 1. Problem

Today only `MUST-FIX` validation findings block the flow. Everywhere the
controller reasons about "does this finding stop the flow" it derives blocking
from `severity === "MUST-FIX"`:

- routing an open blocking finding into `finding_repair`
  (`src/features/phase-control/flow-route.ts`),
- gating phase validity and phase exit
  (`src/features/phase-control/phase-validators.ts`),
- verdict-consistency semantics in the findings parser
  (`src/entities/validation-findings/parse-validation-findings.ts`),
- verdict auto-correction on `add-finding` / `reopen-finding`
  (`src/features/artifact-ops/manage-findings.ts`).

`RECOMMENDED` and `NIT` never block. Users want a single `config.yaml` knob that
chooses the minimal severity that must be fixed before the flow can proceed.

## 2. Approved decisions (binding)

These were agreed with the user and MUST NOT be re-litigated by the
implementer.

1. **New top-level `config.yaml` key** `blockingSeverity`, enum
   `must_fix | recommended | nit`, default `must_fix`. Default is bit-for-bit
   the current behavior; there is no migration.
2. **Semantics:** the value is the *minimal severity that blocks*. Ordering
   `nit < recommended < must_fix`. A finding blocks when its severity rank is at
   or above the configured rank:
   - `must_fix` → only `MUST-FIX` blocks (current behavior).
   - `recommended` → `MUST-FIX` and `RECOMMENDED` block; `NIT` does not.
   - `nit` → every open finding blocks.
3. **Invalid value → config parse error**, same style as other config keys
   (throws from `parseConfig`).
4. **One global key.** It applies equally to `iteration_validation` and
   `final_validation`. No per-phase threshold.
5. **Single point of truth.** The threshold is threaded into
   `parse-validation-findings.ts`, where `blocksPr` / `openBlockingRows` /
   `openNonBlockingRows` are derived. Every downstream consumer follows
   automatically once its caller passes the config value. **Do NOT filter at
   call sites** (no `rows.filter(severity===...)` sprinkled around).
6. **Verdict semantics** (this amends the frozen `ready_with_risks` contract in
   CLAUDE.md; the amendment is **approved by user in conversation 2026-07-11**):
   - `verdict: ready` — unchanged; allowed only when there are **no** open or
     reopened findings at all.
   - `verdict: ready_with_risks` — allowed only when every open/reopened finding
     is **below** the configured threshold. When threshold is `nit` this verdict
     is unreachable: any open finding forces `repair_required`.
   - `verdict: repair_required` / `repaired` — evaluated relative to the
     threshold (at least one / zero open findings at or above the threshold).
7. **Security-class rule is untouched.** `security` findings must always be
   `MUST-FIX` (parse-time enforcement); they therefore block at every threshold.
8. **Prompt templates** must present the same blocking lens to the validating
   agent as the controller uses. A config-rendered placeholder replaces the
   hardcoded "RECOMMENDED or NIT are non-blocking" prose.

## 3. Out of scope (do NOT touch)

`maxRepairCycles` / `repairCycleCount`; findings table column format; new
severities; `state.json` shape; per-phase thresholds; the commit-checkpoint
feature from `temp/roadmap.md`.

## 4. Data model

### 4.1 New severity model — `src/entities/validation-findings/blocking-severity.ts` (new file)

```ts
export type BlockingSeverity = "must_fix" | "recommended" | "nit";

export const BLOCKING_SEVERITY_VALUES: readonly BlockingSeverity[] =
  ["must_fix", "recommended", "nit"] as const;

export const DEFAULT_BLOCKING_SEVERITY: BlockingSeverity = "must_fix";

// Row severity is one of ValidationFindingSeverity: "MUST-FIX" | "RECOMMENDED" | "NIT".
// A row blocks when rank(rowSeverity) >= rank(threshold).
export function severityBlocks(
  rowSeverity: ValidationFindingSeverity,
  threshold: BlockingSeverity
): boolean;

// Human label naming the blocking set, for controller self-check messages.
//   must_fix     -> "MUST-FIX"
//   recommended  -> "MUST-FIX or RECOMMENDED"
//   nit          -> "MUST-FIX, RECOMMENDED, or NIT"
export function blockingSeverityLabel(threshold: BlockingSeverity): string;
```

Rank tables (internal constants):
`{ "NIT": 0, "RECOMMENDED": 1, "MUST-FIX": 2 }` for row severity and
`{ nit: 0, recommended: 1, must_fix: 2 }` for the threshold.

`blockingSeverityLabel("must_fix")` returns exactly `"MUST-FIX"`, so every
existing controller message that reads `... MUST-FIX findings exist` stays
byte-identical at the default and remains correct at other thresholds.

**Dependency direction:** `blocking-severity.ts` imports only the
`ValidationFindingSeverity` type from `parse-validation-findings.ts` (same
entity). `parse-validation-findings.ts` imports the helpers from
`blocking-severity.ts`. No cycle, because neither imports `config`. `config.ts`
imports the type/values from this file (entity→entity, same pattern config
already uses to import `phase` and `change`).

### 4.2 Config — `src/entities/config/config.ts`

- `Config` interface (currently lines 17–23): add `blockingSeverity: BlockingSeverity;`.
- `DEFAULT_CONFIG` (currently lines 31–37): add `blockingSeverity: "must_fix"`.
- New reader modeled on `readBoolean` / `readPositiveInteger`:

```ts
function readBlockingSeverity(value: unknown, fallback: BlockingSeverity, key: string): BlockingSeverity {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !BLOCKING_SEVERITY_VALUES.includes(value as BlockingSeverity)) {
    throw new Error(`Config key ${key} must be one of: ${BLOCKING_SEVERITY_VALUES.join(", ")}.`);
  }
  return value as BlockingSeverity;
}
```

- `parseConfig` (currently returns at lines 285–291): add
  `blockingSeverity: readBlockingSeverity(root.blockingSeverity, DEFAULT_CONFIG.blockingSeverity, "blockingSeverity")`.
- `loadConfig` returns `DEFAULT_CONFIG` when the file is missing — inherits the
  default automatically; no change needed there.

## 5. Threading contract

The chosen mechanism is a **defaulted parameter** on each function that reasons
about blocking. Every such function gains a trailing
`blockingSeverity: BlockingSeverity = DEFAULT_BLOCKING_SEVERITY` parameter (or,
for functions that already receive `Config`, reads `config.blockingSeverity`).
Because the default equals the current behavior, every existing test and every
not-yet-updated internal caller keeps compiling and behaving exactly as today.
The real CLI command handlers load config once and pass `config.blockingSeverity`
down the chain.

### 5.1 Entity: `parse-validation-findings.ts`

- `parseValidationFindingsArtifact(filePath, blockingSeverity = DEFAULT_BLOCKING_SEVERITY)`.
- `parseCurrentValidationFindings(filePath, blockingSeverity = DEFAULT_BLOCKING_SEVERITY)` → forwards to the above.
- Row push (currently line 281): `blocksPr: severityBlocks(severity as ValidationFindingSeverity, blockingSeverity)`.
- `artifactWithDerivedRows` (currently lines 132–134): change the two derivations
  to key off the already-computed `blocksPr`, so there is a single source of truth:
  `openBlockingRows = openRows.filter(r => r.blocksPr)`,
  `openNonBlockingRows = openRows.filter(r => !r.blocksPr)`. (This function then
  needs no threshold parameter; the early-return empty-rows paths are unaffected.)
- Verdict-consistency block (currently lines 302–325): the three messages that
  name `MUST-FIX` become
  `... open or reopened ${blockingSeverityLabel(blockingSeverity)} finding(s) ...`.
  At default the strings are unchanged. The `verdict: ready` message (no severity
  mention) is unchanged. Issue **codes** are unchanged — `flow-route.ts` keys its
  bypass set on codes, not messages.

### 5.2 Feature functions that gain the parameter

Each forwards the threshold to `parseValidationFindingsArtifact` / `resolveRoute`
/ `validatePhase` as applicable:

| File | Function(s) |
|---|---|
| `flow-route.ts` | `resolveRoute(projectPath, changeName, blockingSeverity=DEFAULT)` |
| `phase-validators.ts` | `validatePhase(..., blockingSeverity=DEFAULT)`, `validatePhaseExit(..., blockingSeverity=DEFAULT)` |
| `check-flow.ts` | `checkPhase(projectPath, phaseOverride, changeName, blockingSeverity=DEFAULT)`, `checkValidationCompletion(projectPath, options, changeName, blockingSeverity=DEFAULT)` |
| `current-flow-state.ts` | `resolveCurrentState(projectPath, changeName, blockingSeverity=DEFAULT)` |
| `sync-state.ts` | `syncState(projectPath, changeName, blockingSeverity=DEFAULT)` |
| `get-status.ts` | `getFlowStatus(projectPath, changeName, blockingSeverity=DEFAULT)` |
| `manage-findings.ts` | `addFinding(..., blockingSeverity=DEFAULT)`, `reopenFinding(..., blockingSeverity=DEFAULT)`, `setFindingsVerdict(..., blockingSeverity=DEFAULT)` |
| `validate-artifact.ts` | `validateArtifact(filePath, blockingSeverity=DEFAULT)` |

Additional in-file edits driven by the threshold:

- `flow-route.ts` fallback that picks the iteration under repair (currently the
  `findings.rows.filter(row => row.severity === "MUST-FIX")` block around lines
  183–186): change the predicate to `row.blocksPr` so a `RECOMMENDED` finding
  that triggered repair under a lower threshold is also considered.
- `manage-findings.ts` `correctedVerdict` (currently lines 126–131): replace
  `addedSeverity.toUpperCase() === "MUST-FIX"` with
  `severityBlocks(normalizedSeverity, blockingSeverity)`. Behavior at default is
  unchanged; the `!isBlocking && current === "ready"` → `ready_with_risks` branch
  never fires at threshold `nit` (correct — `ready_with_risks` is then
  unreachable).
- `manage-findings.ts` `verdictConsistencyIssue` (currently lines 162–170):
  compute `openBlocking` via `severityBlocks(row.severity, blockingSeverity)` and
  name the set with `blockingSeverityLabel`.

### 5.3 Functions that already receive `Config` — read `config.blockingSeverity`

No signature change; they pass `config.blockingSeverity` into the calls above:

- `advance-flow.ts` `advanceFlow(projectPath, config, changeName)`: pass to
  `validatePhaseExit` and all three `resolveRoute` calls.
- `get-phase-prompt.ts` `getPhasePrompt(projectPath, config, changeName)` and its
  render helpers: pass to `resolveRoute` (the `detectStateRouteConflict` input),
  to `parseCurrentValidationFindings` in the repair-queue formatter, and into the
  validation-findings artifact contract rendering (§6).
- `get-route-prompt.ts` `getRoutePrompt(projectPath, config)`: pass to its
  `resolveRoute` call.

### 5.4 CLI wiring — `src/cli.ts`

The `advance` command already loads `config`. The following command handlers must
load config once (`loadConfig(resolveConfigPath(projectPath, parseConfigPath(args)))`,
matching the existing pattern at lines 617/663/808/841) and pass
`config.blockingSeverity` into the feature call:

- `status` → `getFlowStatus`
- `check` → `checkPhase`
- `check-validation` → `checkValidationCompletion`
- `add-finding` → `addFinding`
- `reopen-finding` → `reopenFinding`
- `set-verdict` → `setFindingsVerdict`
- `validate-artifact` → `validateArtifact`

## 6. Prompt templates

The blocking lens shown to the validating agent must be rendered from
`config.blockingSeverity`. A shared feature helper produces the prose so both
renderers stay DRY:

`src/features/phase-control/blocking-severity-policy.ts` (new file):

```ts
export function renderBlockingSeverityPolicy(threshold: BlockingSeverity): string;
```

Exact rendered strings:

- `must_fix`:
  "Blocking severities for this change: `MUST-FIX`. `RECOMMENDED` and `NIT`
  findings are non-blocking. `verdict: ready_with_risks` is allowed only when
  every open or reopened finding is `RECOMMENDED` or `NIT`."
- `recommended`:
  "Blocking severities for this change: `MUST-FIX`, `RECOMMENDED`. `NIT` findings
  are non-blocking. `verdict: ready_with_risks` is allowed only when every open
  or reopened finding is `NIT`."
- `nit`:
  "Blocking severities for this change: `MUST-FIX`, `RECOMMENDED`, `NIT` — every
  open finding blocks. `verdict: ready_with_risks` is unavailable; any open or
  reopened finding requires `verdict: repair_required`."

### 6.1 `templates/validation_common.md`

Under **Readiness decision rule** (currently lines 55–60): insert a
`{{blocking_severity_policy}}` line, and rewrite the `ready_with_risks` bullet
(currently line 58) so it references the policy instead of hardcoding "RECOMMENDED
or NIT". `renderValidationCommonContract` (`validation-common-contract.ts`)
already receives `config`; it supplies `blocking_severity_policy:
renderBlockingSeverityPolicy(config.blockingSeverity)` to `renderTemplate`.

### 6.2 `templates/artifacts/validation_findings.md`

In the **Verdict contract** block (currently lines 21–25): replace the hardcoded
`ready_with_risks`/`repair_required` severity wording with threshold-generic text
and add `{{blocking_severity_policy}}`. `renderValidationFindingsTemplate`
(`prompt-render-helpers.ts`) gains a `blockingSeverity` argument and supplies the
new variable. Its two callers thread the value:
`validationFindingsContract` (`get-phase-prompt.ts`) and
`finalValidationArtifactContract` (`prompt-render-helpers.ts`).

### 6.3 `templates/phase6b_final_validation.md` — no change (see §8 discrepancy)

The design brief listed this template as hardcoding "MUST-FIX blocks" prose.
Verification shows it does **not** carry a standalone blocking-threshold
statement: its only severity mention (risk-acceptance findings must be
`RECOMMENDED` or `MUST-FIX`) is severity *classification*, not the blocking
threshold. Its blocking lens is inherited through the embedded
`{{validation_common_contract}}` (§6.1) and the embedded validation-findings
contract (§6.2). Editing it would add an unused change and violate the locality
rule, so this file is intentionally left unchanged.

### 6.4 Rendering safety

`render-template.ts` throws on any unresolved `{{...}}`. Every template that
gains `{{blocking_severity_policy}}` MUST have its renderer supply that key, or
rendering fails at runtime. This is the enforced invariant.

## 7. Documentation of the key

`init` copies the bundled root `config.yaml` verbatim into new projects
(`init-project.ts` → `readInitialConfig`). Add a documented
`blockingSeverity: must_fix` line to the root `config.yaml` (after the existing
root-level flow flags) so new projects surface the knob. Keep `DEFAULT_CONFIG`
as the code-level fallback (used only when no `config.yaml` exists).

## 8. Discrepancies found vs. the design brief's file/line claims

1. **More consumers than listed.** Beyond `flow-route.ts`, `phase-validators.ts`,
   and `manage-findings.ts`, the threshold-dependent parser output is also read
   by `check-flow.ts` (both `checkPhase` and `checkValidationCompletion`),
   `flow-status/get-status.ts` (`blockingCount`), and
   `artifact-ops/validate-artifact.ts` (surfaces verdict-consistency issues).
   `resolveRoute` (which itself must become threshold-aware) is additionally
   called from `current-flow-state.ts`, `get-route-prompt.ts`, `sync-state.ts`,
   and twice inside `advance-flow.ts`. All are threaded (§5). `findings-baseline.ts`
   uses the parser only for row identity (baseline diff) and is intentionally
   **not** threaded.
2. **`resolveRoute` fallback also references `MUST-FIX`** (lines ~183–186) for
   picking the iteration under repair — an extra threshold-relevant spot not in
   the brief; changed to `row.blocksPr` (§5.2).
3. **`phase6b_final_validation.md` has no standalone blocking prose** to
   parameterize (§6.3); the placeholder work lands in `validation_common.md` and
   `artifacts/validation_findings.md` only.
4. **`validatePhase`/`validatePhaseExit` currently take no `Config`**, so they
   receive the threshold as an explicit defaulted parameter rather than reading
   it from config (§5.2).
5. Cited line numbers in the brief are otherwise accurate to within a few lines:
   parser derivations at 132–134 and 281; verdict-consistency at 302–325; config
   interface 17–23, `DEFAULT_CONFIG` 31–37, `parseConfig` 255–292;
   `manage-findings` correctedVerdict 126–131 and `verdictConsistencyIssue`
   162–170; `flow-route` routing at 138/147–148; validators 211–213 and 246–260.

## 9. Verification strategy

- Config: parse `must_fix`/`recommended`/`nit`, default when absent, throw on
  invalid — `test/config.test.ts`.
- Severity model unit tests for `severityBlocks` / `blockingSeverityLabel`.
- Parser at each threshold: `blocksPr`, `openBlockingRows`, `openNonBlockingRows`,
  and verdict-consistency issues — `test/parser.test.ts`. Existing default-threshold
  assertions (including the exact `MUST-FIX` message strings at
  `test/parser.test.ts:2278–2279`) must remain green unchanged.
- Routing into `finding_repair` at `recommended` with an open `RECOMMENDED`
  finding; and no routing at `must_fix` for the same fixture —
  `test/controller.test.ts`.
- Phase-exit gate blocks/allows per threshold — `test/controller.test.ts`.
- `add-finding` / `set-verdict` verdict correction and consistency per threshold —
  `test/manage-findings.test.ts`.
- Prompt rendering: `validation_common` and `validation_findings` embed the
  correct policy per threshold, and no template renders with an unresolved
  placeholder.
- Full suite (`bun test`) and `npm run typecheck` at the end. Cross-module change,
  so the full suite is mandatory, not just focused files.

## 10. Frozen-contract compliance

All CLAUDE.md "Behavior To Preserve" and skill-policy contracts remain binding
and unchanged **except** the `ready_with_risks` amendment in §2.6, explicitly
approved by the user in conversation 2026-07-11. Default config reproduces
current behavior bit-for-bit (no migration, all current tests green).
