# B28 (core) — spec_sync Sub-Agent in the Archive Phase: Design

Source bug report (authoritative):
`/Users/oleksandr/MY/MainSecondBrain/02 Projects/PhaseDev AI Framework/backlog/B28-spec-drift-after-change.md`

Decisions locked 2026-07-18 in conversation with the user.

## Problem

After a series of archived changes, `.phasedev/specs/` stops describing the current
system: cancelled architectures survive in specs, neighboring specs contradict each
other, UI literals diverge from code, and delta headings (`## ADDED Requirements`)
leak into live spec files. Every change passed validation — the defect is that no
step in the cycle guarantees corpus coherence, and the spec merge is done by the
orchestrator itself with no mechanical check.

## Scope

B28 is decomposed. This change implements the core only:

- a `spec_sync` sub-agent that owns ALL spec work in the archive phase (B28 items 1, 2, 4, 5);
- a mechanical live-spec lint inside the existing `phasedev check-archive` command (B28 item 4).

Explicitly out of scope (user decisions):

- **No separate verifier agent** (B28 item 3). The user rejected a second LLM pass
  over the sync agent's edits as too token-expensive. `spec_sync` edits are not
  re-verified by another agent.
- **No new CLI helper for ripple input** (B28 item 2's mechanical extractor). The
  ripple name list is built by the sub-agent itself from git diffs, per prompt
  instructions — no new command.
- **No new artifact, no new `state.json` section, no `.phase-archive.json` fields.**
  Consequence, accepted: escalation decisions made by the user live only in the
  conversation and the resulting spec edits — they are not persisted as a
  dedicated record.
- Deferred to future changes: reversal bookkeeping (items 6–7), full-corpus sweep
  command (item 8), spec heading linter beyond `## Purpose` (item 9).

## Design

### 1. Archive phase prompt contract (`templates/phase7_archive.md`, `templates/quick_archive.md`)

Today the archive prompt instructs the orchestrator to classify R#s, write delta
specs, and merge them into `.phasedev/specs` itself. New contract:

**The orchestrator never edits specs.** The phase prompt instructs it to spawn one
`spec_sync` sub-agent and pass it a self-contained delegation prompt (a dedicated
section of the phase template). That delegation prompt contains:

1. **Existing duties, moved verbatim in meaning:** classify every R# (spec-level?,
   capability, operation), write delta specs under `{{archive_path}}/specs/`, then
   **merge** — never copy — the deltas into `.phasedev/specs`. Explicit merge rules:
   after the merge every touched live spec starts with `## Purpose`; delta headings
   (`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`) must not exist in live specs;
   when a requirement replaces a cancelled model, the obsolete requirement is
   removed, not left beside the new one.
2. **Ripple search (diff-driven):** take the change's diff using the commit
   boundaries recorded in `state.json` `commitLog` (`start..HEAD`); extract
   added/removed/renamed names — files, exports, classes, routes, CSS variables,
   DB fields, UI string literals; grep each name across the whole spec corpus;
   review every hit for statements the change made false. Token grep is the floor,
   not the ceiling: inside specs touched by the change, verify statements by
   meaning, not only by matched names.
3. **Gap control:** if a persistent entity added by the diff (DB column, route,
   env var, public CSS variable) is mentioned in no spec at all, that is a finding
   ("requirement not written"), not a clean result.
4. **UI literals:** any spec statement quoting user-facing text must be checked
   against the actual constant in code.
5. **Truth direction rule:** a divergence between spec and code is a finding, not
   an automatic edit. The sub-agent edits only the obvious case — the spec lagging
   behind a deliberate decision recorded in the change's PRD/plan. Every ambiguous
   case (possibly a code defect, unclear intent) is NOT edited; it is returned in
   the final report as an escalation item: spec file, quoted statement, what the
   code does, why the direction is unclear.

**Escalation loop (orchestrator side):** if the sub-agent's report contains
escalations, the orchestrator MUST stop, present the escalation list to the user
as questions, and MUST NOT set `.phase-archive.json` to `completed`. After the
user answers, it re-dispatches `spec_sync` (or a follow-up sub-agent) with the
decisions to apply, then proceeds.

**Quick flow gets an adapted contract, not a verbatim copy.** Quick changes have
no PRD and no R# requirements — only `worklog.md` (`## Task / ## Short
Specification / ## Plan`), and today's `quick_archive.md` writes a delta spec but
never merges it into `.phasedev/specs` (the live corpus is not updated at all).
The quick archive template gets its own `spec_sync` delegation section where:

- the classification input is `worklog.md` (Short Specification + implemented
  behavior), not R#s;
- the merge-into-live-specs step is ADDED (it does not exist today) with the same
  merge rules, ripple search, gap control, UI-literal check, truth-direction rule,
  and escalation contract as standard.

**Sequencing (both flows):** orchestrator spawns `spec_sync` → sub-agent writes
deltas and merges → orchestrator runs `phasedev check-archive` → if the
sub-agent's report has no escalations and the check passes, the orchestrator sets
`.phase-archive.json` to `completed`. The R#/worklog classification table in the
phase's final report is taken from the sub-agent's report. Existing template
guardrails (no catch-all specs, one spec file per functional area, R#s as the
only source, prefer omission over speculative requirements) move into the
delegation prompt unchanged.

### 2. Live-spec lint in `check-archive` (mechanical, zero tokens)

Lesson from the bug: a step that exists only as an orchestrator instruction gets
skipped — the gate must be mechanical. `checkArchiveCompletion()` (already run by
the archive agent and independently re-checked by `runArchive`) is extended to
also lint live specs under `.phasedev/specs`:

- **Rule A — no delta headings:** no line in a live `spec.md` may be a delta
  section heading (`## ADDED Requirements`, `## MODIFIED Requirements`,
  `## REMOVED Requirements`, `## RENAMED Requirements`). The check is
  fence-aware (project invariant): lines inside fenced code blocks are ignored,
  so a spec may legitimately quote the delta format in an example.
- **Rule B — purpose first:** the first `##`-level heading of a live `spec.md`
  must be `## Purpose`. An optional single leading `# `-title line is allowed
  before it. This is a convention ESTABLISHED by this change, not a pre-existing
  one — the bug report shows the corpus is mixed today. The delegation prompt
  therefore instructs `spec_sync` to normalize the heading of every touched spec
  to `## Purpose` during the merge; untouched specs with old headings produce
  only warnings.
- **Rule C — merge happened:** for every capability that has a delta in the
  current archive, `.phasedev/specs/<capability>/spec.md` must exist. This
  catches a wholesale skipped merge (delta written, live spec never created),
  which Rules A/B cannot see because they only lint existing files. Exception:
  a delta consisting solely of `## REMOVED Requirements` / `## RENAMED
  Requirements` sections may legitimately leave no live spec under the old
  capability name — such capabilities are exempt from Rule C (for RENAMED, the
  new name, when present in the delta, is checked instead).

Implementation notes:

- `checkArchiveCompletion()` currently receives only the archive path; the
  live-specs root is derived from it by walking up to the parent of `.phasedev`
  (the archive always lives under `.phasedev/changes/archive/`).
- `checkArchiveCompletion()` is a pure function (returns `{ok, message,
  issues}`) called from four contexts; corpus warnings are returned as a
  separate `warnings` field and printed to stderr by the CLI wrapper only —
  not `console.warn` inside the pure function.
- Rule A reuses the existing fence-aware helper
  (`src/shared/markdown/code-fences.ts`) and the existing delta-heading set in
  `check-archive.ts`; the new live-spec lint and the existing delta-spec
  validation operate on disjoint directories (`.phasedev/specs` vs
  `<archive>/specs`) and do not conflict.

Severity is scoped to avoid bricking projects with pre-existing drift:

- Live specs whose capability has a delta in the **current** archive: violations
  are **errors** — `check-archive` fails, archive cannot complete.
- All other live specs in the corpus: violations are **stderr warnings** listing
  the dirty files; they never block completion.

No other new commands, no config keys.

## Error handling

- Missing/empty `commitLog`: `commitLog.start` is written unconditionally at
  `create-change` time, so it is only absent when the repository had no HEAD
  commit at that moment (fresh repo). For that case the delegation prompt tells
  the sub-agent to fall back to asking git for the change branch's diff, and to
  state in its report which diff source it used.
- Escalation compliance is NOT mechanically guaranteed: the stop-on-escalations
  rule is an orchestrator instruction, and the lint only checks merge hygiene.
  This residual risk is accepted (see Frozen-contract notes).
- Sub-agent cannot ask the user mid-task: all context (paths, rules, escalation
  format) lives in the delegation prompt; ambiguity always resolves to "escalate
  in the report", never to guessing.
- `check-archive` on a project with no `.phasedev/specs` directory keeps its
  current behavior (nothing to lint).

## Testing

Mechanical (automated, `bun test`):

- `check-archive` lint unit tests: delta heading in a touched live spec → fail;
  delta heading in an untouched live spec → pass with warning; missing
  `## Purpose` in a touched spec → fail; delta heading inside a fenced code
  block → pass; capability with a delta but no live spec file → fail (Rule C);
  REMOVED-only / RENAMED-only delta with no live spec under the old name →
  pass (Rule C exemption); corpus warnings returned in a `warnings` field and
  printed only by the CLI wrapper; clean corpus → pass.
- Template/prompt tests (existing pattern): archive prompt contains the
  `spec_sync` delegation section, the escalation stop rule, and no longer
  instructs the orchestrator to merge specs itself; quick template likewise.
- e2e flow test updated for the new prompt wording and lint behavior.

Behavioral (manual acceptance, cannot be a `bun test`):

- Regression scenario from the bug report: a synthetic fixture project with a
  chain of changes where a later change reverses earlier decisions. Expected:
  a `spec_sync` run reproduces finding classes 1–3 (cancelled model, phantom
  behavior, cross-spec ripple), flags an unmentioned new persistent entity
  (class 4), and escalates instead of silently editing where direction is
  ambiguous. Recorded here as a manual acceptance procedure for the change.

## Acceptance criteria

- [ ] Archive phase prompt (standard + quick) delegates all spec work to one
      `spec_sync` sub-agent; orchestrator no longer edits specs.
- [ ] Delegation prompt covers: R# classification (standard) / worklog-based
      classification (quick), delta specs, merge rules, diff-driven ripple
      search via `commitLog`, gap control, UI literal check, truth-direction
      rule with escalation, existing template guardrails.
- [ ] Quick archive template gains the merge-into-live-specs step it lacks
      today.
- [ ] Orchestrator contract: unresolved escalations block `status: completed`
      and are surfaced to the user as questions.
- [ ] `check-archive` fails when a live spec touched by the current archive
      contains a delta heading (outside code fences), lacks `## Purpose`, or is
      missing entirely for a delta'd capability; warns (stderr) for the rest of
      the corpus; zero LLM calls involved.
- [ ] Focused tests plus full `bun test` and `npm run typecheck` pass.

## Frozen-contract notes

- Archive mutation ownership (standalone `phasedev archive`, advance archive-silent)
  is untouched.
- `state.json` and `config.yaml` surfaces are untouched; `commitLog` is read via
  existing accessors only.
- Prompt template changes are intentional wording/meaning updates approved by the
  user in the B28 conversation (2026-07-18).
- Deviation from the bug report, per explicit user decision (2026-07-18): the
  bug report's acceptance items requiring a mechanical CLI gate on a recorded
  `spec_sync` verdict and a separate verifier agent are superseded. There is no
  verdict artifact; the only mechanical gate is the live-spec lint, and the
  escalation stop is a prompt-level contract.
- Behavior change in quick flow: quick archive now merges deltas into
  `.phasedev/specs` (previously it never updated the live corpus). Approved as
  part of this design.
