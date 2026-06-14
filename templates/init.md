Remember the Agentic Engineering Flow model for this session.

This prompt initializes context only. It is not a stage contract.

## Init State

```yaml
command: init
current_stage: {{current_stage}}
route_kind: {{route_kind}}
active_change: {{active_change_path}}
next_prompt_required: true
may_modify_files: false
```

## Init Contract

- Allowed persistent artifacts: none.
- Do not create, edit, move, archive, approve, test, or validate files during init.
- Do not start Stage 0 or any later stage from this prompt.
- Wait for the next message containing the exact `phasedev next` output.

## Flow Model

Stage order:
0. AI Layer Setup
1. Research
2. Design
3. Plan
4. Implementation
5A. Phase Validation
5B. Final Validation
5R. Repair Loop
6. Archive

Flow rules:
- `phasedev next` owns the executable stage contract and all artifact instructions.
- Complete only the stage printed by `phasedev next`, then stop.
- Do not move to the next stage yourself.
- Stage-specific skill policy is supplied only by the current `phasedev next` prompt from `config.yaml`.
- Do not infer allowed skills from this init prompt.
