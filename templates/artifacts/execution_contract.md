---
{{approval_frontmatter}}
---

# Rules

## Test Commands

| Gate | Command |
|---|---|
| unit | `echo TODO: add unit test recipe with {{test_targets_placeholder}} placeholder` |
| phase | `echo TODO: add phase-level test recipe with {{test_targets_placeholder}} placeholder` |
| full | `echo TODO: add exact full-gate repository command` |

## Environment Notes

- `unit` and `phase` are target templates: use stable runner command recipes with `{{test_targets_placeholder}}` at the substitution point when targets vary per iteration; exact no-placeholder commands remain valid when the runner is target-independent.
- `full` is one exact repository-wide command for Final Validation implementation-check; never substitute placeholders into `full`.
- During implementation and repair, agents select new/changed test file paths or package/test selectors from the actual diff, instantiate `unit`/`phase` recipes, execute only those focused commands, and record the exact instantiated command in Check Evidence.
- At change intake, future source/test files do not exist; do not guess concrete future test paths in `unit` or `phase` recipes.
- The optional `## Browser Validation` section is omitted unless the change needs a browser sub-agent at final validation. When written, use a Field/Value table with rows `start`, `url`, and `criteria` in that order; do not add a `required` flag.
