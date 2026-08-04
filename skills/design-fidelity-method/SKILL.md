---
name: design-fidelity-method
description: Use when the user has provided a design artifact — a spec, handoff document, mockup, prototype, working reference code, or a measured API response — and the work must faithfully follow it rather than your own reading of the repository.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Design Fidelity Method

## Purpose

When the user hands over a design artifact, that artifact is the source of truth for WHAT to build. The existing codebase tells you HOW to build it; it is never grounds to override the design. This method stops the dominant expensive failure: building the wrong thing correctly, because the work was grounded on your own repo reading instead of the design the user handed over.

## When This Applies

A design artifact is "provided" if the user, now or earlier in the session, did any of:

- attached or referenced a file or folder (a handoff document, a downloaded prototype, a spec, a design export);
- pasted a screenshot, mockup, or image of the intended UI;
- linked a prototype or reference URL, or named a page to "match";
- said "match this", "1:1", "pixel", "like the prototype/design";
- established a live external contract by probing it — real HTTP calls, a CLI round-trip — or pointed at a working reference implementation in another codebase or language.

A measured response IS a provided artifact: it constrains the design exactly as a spec does. Record measured constraints with the verifying evidence inline (status code + response fragment, or the reference file:line), so a later reader can tell a measured constraint from an assumed one.

An existing approved spec whose topic overlaps the work also counts as a provided artifact — frame new work around it; never author a parallel or conflicting one.

If any of these holds, this method is mandatory. If none — skip it: you are designing from scratch, and the user's words are the brief.

## Read the Artifact First

Before exploring the codebase, read the artifact end-to-end and extract its hard constraints into a checklist with IDs. Capture:

- **Layout / structure** — panels, columns, regions, what is where.
- **Interactions** — what each control does, navigation, state transitions.
- **Explicit do / don't** — every "do not", "never", "must", "always", "one", "single", "no X" is a HARD constraint. Quote it.
- **Visual specifics** the user can verify — counts, order, spacing rules the design states.

If the artifact is long, read all of it; do not stop at the first section that looks relevant. Skimming and extracting the wrong thing is the failure mode. When an artifact was provided, the extracted checklist must exist — its absence means the work was grounded on your own reading, not the user's design.

## Working Code Gets Ported, Not Re-Derived

If the artifact contains a working implementation (component or source files, a runnable demo, a code export — not just prose or an image), the default is to port that code 1:1 into the target stack, not to read its behavior in prose and hand-roll your own version.

- First action: inventory the artifact's code files and read them. They are the ground truth for layout, structure, interactions, and styling — far more precise than any prose handoff. A large working prototype is ground truth, not a sketch to reinterpret.
- Port component-by-component, preserving structure, class names/tokens, and interaction wiring. Adapt only what the stack genuinely requires.
- "Reinventing it because the stack differs" is the failure. The stack difference is a porting task, not a reason to design fresh.

Only when the artifact is purely prose or image do you design the implementation yourself — and even then its constraints bind you.

## What vs How

- The artifact decides what the result must be: layout, behavior, the do/don'ts.
- The repository decides how you implement it: which store, which component, migration path.
- You may never downgrade the artifact to "reference-only" because the current code is structured differently. "The repo already has X" is a HOW problem to solve, not a license to keep what the design forbids.

## No Silent Divergence — in Either Direction

- Silently substituting your own design for the artifact's is forbidden.
- Silently "fixing" or improving the artifact with your own opinion is equally forbidden.
- When the artifact is wrong, incomplete, ambiguous, impossible, or conflicts with reality, do not blindly copy the mistake and do not quietly override it: surface it with your proposed correction and get the user's call. The artifact being authoritative means it is the default and the baseline — not beyond question.
- A surfaced, user-approved deviation recorded in the resulting design or plan is legitimate. The defect is a silent divergence in either direction.

## Questions and Decisions

- Clarifying questions cover deviations from the provided design first — the places where the plan cannot or should not match it — before any generic gap.
- The load-bearing question is "your design shows X, the repo has Y — which wins here?", asked early — not "how should I build the thing your prototype already specifies?", asked at the end.
- If the artifact already answers a question unambiguously, do not ask it — follow it.

## Carrying Constraints Forward

- The constraints checklist travels with the resulting design or plan, and fidelity is graded against it — not just internal consistency.
- Every decision that touches a constraint cites it.
- A design or plan that is internally perfect but contradicts a provided constraint is a failure, not an approval.

## Red Flags

- Treating the artifact as advisory and substituting your own repo reading.
- Extracting only part of the constraints and missing an explicit mandate elsewhere in the artifact.
- Re-deriving behavior from prose while the artifact ships working code, with no surfaced reason.
- A repo-derived rationale standing in where a user decision on a deviation was required.

## Completion Condition

Fidelity work is complete when every hard constraint of the artifact is either honored in the result or surfaced as an explicit deviation the user decided on — none silently diverged from, in either direction.
