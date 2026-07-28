## Scope: iteration split (before `iteration_planning`)

Input artifacts already on disk: `prd.md`, `architecture/design.md`, `execution_contract.md`. The sub-agent reads them — you do not.

Ask about:
- how the approved design is split into iterations;
- the order of the iterations, and which one lands first;
- which iteration owns a boundary that could be cut either way.

Do not ask:
- architecture. It is approved in `architecture/design.md`. If the plan cannot be built without changing an approved design decision, stop and tell the user the design needs realignment.
- what the change is for. That is approved PRD content.

Most changes have no material fork here: the design usually determines the split. Expect `No open decisions.` and treat it as the normal outcome.

Dispatch in two stages so the forks exist before the artifact does:

1. **Analysis stage.** Dispatch the phase sub-agent with an explicit instruction: read the input artifacts, resolve everything they already determine, and return the remaining material forks — options, consequences, recommendation — WITHOUT writing `iteration_plan.md`. If there are no material forks, it says so.
2. **Decision.** Put the forks to the user. No forks → skip this step silently.
3. **Writing stage.** Return the decisions to the SAME sub-agent when your runtime can continue it with its context intact; otherwise dispatch a fresh one with the decisions in its prompt. It writes `iteration_plan.md`, runs the contract's self-check, and reports.
