---
name: audit-method
description: Retrospective engineering audit method for PhaseDev changes. Use when an AI agent is asked to analyze the implementation quality, task fidelity, prompt clarity, and code correctness of a completed or in-progress PhaseDev change.
---

# Audit Method — Retrospective Change Analysis for AI Agents

## Overview

Use this method when tasked with reviewing and evaluating how a change was implemented under PhaseDev:
- Was the user's original task fulfilled without drift or missing requirements?
- Did the sub-agents follow the technical design and architecture?
- Were the orchestrator's prompts clear, or did they introduce ambiguity?
- Was there code churn, unnecessary rework, or parasitic edits?

## Inputs for Audit

Given a path to a change directory (or an archived change under `.phasedev/changes/archive/<date>-<name>/`):

1. **Original Task:**
   - `intake_task.md`
2. **Phase Artifacts:**
   - `prd.md`
   - `execution_contract.md`
   - `research_facts.md`
   - `architecture/design.md`
   - `iteration_plan.md`
   - `validation_findings.md`
   - `state.json` (inspect `commitLog` for commit boundaries)
3. **Git Diffs & History:**
   - Git commits and diffs between `commitLog.start..HEAD` (or per-iteration commit boundaries)

---

## 4-Dimensional Audit Protocol

Evaluate the change across the following four dimensions:

### 1. Task Drift & Scope Fidelity (Task vs PRD vs Design)
- **Check**: Compare the original user request (`intake_task.md`) against `prd.md` and `architecture/design.md`.
- **Look for**:
  - *Missing requirements*: What did the user ask for that was forgotten in PRD/Design?
  - *Over-engineering / Feature creep*: Did the sub-agents invent unnecessary abstractions, configuration options, or unrequested features?
  - *Assumptions*: Were key decisions made without user clarification?

### 2. Execution Discipline & Plan Compliance
- **Check**: Inspect `iteration_plan.md` and `validation_findings.md`.
- **Look for**:
  - *Plan adherence*: Were iterations completed in sequence and verified according to plan criteria?
  - *Recovery cycles*: How many recovery attempts or auto-approval cycles were triggered?
  - *Finding resolution*: Were findings resolved with concrete verification evidence?

### 3. Architecture & Code Fidelity (Design vs Git Diff)
- **Check**: Compare `architecture/design.md` and `iteration_plan.md` against the git diff (`commitLog.start..HEAD`).
- **Look for**:
  - *Design compliance*: Did the code follow the agreed interfaces, data structures, and file locations?
  - *Shortcut hacks*: Did the implementer bypass design boundaries or suppress types to make tests pass?
  - *Test quality*: Does the test coverage assert real behavioral invariants or just trivial pass-throughs?

### 4. Waste & Churn (Rework Analysis)
- **Check**: Compare consecutive iteration commits and `validation_findings.md`.
- **Look for**:
  - *Code churn*: Was code written in Iteration 1 subsequently rewritten or deleted in Iteration 2?
  - *Defect density*: How many `must_fix` defects were caught during validation?
  - *Repair cycles*: What caused `repairCycleCount` to increment, and was the fix minimal and surgical?

---

## Output Report Structure

When producing the audit verdict for the user, format it as follows:

```markdown
# Change Implementation Audit: <change-name>

## Executive Summary
- **Overall Verdict**: [Excellent / Good / Needs Improvement / Failed]
- **Task Fulfillment**: [100% / Partial / Divergent]
- **Code Fidelity**: [High / Medium / Low]
- **Efficiency Score**: [Clean single-pass / Minor rework / High churn]

## 1. Scope & Task Drift
- [Key findings comparing initial task to final implementation]

## 2. Agent Prompting & Execution Trail
- [Analysis of orchestrator prompts, sub-agent clarity, and self-checks]

## 3. Code & Architectural Quality
- [Analysis of git diff against design.md, test completeness, and boundaries]

## 4. Rework & Waste
- [Repair cycles, findings breakdown, churn between iterations]

## Recommendations for Future Changes
- [Concrete actionable takeaways: better task phrasing, smaller iteration boundaries, model tier adjustments]
```
