/**
 * Shared fixture helpers for PhaseDev tests.
 */

export function validPrdBody(): string {
  return `# PRD

## Intent

| Field | Value |
|---|---|
| Change type | fix |
| Why | Keep flow routing grounded in approved requirements. |
| Target state | Exercise the flow controller stage prompt. |
| Risk boundaries | Test fixture only; no production risk. |

## Requirements

| ID | Requirement |
|---|---|
| R1 | Route the flow according to approved artifacts. |

## Success Criteria

| ID | Verifies | Criterion | Evidence |
|---|---|---|---|
| SC1 | R1 | The expected stage prompt is rendered. | review |
`;
}

export function validRulesBody(): string {
  return `# Rules

## Test Commands
| Gate | Command |
|---|---|
| unit | \`bun test unit\` |
| phase | \`bun test phase\` |
| full | \`bun test full\` |

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

export function validResearchBody(): string {
  return `# Research Facts

## PRD Intent Trace

| Field | Value |
|---|---|
| Change type | fix |
| Why | Test fixture |
| Target state | Verified |
| Risk boundaries | None |

## Requirements & Success Criteria Trace

| ID | Status | Evidence |
|---|---|---|
| R1 | confirmed | F1 |
| SC1 | confirmed | F1 |

## Source Facts

| ID | Source | Fact | Supports |
|---|---|---|---|
| F1 | test/fixture.ts:1 | Fixture exists | R1, SC1 |

## Research Gaps & Blockers

None.
`;
}

export function validDesignBody(sections: string[]): string {
  const all: Record<string, string> = {
    "Executive Summary": "| Area | Decision |\n|---|---|\n| Scope | Test |\n",
    "Traceability Mapping": "| PRD ID | Research Evidence | Design Decisions | Design Coverage | Plan Impact |\n|---|---|---|---|---|\n| R1 | F1 | D1 | coverage | plan |\n",
    "Architecture Package Map": "| File | Purpose |\n|---|---|\n| design.md | Test |\n",
    "Key Design Decisions": "| Decision ID | Decision | Rationale | Applies To | Impacts |\n|---|---|---|---|---|\n| D1 | Test decision | Fixture | R1 | implementation |\n",
    "API Specification": "No API changes.\n",
    "Data Model": "No data model changes.\n",
    "Contracts, Interfaces & Boundaries": "| Boundary | Contract | Applies To |\n|---|---|---|\n| test | interface | D1 |\n",
    "Risks & Open Questions": "None.\n"
  };
  const body = sections.map(s => `## ${s}\n\n${all[s] || 'Content.'}`).join("\n\n");
  return `# Design\n\n${body}`;
}

export function validPlanBody(iterations: number): string {
  const iters = Array.from({ length: iterations }, (_, i) => {
    const id = i + 1;
    return `## Iteration ${id}: Test Iteration ${id} [ ]

### Goal

Test iteration ${id}.

### Tasks

- [ ] Task ${id}.1

### Check Evidence

| Check | Result | Evidence |
|---|---|---|
| unit | pending |  |

### Required Checks

| Check | Command |
|---|---|
| unit | \`bun test\` |
`;
  }).join("\n");
  return `# Implementation Plan\n\n${iters}`;
}

export function validFindingsBody(verdict: string, type: string, extraRows = ""): string {
  const rows = extraRows || `| F1 | resolved | RECOMMENDED | validation | 1 | Finding 1 | Fix 1 |`;
  return `---
verdict: ${verdict}
type: ${type}
date: 2026-07-04
---

| ID | Status | Severity | Class | Iteration | Finding | Required Fix |
|---|---|---|---|---|---|---|
${rows}`;
}
