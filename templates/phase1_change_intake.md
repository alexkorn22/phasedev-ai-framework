{{phase_opening_summary}}Phase 1. Change Intake.

Phase contract: prepare the initial change artifacts.

{{skill_policy}}

Input:
- task/change description from the current context;
- user rules and constraints for this task, including an explicit answer that there are no additional task-specific constraints;
- current project repository at `{{project_path}}`, inspected only after initial intake is complete; this absolute path is the only target repository for repository inspection and artifact writes;
- clarifications available from the user if the task description is not enough for requirements.

Non-input:
- The change folder slug is not user intake. Derive it yourself from the final task text unless the user has already specified an exact folder name.

Decision flow:
1. Complete intake before repository inspection. Required intake is the task/change description and the task-specific rules/constraints answer. If either item is missing, ask only for missing intake in one short batch and stop. An explicit "no additional constraints" answer is complete intake, not a blocker.
2. After intake is complete, gather only enough local evidence to write stable setup artifacts:
   - Retrieval order: project instructions first, then package/test metadata, then only files or directories directly relevant to the requested change.
   - Context budget: at most one broad file listing, plus one focused package/workspace listing when needed for nested or monorepo package discovery, plus focused searches for concrete evidence.
   - Stop condition: stop reading once you can fill `Intent`, `R#`, `SC#`, risk boundaries, and `execution_contract.md` gates without material assumptions.
3. Resolve material ambiguity and conflicts before writing files. User task text and clarifications define requested product intent; project and repo-local instructions constrain how work may be done; repository evidence clarifies existing behavior but must not silently override user intent. If a conflict or unknown can change `Intent`, `R#`, `SC#`, success evidence type, risk boundaries, or test commands, name the affected artifact fields, ask 1-3 short questions, and stop.
4. Run the interpretation checkpoint. Summarize the final interpretation, material user answers, accepted non-material assumptions, and any "no additional constraints" answer in your working context. Proceed without a separate confirmation stop when the current context already supplies enough acceptance, evidence, and risk data to write both artifacts without material assumptions.
5. Choose a short kebab-case change folder slug from the final task text after the checkpoint is satisfied. The slug is agent-derived, not user intake, unless the user already specified an exact folder name.
6. Before creating the change folder, prevent slug collisions in `{{project_path}}/.phasedev/changes/`. If the chosen slug exists, do not overwrite or reuse it; derive the next non-conflicting slug by appending `-2`, then `-3`, while it still clearly represents the task. If an exact user-specified folder name collides, or no safe representative slug can be derived, stop with a blocker instead of asking for a slug.
7. Create `.phasedev/changes/<derive-slug-from-final-task>/` recursively, replacing `<derive-slug-from-final-task>` with your chosen non-conflicting slug. If `.phasedev/` or `.phasedev/changes/` does not exist yet, create those parent directories as part of this step.
8. Use the Artifact Build Contracts below as the only source of structure. Create `prd.md` first, then `execution_contract.md`, and run the combined artifact self-check only after both files exist.

Phase invariants:
- Before intake is complete, do not inspect files, search the repository, read transcripts/logs, inspect config, inspect tests, inspect artifact templates, or inspect the `ag-dev-flow` framework source. Ask for missing intake and stop.
- Inspect only the current project repository after intake is complete. Do not inspect `ag-dev-flow` source or template files; the artifact templates are embedded in this prompt.
- Do not create `.phasedev/`, `.phasedev/changes/`, the change folder, `prd.md`, or `execution_contract.md` until both required intake items are available.
- Do not ask for operational details that do not change artifact content, including the change folder slug.
- Do not guess material PRD or rules fields. If the user cannot answer a material question, stop instead of encoding a silent assumption.

{{path_resolution_rule}}

Artifact requirements:
- Later research, design, planning, implementation, and validation phases will treat `prd.md` and `execution_contract.md` as source-of-truth inputs, so write stable, testable statements that can be carried forward without reinterpreting the conversation.
- `prd.md` `Intent` records the change type, why it is needed, target state, and risk boundaries.
- `prd.md` `Requirements` contains only required project behavior or project results.
- `prd.md` `Success Criteria` contains verifiable criteria and evidence type, with enough specificity for later validators to decide whether evidence satisfies each criterion.
- `execution_contract.md` requires at minimum concrete gate commands for `unit`, `phase`, and `full`; the validator requires all five sections: Test Commands, Constraints, Verification Gates, Manual Checks, and Environment Notes.
- For each `execution_contract.md` gate, use a real project command only when repository evidence shows it exists. If no safe command exists for a gate, use a named manual method when repository evidence or an explicit user answer supports it.
- Use the controller-supported fallback `manual: inspect Phase 1 artifacts against accepted task constraints` for missing gates only when the repository is clearly new/minimal: no package/test metadata, no project commands, and no existing file or user answer identifies a better method. Otherwise ask the user for that gate method and stop. Do not invent commands.
- Named manual methods in `execution_contract.md` must use machine-readable wording: `manual: <named method supported by user/repo evidence>`, for example `manual: compare generated prompt against Phase 1 acceptance notes`. Do not use vague manual labels such as `manual review`, `check manually`, or `n/a`.
- `execution_contract.md` must not duplicate requirements, scope, risks, or success criteria.
- The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.

When applying the output paths in the Artifact Build Contracts below, replace `<derive-slug-from-final-task>` with your chosen slug. Never ask the user for this slug as a prerequisite to creating artifacts.

{{prd_artifact_contract}}

{{rules_artifact_contract}}

## Artifact self-check

After both artifacts exist, immediately validate the new artifacts before completing the phase. The self-check is a combined Phase 1 check; do not run it after only `prd.md` exists.

```bash
{{self_check_command}}
```

If the check fails, fix the reported artifact issues in this same phase, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `prd.md` or `execution_contract.md` until this self-check passes.

{{self_check_fallback}}

## Human Review Formatting Policy

`prd.md` and `execution_contract.md` are approval artifacts, but they are also machine-read by later AI agents. Keep them compact, stable, and predictable.

Formatting rules:
- Artifact Build Contracts above are the canonical source for exact structure, comment removal, placeholder handling, and output paths.
- Stable review surface for `prd.md` is the `Intent`, `Requirements`, and `Success Criteria` tables themselves.
- Use concise tables and short wording instead of decorative formatting.
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.

## Artifact allowlist

Allowed persistent artifacts for this phase:
- full change folder path `.phasedev/changes/<derive-slug-from-final-task>/`, created recursively only after intake is complete
- active change folder `prd.md` at the Artifact Build Contract Output path
- active change folder `execution_contract.md` at the Artifact Build Contract Output path

Phase completion:
- After creating `prd.md` and `execution_contract.md`, run the artifact self-check, fix any reported issues, and stop only after the self-check passes.
- Final response must use this compact template and include no extra sections:
  - `Change slug: <slug>`
  - `Artifacts: <absolute-prd-path>; <absolute-rules-path>`
  - `Interpretation: <one-sentence final task interpretation>`
  - {{skill_compliance_line}}
  - `Self-check: <exact command> -> <result>`
  - `Next: review the files, set approved: true, then run phasedev advance`
