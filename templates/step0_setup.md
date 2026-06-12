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
   - ask only questions whose answer can change `Intent Card` values, `R#`, `SC#`, scope boundaries, risk envelope, accepted assumptions, deferred decisions, or test commands;
   - ask in batches of 1-3 short questions, using the question tool when available;
   - name the artifact field or section each question can change;
   - do not ask obvious questions or questions answerable from repository evidence.
5. Close material ambiguity around intent, expected outcome, generation target, success/resolution signal, scope, non-goals, risk, constraints, validation expectations, assumptions, and deferred decisions.
6. For `feature` and `experiment` changes, clarify the hypothesis/decision need, resolution signal, expected impact, decision deadline, or reason for `not_applicable`.
7. For `fix`, `refactor`, and `infra` changes, clarify target behavior, preserved behavior, non-goals, regression boundaries, validation evidence, and risk boundaries.
8. Do not guess missing ADLC/PRD fields. If the user cannot answer, record only an explicitly accepted assumption; if that assumption affects approval scope or risk, stop and ask for approval before writing artifacts.
9. Before creating artifacts, summarize your final interpretation, material user answers, and accepted assumptions. If the user disagrees or adds material scope, continue intake instead of writing files.
10. Create the change folder: `openspec/changes/<change-name>/`.
11. Read the artifact templates for PRD and Rules: [prd.md template]({{prd_template_path}}), [rules.md template]({{rules_template_path}}).
12. Create `prd.md` in the change folder by instantiating [prd.md template]({{prd_template_path}}) for the current change.
13. Use the HTML comments in the template as authoring guidance, but remove all comments from the final `prd.md`.
14. `prd.md` must start with YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
15. `prd.md` must follow the template contract exactly: fixed visible sections, fixed Intent Card rows, machine-readable `R#` and `SC#` items, explicit `In scope:` / `Out of scope:` lines, no extra headings, no empty required fields, and no placeholder-like prose such as `TBD`, `TODO`, `unknown`, `clarify later`, or `to be decided`.
16. Create `rules.md` in the change folder by instantiating [rules.md template]({{rules_template_path}}) for the current change.
17. Use the HTML comments in the template as authoring guidance, but remove all comments from the final `rules.md`.
18. `rules.md` must start with YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
19. `rules.md` must have exactly this visible structure and no other visible structure: `# Rules`, then `## Test Commands`.
20. In `rules.md`, fill the required `## Test Commands` section:
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
