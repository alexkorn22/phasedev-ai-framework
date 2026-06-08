Stage 3. Plan.

Your task is to decompose the approved technical design into a step-by-step implementation plan.

{{skill_policy}}

Input artifacts (you must read them):
- PRD requirements and ADLC-style Intent Card: [prd.md]({{prd_path}})
- Approved design: [design.md]({{design_path}})
- Development rules: [rules.md]({{rules_path}})

Planning instructions:
1. Read the artifact template: [implementation_plan.md template]({{implementation_plan_template_path}}).
2. Create the implementation plan file: [implementation_plan.md]({{plan_path}}), instantiating this template for the current change.
3. Use the HTML comments in the template as authoring guidance, but remove all comments from the final `implementation_plan.md`.
4. Do not change `approved: false` to `approved: true`; approval is performed only by the user.
5. Split implementation into sequential autonomous phases:
   - every phase, including the only phase, goes through `Implementation -> Phase Validation`;
   - after successful Phase Validation for all phases, the flow proceeds to `Final Validation`;
   - each phase must fit fully into one AI-agent working session without context overflow;
   - the optimal phase size is a 3-10 file change; do not artificially split a small change.
6. Do not create a generic `Definition of Done`; phase completion is determined by task/subtask checkboxes and required checks from the artifact template.
7. Fill `## Generation Bundle` in [implementation_plan.md]({{plan_path}}); for each area, use only `yes`, `no`, or `not_applicable` and briefly explain the decision.
8. The plan must trace the `Intent Card` from [prd.md]({{prd_path}}):
   - `Generation Bundle` must align with `Generation target` and `Risk envelope`;
   - phase sequencing must cover every `R#`, every `SC#`, and the approved design;
   - checks/evidence must cover `Resolution signal` when it is not `not_applicable`;
   - if `Risk envelope` requires rollout, observability, or rollback path, the corresponding `Generation Bundle` rows must not be `not_applicable`.
9. The plan must explicitly connect phases, tasks, checks, and `Check Evidence` to concrete `R#` and `SC#`; do not use generic references such as "all requirements" without IDs.
10. The plan must account for `Accepted Assumptions` and `Deferred Decisions` from the PRD:
   - accepted assumptions become constraints for sequencing, task scope, and checks;
   - deferred decisions from the PRD must be explicitly resolved by the approved design or mapped to a concrete plan boundary/task/check;
   - do not plan work based on silent assumptions that are absent from the PRD/design.
11. If the approved design or plan decomposition does not cover `Generation target`, `Resolution signal`, a specific `R#`, a specific `SC#`, accepted assumptions, or risk envelope from the PRD, stop and ask the user to realign the PRD/design instead of creating an incomplete plan.
12. For each phase, add `### Check Evidence` immediately after `### Checks`; all evidence rows must initially have `Result = pending`, except clearly irrelevant checks with `not_applicable`.
13. Do not use task checkboxes inside `Check Evidence`; evidence rows must be ordinary markdown table rows so they do not mix with executable tasks.

## Human Review Formatting Policy

`implementation_plan.md` is an approval artifact, so format it for quick human review.

Formatting rules:
- YAML frontmatter remains first in the file.
- Choose structure based on the concrete change content.
- The first visible part of the document must quickly explain phase order and exactly what the user is approving.
- Immediately after the title/intro, add a compact visual review surface. This is not a fixed section; it is 2-5 callouts, bullets, or table rows with the most important approval information.
- In the compact visual review surface, use semantic emoji markers when they add signal: 📌 approval scope, 🚫 out of scope, ✅ key decision/success, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Do not leave an approval artifact as an ordinary wall of markdown when semantic visual markers, callouts, or grouping clearly speed up review.
- Use one primary human language for artifact prose; keep code identifiers, file paths, commands, and source terms in their original form.
- If a question affects the approval artifact, ask the user and stop until the answer.
- Do not write pending open questions into `implementation_plan.md` as a substitute for asking the user.
- Separate accepted assumptions and deferred design-stage decisions from questions that require an answer before approval.
- Do not create empty, decorative, or artificial sections when they do not help review.
- Use headings, short paragraphs, bullets, tables, blockquotes, and bold where they help readability.
- If a list grows beyond 7 items, group it by meaningful categories instead of using one long flat list.
- Use callouts for approval scope, reviewer attention, sequencing risks, accepted assumptions, and deferred decisions when they exist.
- If there are sequencing risks, accepted assumptions, dependencies, or reviewer attention points, make them visually noticeable near the top.
- Emoji may be used as semantic visual markers when they help scan the document.
- Do not use emoji in YAML frontmatter.
- Do not use emoji in commands, file paths, code blocks, or required machine-readable labels.
- Do not use emoji in machine-parsed phase headings `## Phase N: <Phase name> [<status>]`.
- In `implementation_plan.md`, preserve all machine-readable elements from the artifact template.

Stage completion:
- After writing `implementation_plan.md`, stop.
- Tell the user that the plan is ready. Explain that the user must personally review [implementation_plan.md]({{plan_path}}), change `approved: false` to `approved: true` (and enter their name in `approved_by: "..."`) in its header, and then run `flow next`.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `implementation_plan.md`
