## Scope: architecture (before `technical_design`)

Input artifacts already on disk: `prd.md`, `execution_contract.md`, `research_facts.md`. The sub-agent reads them — you do not. Every fork you present must be grounded in them.

Ask about:
- which architecture option to take, when more than one satisfies the approved PRD;
- module and ownership boundaries;
- what existing code is reused rather than replaced.

Do not ask:
- what the change is for or why. That is approved PRD content. If the design cannot be built without changing `Intent`, `Target state`, `R#`, `SC#`, evidence types, or risk boundaries, stop and tell the user the PRD needs realignment — do not renegotiate it here.
- how to split the work into iterations. That is `iteration_planning`.

Dispatch in two stages so the forks exist before the artifact does:

1. **Analysis stage.** Dispatch the phase sub-agent with an explicit instruction: read the input artifacts and the code, resolve everything the inputs already determine, and return the remaining material forks — options, consequences, recommendation — WITHOUT writing `architecture/design.md`. If there are no material forks, it says so.
2. **Decision.** Put the forks to the user. No forks → skip this step silently.
3. **Writing stage.** Return the decisions to the SAME sub-agent when your runtime can continue it with its context intact; otherwise dispatch a fresh one with the decisions in its prompt. It writes `architecture/design.md` with the decisions fixed as `D#`, runs the contract's self-check, and reports.
