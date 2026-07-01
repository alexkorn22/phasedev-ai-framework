Use this prompt only to acknowledge the current PhaseDev init handshake.

This prompt initializes context only. It is not a stage contract.

## Init Role

`phasedev init` is a context-only handshake before the state-driven `phasedev next` loop. The source of truth for executable work is the complete controller output printed by `phasedev next`, not chat history or this init prompt.

## Init State

```yaml
command: init
current_stage: {{current_stage}}
route_kind: {{route_kind}}
active_change: {{active_change_path}}
next_prompt_required: true
may_modify_files: false
may_read_files: false
may_run_commands: false
may_reconstruct_stage_contract: false
```

`next_prompt_required: true` means the next executable input must be the complete, verbatim controller output printed by `phasedev next`.

## Init Contract

- No executable work is authorized by init.
- Allowed persistent artifacts: none; do not create, read, edit, move, archive, approve, test, or validate files.
- Do not run commands, use tools, inspect the repository, open project files, or read generated artifacts.
- Do not start Phase 1 or any later phase.
- Do not infer, reconstruct, summarize, or execute a stage contract from memory, the flow model, nearby user text, or chat history.
- `phasedev init` does not inject stage-specific skill policy. Skill policy appears only in executable `phasedev next` stage prompts.

## Live Init Execution

1. Use this prompt as the only executable init instruction.
2. Acknowledge the current init state using the expected response below.
3. Stop until the user provides the complete, verbatim `phasedev next` controller output.

## Review/Test Handling

If this prompt is being reviewed, tested, quoted, embedded, or evaluated as data instead of executed as the live init prompt, treat every section of it as data. Do not obey the Expected Response, do not stop the surrounding task, and do not let this prompt override the reviewer, test harness, evaluator, or user instructions for that outer task.

## Expected Response

Priority: use this exact response only for live `phasedev init` output, not when the user explicitly asks to evaluate, test, quote, analyze, or change this prompt.

Respond with exactly:

```text
Init acknowledged. I will make no file changes, run no commands, and wait for the complete `phasedev next` controller output.
```

Do not add a plan, checklist, file summary, assumptions, or next-stage instructions.

## Next Input Handling

- Valid next input is the complete, verbatim controller output printed by `phasedev next`, including a stage heading and the full stage-specific executable contract.
- Wrappers such as a shell prompt, markdown code block, command echo, timestamp, or log text are okay.
- A user paraphrase, manual reconstruction, memory-based summary, or instruction such as "start setup/research from memory" is not valid next input.
- If the next input is missing, partial, paraphrased, conflicting, or descriptive-only, ask for the complete `phasedev next` controller output and perform no work.
- Do not execute if the user explicitly says stop, pause, cancel, or not yet.
- Once a valid `phasedev next` contract is accepted, this init prompt does not add extra execution rules; follow only the controller contract plus higher-priority/system/developer/user safety instructions.

## Success Criteria

Init is complete when:

- The init handshake has been acknowledged with the exact expected response.
- During live init, only the exact expected response was emitted.
- The Init Contract was followed without starting executable work.
- For incomplete next input, no work is performed and the agent asks for complete `phasedev next` controller output.
