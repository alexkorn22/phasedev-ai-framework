---
name: express-orchestrator
description: Fast stateless track that runs a small code change end-to-end through dedicated sub-agents (research → plan → implement → review) leaving zero execution artifacts — no planning files, no logs, no state files, no notes; the only output is the code change itself. Use whenever the user types "$express-orchestrator", and also whenever they ask for a quick/small bugfix, tweak, minor refactor, config change, or narrow feature and want it done fast without any paper trail.
---

# Express Orchestrator — Stateless Sub-Agent Flow

Run a small change end-to-end through dedicated sub-agents while keeping every working artifact in the orchestrator's own context. Create no files of any kind beyond the repo code, tests, and docs the change itself requires — no state files, no worklogs, no plans on disk, no notes, no logs. The only output of the flow is the changed code.

Invocation: `/express-orchestrator <task description>`.

No resume: if the session is lost mid-flight, inspect the current state of the touched files and restart from there.

## Scope Guard — Check First, Re-check Mid-flight

Express fits only when ALL of these hold:

- Expected change: **≤ 5 files** and **≤ ~200 lines**.
- Behavior described in the project's specs (if it keeps any) does not change materially.
- The root cause is already known or findable in **one research pass**.
- The user does not want a persistent planning record.

If any condition breaks — at assessment or at any later point — STOP, tell the user the task exceeds Express scope, and ask how to proceed: split it into smaller Express-sized pieces, continue anyway at their explicit request, or handle it outside this skill. Never silently continue an oversized task. If work is already in progress, follow the Abort Protocol.

## Path Selection: Standard vs Micro

Classify at step 1 and state the choice at plan confirmation:

- **Standard** — the default flow below.
- **Micro** — expected change ≤ ~10 lines in 1 file AND the cause is obvious from the task itself. Merge research + planning into ONE scout-planner dispatch (a single agent maps the exact spot, captures the fingerprint, and produces the plan). Everything else stays identical: confirmation stop, separate implementer, fresh reviewer, triage, fix loop. Minimum cost: 3 dispatches.

## Context Is the Only Store

- The task, fingerprints, plan, implementation report, and review verdicts live in this conversation; carry the needed slices into every dispatch.
- Sub-agents share nothing and cannot ask the user — each dispatch must contain the exact context its agent needs.
- Language: talk to the user in the user's language (plan at confirmation, questions, final/abort reports); run all dispatches and sub-agent reports in English.
- Never write planning, tracking, note, log, or scratch files — neither the orchestrator nor any sub-agent. If it feels like an artifact, it belongs in the conversation.
- Report caps: research ≤ ~40 lines, plans ≤ ~30, reviews ≤ ~30, proof excerpts ≤ ~15 lines (decisive output only: pass/fail summary, relevant errors).

## Before-Fingerprints — the Substitute for Change History

There is no change tracking, so review needs a captured "before" state. During research (or scout-planning), record a **fingerprint** for every region expected to change: `path:lines — one-line description of current behavior`. Fingerprints live in the research report and travel into the planner, implementer, and reviewer dispatches. Reviewers verify changes against them; without fingerprints a reviewer cannot tell what changed.

## The Flow

1. **Understand.** Read the task. Run the scope guard, pick the path (Standard/Micro). Ask the user all clarifying questions now — sub-agents cannot reach the user.
2. **Research (Standard).** Spawn read-only research sub-agent(s) — in parallel when they cover independent areas — to map the files involved, current behavior, constraints, and capture the fingerprints. (Micro: merged into step 3.)
3. **Plan.** Spawn a planning sub-agent — the orchestrator never writes the plan itself. Dispatch carries the task + research findings. Report = plan per template: task restated, expected behavior, concrete steps, exact `path:lines` to touch (from fingerprints), proof rung + exact commands.
4. **STOP — plan confirmation.** Show the plan verbatim (user's language) plus: scope-guard verdict, chosen path, and the explicit warning — *"changes will be applied directly to working files; this flow has no rollback mechanism"*. Get explicit confirmation. This is the single mandatory stop.
5. **Implement.** Spawn an implementation sub-agent with the confirmed plan + relevant fingerprints. It implements, proves the work per the Proof Ladder, and reports per template — listing every changed file as `path:lines — was → now`. For bugfixes: if the repo has a test suite covering the touched area, add a regression test. Restate in the dispatch the coding rules the project's CLAUDE.md / AGENTS.md mandates.
6. **Review.** Spawn reviewers in fresh contexts — never the implementer reviewing itself. The code reviewer gets the plan + fingerprints + implementer report and reads the actual files to verify three things: (a) reported files/regions match the plan — anything extra or missing is a finding; (b) the changes at the reported ranges implement the plan correctly; (c) the rest of each touched file shows no unreported edits inconsistent with the fingerprints. A security reviewer runs whenever the change touches: input parsing, paths, shell, permissions, secrets, network, auth/sessions, SQL/queries, HTML/template output (XSS), (de)serialization, file uploads, or crypto. Reviewers may run in parallel. Reviewer checklist item: if the change makes any project spec/doc wrong, fix it in place when trivial, otherwise report it — never create new spec files, never escalate over documentation alone.
7. **Triage.** Severity tags make it mechanical: `correctness`, `security`, and `plan-deviation` findings loop back; `nit` findings are applied trivially during the next fix pass or dropped — they never justify a loop on their own.
8. **Fix loop — max 7 cycles.** Dispatch only the OPEN findings (by ID) + the plan to an implementation sub-agent, then re-review **only** the files changed by the fix plus explicit verification of each open finding — never a full re-review. From cycle 2 on, reviewers report deltas: new findings, still-open findings, and resolved ones as a single line each. Escalation inside the loop: a finding surviving 2 cycles → next fix dispatch one tier up; the SAME finding surviving 3 cycles = the approach is wrong — stop and either re-plan (new confirmation) or ask the user. Fixes that materially change the approach → stop and re-confirm. Not clean after 7 cycles → Abort Protocol.
9. **Report (user's language).** Done; the list of changed files with a brief per-file summary; what was verified and how (proof rung + result); specs status (untouched / fixed in place / needs attention).

## Abort Protocol

On ANY abnormal stop — mid-flight scope trip, a finding stuck 3 cycles, the 7-cycle cap, or a sub-agent failure after escalation — report to the user (their language): every file touched so far with the changed ranges and its current state (consistent / possibly broken), which findings remain open, what was and wasn't verified, and sensible options (revert via editor local history or backups, finish manually, re-plan). Never end silently with the working files in an unknown state.

## Proof Ladder

Verification = review + the strongest applicable proof. Pick the highest rung that applies:

1. Tests exist for the touched area → run the **narrow set covering that area** (name the test files/filters and why that scope suffices; the full suite only if the project is tiny or the project contract demands it), plus the new regression test.
2. The change is runnable → run it for real; show command + output.
3. Not directly runnable (types, config wiring) → typecheck / lint / build; show output.
4. Pure docs/comments → review alone suffices.

Claiming a rung without showing its command output does not count as proof.

## Report Templates

Sub-agents fill these exactly — no free-form prose around them.

**Research / scout:**
```
STATUS: ok | blocked
FINGERPRINTS: path:lines — current behavior (one line per region)
CONSTRAINTS: <relevant conventions, dependencies, gotchas>
BLOCKERS: <or "none">
```

**Plan:**
```
TASK: <restated>
BEHAVIOR: <expected after the change>
STEPS: <numbered>
FILES: path:lines <per region, from fingerprints>
PROOF: <ladder rung + exact commands>
RISKS: <or "none">
```

**Implementer:**
```
STATUS: done | blocked
FILES: path:lines — was → now (one line per file)
PROOF: <commands + trimmed decisive output>
BLOCKERS: <or "none">
```

**Reviewer:**
```
VERDICT: clean | findings
FINDINGS: F<n> [correctness|security|plan-deviation|nit] path:lines — what & why
RESOLVED: F<n>, ... (cycle 2+ only)
SPECS: untouched | fixed in place | needs attention
```

Finding IDs are global across the whole flow (F1, F2, …) — never renumbered between cycles.

## Sub-Agent Dispatch

**Tool.** Spawn sub-agents with the `Task` tool (`subagent_type` parameter). On every dispatch, check which agent types the current session offers: a custom type whose description matches the stage takes priority (e.g. a project's implementer/reviewer/security agents); fall back to the general-purpose type only when nothing custom fits. Make this judgment fresh per dispatch — never keep a static stage→type table.

**Model — grade every dispatch.** Grade THIS stage's actual work (not the whole task's) and pick the cheapest tier that genuinely handles it:

| Stage work looks like | Tier | Model |
|---|---|---|
| Mechanical, fully specified: rename, doc sync, config value, transcribing a complete spec into code, single-file fix | cheapest | haiku |
| Routine judgment in one module: typical research, scout-planning a Micro change, implementation from a clear confirmed plan, review of a small low-risk change | mid | sonnet |
| Real reasoning: planning a tricky change, root-cause debugging, security review, review of a large or risky change | strongest | opus |

Use the current model aliases of your environment; the tiers are what matter.

- Generic agent types: always pass an explicit `model` equal to the graded tier — omitting it silently inherits the orchestrator's (usually most expensive) model.
- Custom types with a pinned model: never override it. Custom types without one: pass the graded tier explicitly.
- For reviewers and for implementers working from prose (not complete code), the mid tier is the floor — an under-powered model takes 2–3× the turns and costs more overall.
- Escalate on evidence: if a report shows the stage was harder than graded, re-dispatch the remainder one tier up. Never retry the same dispatch unchanged.

**Failure handling.** If a sub-agent fails, times out, or returns an incoherent/off-mission report: re-dispatch once with a clarified prompt at the same tier → if it fails again, once more one tier up → then STOP and follow the Abort Protocol. Never loop blind retries.

**Dispatch prompt recipe** — every dispatch contains, in order:

1. **Stage mission** — who the agent is and what this stage must produce.
2. **Context block** — exactly the slices this stage needs (task, fingerprints, confirmed plan, open findings by ID, changed-file list), nothing more.
3. **Constraints** — zero-artifact rules (create no files of your own — no plans, notes, logs, or scratch files; touch only the repo code, tests, and docs the change itself requires), plus the project's coding-contract rules for coding stages.
4. **Proof requirement** — the Proof Ladder rung and the exact commands the agent must run and show output for before claiming success.
5. **Report contract** — the exact template from Report Templates, within the size caps. The report is data for the orchestrator, not prose for the user.

## Hard Rules

1. NEVER do stage work in the main context — research, planning, implementation, and review are always sub-agent work; the orchestrator only understands the task, talks to the user, dispatches, and routes context.
2. NEVER create execution artifacts — no planning, tracking, note, log, or scratch files anywhere, by anyone; the conversation is the only store; the changed code is the only output.
3. The plan comes from a planning sub-agent and runs only after explicit user confirmation — including the no-rollback warning. The single mandatory stop.
4. Reviewers are fresh contexts, never the implementer. Review against fingerprints + the applicable Proof Ladder rung together = verification; either alone does not count.
5. Triage by severity; fix loop max 7 cycles with delta reports and narrowed re-review; a finding stuck 3 cycles means re-plan or ask the user — never grind on.
6. Grade the model on every dispatch; pass an explicit `model` for every non-pinned agent type; escalate one tier on evidence, never retry unchanged.
7. Escalate scope by asking, not by doing — when the scope guard trips, stop, explain, and let the user decide.
8. Never end silently — every abnormal stop goes through the Abort Protocol so the user always knows the exact state of their files.
