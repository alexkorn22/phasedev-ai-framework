Read first: whatever intake artifacts already exist for this change — `intake_task.md`, and `prd.md` / `execution_contract.md` if a previous run reached them before being reset — before forming the decision tree.

The change directory already exists, so nothing here creates it. `intake_task.md` is written only by the `create-change` command, at creation time; it is not written or rewritten now, and its absence is not a problem to fix.

Route the answers:
1. Restate the agreed decisions as one short block: the task, its requirements, success signals, constraints, what is out of scope, and the assumptions you recorded.
2. Pass that block into the `change_intake` sub-agent's dispatch prompt as intake context — the goal-injection slot the orchestrator already reserves for a `change_intake` sub-agent. That sub-agent records the decisions in `prd.md` and `execution_contract.md`.
3. Write no file for the decisions yourself: this contract creates and edits nothing.
