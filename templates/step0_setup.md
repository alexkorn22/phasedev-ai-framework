Stage 0. AI Layer Setup.

Stage contract: prepare the initial change artifacts.

{{skill_policy}}

Input:
- task/change description from the current context;
- user rules and constraints for this task;
- project repository;
- clarifications available from the user if the task description is not enough for requirements.

Required actions:
1. First, ask the user for the task/change description if it is not already in context, then stop until they answer.
2. Then, in a separate request, ask for task-specific rules and constraints if they are not already in context, then stop until they answer.
3. Do not create `prd.md` or `rules.md` until both items are available: the task description and task rules/constraints.
4. Run PRD intake before creating files: clarify as much as possible about intent, expected outcome, generation target, success/resolution signal, scope boundaries, non-goals, risk envelope, constraints, validation expectations, accepted assumptions, and deferred decisions.
5. Use the question tool for intake questions when available. If the question tool is unavailable, ask through a normal message and stop until the answer.
6. Ask questions in batches of 1-3 short questions at a time to avoid overloading the user, but continue intake for as many rounds as needed to close material ambiguity.
7. Do not write `prd.md` or `rules.md` until all questions that affect the `Intent Card`, `R#` requirements, `SC#` success criteria, `In scope:` / `Out of scope:`, risk envelope, assumptions, or test commands are closed.
8. For `feature` and `experiment` changes, clarify the hypothesis/decision need, resolution signal, expected user/business/system impact, decision deadline, or reason for `not_applicable`.
9. For `fix`, `refactor`, and `infra` changes, clarify desired behavior or target state, preserved behavior, non-goals, regression boundaries, validation evidence, and risk boundaries. `Resolution signal` and `Decision deadline` may be `not_applicable` only after that intake.
10. Do not replace unknown ADLC/PRD fields with guesses. If the user cannot answer, record only an explicitly accepted assumption. If the assumption affects approval scope or risk, stop and ask for approval of that assumption before writing the PRD.
11. Create the change folder: `openspec/changes/<change-name>/`.
12. Read the artifact templates for PRD and Rules: [prd.md template]({{prd_template_path}}), [rules.md template]({{rules_template_path}}).
13. Create `prd.md` in the change folder by instantiating this template for the current change.
14. Use the HTML comments in the template as authoring guidance. They define the strict PRD contract, field/section contract, allowed `Change type` values, `not_applicable` rules, ADLC-style intake expectations, and blocker-question rule.
15. Remove all HTML comments from the final `prd.md`.
16. `prd.md` must start with YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
17. In `prd.md`, fill `## Intent Card` with real values for the current change:
   - `Change type`;
   - `User or business intent`;
   - `Generation target`;
   - `Resolution signal`;
   - `Decision deadline`;
   - `Risk envelope`.
18. For ordinary fix/refactor/infra changes, `Resolution signal` and `Decision deadline` may be `not_applicable`, but the rows must not be removed.
19. `prd.md` must have exactly this visible structure and no other visible structure: `# PRD`, then `## Intent Card`, `## Approval Summary`, `## Requirements`, `## Scope Boundaries`, `## Success Criteria`, `## Accepted Assumptions`, `## Deferred Decisions`.
20. Do not add other `##` sections to `prd.md`, such as `Risks`, `Notes`, `Open Questions`, `Validation`, `Non-goals`, or `Security`. If that meaning is needed, place it in one of the allowed sections.
21. Do not add `###` or deeper headings to `prd.md`. Put additional information only inside the allowed sections using lists, tables, or short paragraphs.
22. In `## Intent Card`, the table must contain only the specified rows in the fixed order. Use `Resolution signal` only for hypotheses/experiments/future decisions and do not repeat `Success Criteria`. For ordinary tasks, use `not_applicable` when verification is fully covered by `SC#`.
23. In `## Requirements`, use machine-readable items `R1: ...`, `R2: ...`. In `## Success Criteria`, use `SC1: ...`, `SC2: ...`.
24. In `## Scope Boundaries`, include explicit lines starting with `In scope:` and `Out of scope:`.
25. `## Accepted Assumptions` and `## Deferred Decisions` may be `None` when there are none.
26. If information is missing for `R#`, `SC#`, `In scope:` / `Out of scope:`, or `Intent Card`, ask a question and do not write `prd.md`.
27. Do not leave empty Intent Card cells, copied field descriptions, placeholder-like prose, `TBD`, `TODO`, `unknown`, `clarify later`, or `to be decided` in `prd.md`.
28. Create `rules.md` in the change folder by instantiating [rules.md template]({{rules_template_path}}) for the current change.
29. Use the HTML comments in the template as authoring guidance, but remove all comments from the final `rules.md`.
30. `rules.md` must start with YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
31. `rules.md` must have exactly this visible structure and no other visible structure: `# Rules`, then `## Test Commands`.
32. In `rules.md`, fill the required `## Test Commands` section:
```md
## Test Commands
- unit: `...`
- phase: `...`
- full: `...`
```

Artifact requirements:
- `prd.md` records intent, `R#` requirements, change boundaries, and `SC#` criteria in a strict structure without additional sections.
- `prd.md` must be instantiated from [prd.md template]({{prd_template_path}}).
- `rules.md` records gate commands needed by later stages and must be instantiated from [rules.md template]({{rules_template_path}}).
- The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.

## Artifact self-check

After creating `prd.md` and `rules.md`, immediately validate the new artifacts before completing the stage:

```bash
{{self_check_command}}
```

If the check fails, fix the reported artifact issues in this same stage, then rerun the same command. Repeat until it exits successfully. Do not ask the user to approve `prd.md` or `rules.md` until this self-check passes.

## Human Review Formatting Policy

`prd.md` and `rules.md` are approval artifacts, so format them for quick human review.

Formatting rules:
- YAML frontmatter remains first in each file.
- For `prd.md`, do not choose structure based on content. Use only the strict PRD contract from the template.
- The first visible part of `prd.md` after `# PRD` must be `## Intent Card`; write approval context inside the allowed sections.
- A compact visual review surface for `prd.md` is allowed only as rows/lists/tables inside `## Approval Summary`, without new headings.
- In the compact visual review surface, use semantic emoji markers when they add signal: 📌 approval scope, 🚫 out of scope, ✅ key success/decision, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Do not leave an approval artifact as an ordinary wall of markdown when semantic visual markers, callouts, or grouping clearly speed up review.
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
- If a question affects the approval artifact, ask the user and stop until the answer.
- Do not write pending open questions into `prd.md` or `rules.md` as a substitute for asking the user.
- Separate accepted assumptions and deferred design-stage decisions from questions that require an answer before approval.
- Do not create any additional sections in `prd.md`, such as risks/notes/security. Distribute material content across the allowed sections.
- In `prd.md`, do not use headings other than the strictly allowed headings. Short paragraphs, bullets, tables, blockquotes, and bold may be used only inside the allowed sections.
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.
- For `prd.md`, use only the allowed sections: put scope boundaries in `## Scope Boundaries`, assumptions in `## Accepted Assumptions`, deferred decisions in `## Deferred Decisions`, and reviewer attention in `## Approval Summary`.
- Emoji may be used as semantic visual markers when they help scan the document.
- Do not use emoji in YAML frontmatter.
- Do not use emoji in commands, file paths, code blocks, or required machine-readable labels.
- In `rules.md`, preserve all machine-readable elements of the `## Test Commands` section without decorative formatting inside commands.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- change folder `openspec/changes/<change-name>/`
- `prd.md`
- `rules.md`

Stage completion:
- After creating `prd.md` and `rules.md`, run the artifact self-check, fix any reported issues, and stop only after the self-check passes.
- Tell the user that they must review the files, set `approved: true`, and then run `flow next`.
