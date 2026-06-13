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
4. Run a material-question gate before creating files:
   - inspect the repository, artifact templates, config, tests, and project instructions before asking;
   - ask only questions whose answer can change `Intent` values, `R#`, `SC#`, success evidence type, risk boundaries, or test commands;
   - ask in batches of 1-3 short questions, using the question tool when available;
   - name the artifact field or section each question can change;
   - do not ask obvious questions or questions answerable from repository evidence.
5. Close material ambiguity around why the change is needed, target state, required behavior, success criteria, evidence type, and risk boundaries.
6. For `feature` and `experiment` changes, clarify the user/system outcome, expected impact, success evidence, and risk boundaries.
7. For `fix`, `refactor`, and `infra` changes, clarify target behavior, preserved behavior, regression boundaries, validation evidence, and risk boundaries.
8. Do not guess missing PRD fields. If the user cannot answer a material question, stop instead of encoding a silent assumption.
9. Before creating artifacts, summarize your final interpretation, material user answers, and accepted assumptions. If the user disagrees or adds material scope, continue intake instead of writing files.
10. Create the change folder: `openspec/changes/<change-name>/`.
11. Use the Artifact Build Contracts below as the only source of structure for `prd.md` and `rules.md`.
12. Create `prd.md` first, then `rules.md`.

Artifact requirements:
- `prd.md` records intent, target state, risk boundaries, `R#` requirements, and `SC#` criteria with evidence type.
- `rules.md` records only concrete gate commands needed by later stages.
- The AI agent must not change `approved: false` to `approved: true`; approval is performed by the user.

{{prd_artifact_contract}}

{{rules_artifact_contract}}

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
- The first visible part of `prd.md` after `# PRD` must be `## Intent`; write approval context inside the allowed tables.
- A compact visual review surface for `prd.md` is the `Intent`, `Requirements`, and `Success Criteria` tables themselves; do not add a separate approval summary.
- In the compact visual review surface, use semantic emoji markers when they add signal: 📌 approval scope, 🚫 out of scope, ✅ key success/decision, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Do not leave an approval artifact as an ordinary wall of markdown when semantic visual markers, callouts, or grouping clearly speed up review.
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
- If a question affects the approval artifact, ask the user and stop until the answer.
- Do not write pending open questions into `prd.md` or `rules.md` as a substitute for asking the user.
- Do not encode assumptions or deferred decisions as separate sections. If they are material, resolve them before writing PRD or express the resulting requirement, risk boundary, or success criterion in the allowed tables.
- Do not create any additional sections in `prd.md`, such as approval summary, scope, out of scope, assumptions, deferred decisions, risks, notes, or security. Distribute material content across the allowed sections.
- In `prd.md`, do not use headings other than the strictly allowed headings. Short paragraphs, bullets, tables, blockquotes, and bold may be used only inside the allowed sections.
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.
- For `prd.md`, use only the allowed sections: put intent and risk boundaries in `## Intent`, required behavior in `## Requirements`, and proof targets plus evidence type in `## Success Criteria`.
- Emoji may be used as semantic visual markers when they help scan the document.
- Do not use emoji in YAML frontmatter.
- Do not use emoji in commands, file paths, code blocks, or required machine-readable labels.
- In `rules.md`, preserve all machine-readable elements of the `## Test Commands` table without decorative formatting inside commands.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- change folder `openspec/changes/<change-name>/`
- `prd.md`
- `rules.md`

Stage completion:
- After creating `prd.md` and `rules.md`, run the artifact self-check, fix any reported issues, and stop only after the self-check passes.
- Tell the user that they must review the files, set `approved: true`, and then run `flow next`.
