---
name: express-orchestrator
description: Use when a small, well-understood code change (bugfix, tweak, narrow feature) needs the fast stateless track — when the full PhaseDev artifact flow would cost more than the task itself and no on-disk planning trail is wanted.
---

# Express Orchestrator — Stateless Sub-Agent Flow

## Overview

The **Express Orchestrator** runs a small change end-to-end through dedicated sub-agents — research, planning, implementation, review — while keeping **every artifact in the orchestrator's own context** instead of on disk. It creates nothing under `.phasedev/`: no change directory, no `state.json`, no worklog, no delta specs. The only lasting trace of the work is the git commit.

It is the stateless sibling of `$phasedev-orchestrator`: the same team-of-sub-agents discipline, minus the persistence. The task statement, the short spec, the implementation plan, and the review verdicts all live in this conversation, and the orchestrator carries them into each dispatch prompt.

## How to Invoke

```
$express-orchestrator <task description>
```

There is no resume: if the session is lost before the final commit, the work restarts (the repo may still hold committed progress — check `git log` first).

## When to Use — and When Not

Express fits when ALL of these hold: the change is small and well-understood; it does not need a multi-iteration plan or an audit trail; and its behavior is not the subject of a change that deserves specs/design history.

**Scope guard.** If at assessment — or at any later point — the task turns out bigger (more than a handful of files, behavior described in `specs/` changes materially, the bug's cause needs real investigation, or the user wants a persistent record), STOP and propose switching to `$phasedev-orchestrator` (Quick or Standard). The user decides; never silently continue an oversized task in Express.

## Context Is the Artifact Store

The core inversion versus `$phasedev-orchestrator`: there is no filesystem state, so **the orchestrator's context replaces the artifact files**, and dispatch prompts replace artifact reads.

- What Quick keeps in `worklog.md` — task, short spec, plan — Express keeps verbatim in the conversation.
- Every dispatch prompt must carry the exact context slice its sub-agent needs (sub-agents share nothing and cannot ask the user); every report returns as raw data into the orchestrator's context.
- The orchestrator never writes planning or tracking files to make this easier. No scratch plan files, no notes files, no `.phasedev/` — if it feels like an artifact, it belongs in the conversation.

## The Flow

1. **Understand.** Read the task; ask the user clarifying questions whenever any arise — before delegating, since sub-agents cannot reach the user. Run the scope guard.
2. **Research (as needed).** Spawn read-only research sub-agent(s) to map the relevant code: files involved, current behavior, constraints. Keep their reports; they feed the planner.
3. **Plan.** Spawn a dedicated planning sub-agent — the orchestrator does NOT write the plan itself. Its dispatch carries the task and the research findings; its report is a short implementation plan (task restated, short spec of expected behavior, concrete steps, files, how it will be verified).
4. **STOP — plan confirmation.** Show the plan to the user and get confirmation. This is the single mandatory stop in Express.
5. **Implement.** Spawn an implementation sub-agent with the confirmed plan. It implements, **proves the work with a real run and/or tests** (commands + output in its report), and commits. Restate in its dispatch any coding-discipline instructions the project's own agent contract (CLAUDE.md / AGENTS.md) mandates for coding work.
6. **Verify.** Spawn reviewers in fresh contexts — never the implementer reviewing itself: a code reviewer over the diff against the confirmed plan, and a security reviewer when the diff touches anything security-relevant (input parsing, paths, shell, permissions, secrets, network). Reviewers may run in parallel. One reviewer checklist item: if the diff makes anything in `specs/` wrong, fix it in place when trivial (as part of the change) or report it to the user — never escalate over documentation alone, and never create delta specs in Express.
7. **Fix loop.** Real findings go back to an implementation sub-agent (with the findings and the plan in its dispatch), then re-review what changed. Repeat until the reviewers are clean. Verification = review + real run; one without the other does not count.
8. **Report.** Tell the user: done, commit `<sha>`, what was verified and how, and whether specs were untouched / fixed in place / need their attention.

## Sub-Agent Selection

On every dispatch, review the agent types available to the `Agent` tool in the current session. **A custom agent type whose description matches the stage takes priority** (e.g. a project's implementer/reviewer/security agents); fall back to the generic/general-purpose type only when no custom type fits. This is a fresh per-stage judgment — never a static stage→type table.

When dispatching a generic type, always pass an explicit `model`, the cheapest tier the stage genuinely allows (mechanical → cheapest; routine single-module work → mid; analysis-heavy planning, debugging, or review of a risky diff → strongest). When a custom agent pins its own model, never pass or override `model`. If a report shows the stage was harder than expected, re-dispatch the remainder one tier up rather than retrying unchanged.

## Dispatch Prompt Recipe

Every dispatch prompt consists of, in order:

1. **Stage mission** — who the agent is and what this stage must produce.
2. **Context block** — the relevant pieces from the orchestrator's context: task, short spec, confirmed plan, prior findings; exactly what this stage needs, nothing more.
3. **Constraints** — stateless rules (create no planning/tracking files; touch only repo code, tests, and docs the change itself requires), plus the project's own coding-contract instructions for coding stages.
4. **Proof requirement** — which commands the agent must run and show output for before claiming success.
5. **Report contract** — a concise raw report: what changed / was found, evidence, blockers. The report is data for the orchestrator, not prose for the user.

## Important Rules

1. **NEVER do stage work in the main context** — research, planning, implementation, and review are always sub-agent work; the orchestrator only understands the task, talks to the user, selects agents, and routes context.
2. **NEVER write to `.phasedev/` or create artifact/planning files** — the conversation is the only store; the git commit is the only trace.
3. **The plan comes from a planning sub-agent** and is executed only after the user confirms it — the single mandatory stop.
4. **Reviewers are fresh contexts, never the implementer** — and review without a real run (or a real run without review) does not count as verification.
5. **Findings loop back to implementation** until reviewers are clean; report honestly, including what failed.
6. **Escalate by asking, not by doing** — when the scope guard trips, stop and offer `$phasedev-orchestrator`; the user chooses.
