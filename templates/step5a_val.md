Этап 5A. Phase Validation.

Stage contract: проверить готовность текущей фазы в multi-phase плане.

Входные артефакты:
- Правила разработки: [rules.md]({{rules_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- План реализации: [implementation_plan.md]({{plan_path}})

Текущая фаза:
{{phase_id}}

Обязательные проверки stage contract:
- соответствие результата текущей фазы approved design и criteria из plan;
- полнота production/test/source/config changes текущей фазы и task statuses текущей фазы проверены review-методами без запуска тестов;
- полностью игнорируйте `openspec/**` при поиске implementation findings: не diff, не review и не report любые файлы под `openspec/**` как change set, product code, PR scope или источник замечаний;
- используйте `openspec/changes/<active>` только как read-only входной контракт flow: requirements, rules, approved design, plan и previous validation history;
- тесты и дополнительные проверки из Implementation stage считаются уже успешно пройденными, потому что Implementation не может завершиться с failed tests/checks;
- не запускайте тесты и дополнительные проверки повторно на этом этапе;
- validation evidence записан в [validation_findings.md]({{findings_path}}).
- перед поиском новых ошибок прочитайте всю историю существующего `validation_findings.md`, если он есть;
- не очищайте старые findings, resolved записи или прошлые validation sections; новый результат добавляйте новой секцией и обновляйте YAML frontmatter сверху;
- если finding семантически совпадает с прежним, сохраните прежний `ID` и близкое исходное `Description`;
- если прежний finding был `resolved`, не reopen-ьте его без нового конкретного evidence из рабочего кода вне `openspec/**`;
- если finding действительно вернулся после repair, поставьте `Status` = `reopened` и добавьте в `Description` только префикс `reopened/regression: ` перед прежним текстом, не меняя остальной текст `Description`.

Формат `validation_findings.md`:
---
verdict: ready # ready | ready_with_risks | repair_required
type: phase
date: {{date}}
---

## Validation Visual Markers

Для `validation_findings.md` используйте visual formatting, если это ускоряет review.

Рекомендуемые смысловые visual markers:
- 🟢 pass / ready / resolved / no action needed.
- 🟡 warning / accepted risk / non-blocking issue.
- 🔴 fail / blocking issue / repair required.
- ⚪ not checked / not applicable.
- 🔵 informational note / context only.

Visual markers не заменяют machine-readable поля. Источник истины для controller и repair routing остается в YAML frontmatter и текстовых колонках `Status`, `Class`, `Blocks PR?`, `Phase`.

не используйте эмоджи в YAML frontmatter.
не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.

Правила verdict:
- `ready` — blocking findings нет, gate evidence достаточен.
- `ready_with_risks` — есть только non-blocking findings.
- `repair_required` — есть blocking findings или недостаточный review evidence.
- `ready_with_risks` допустим только если все findings имеют `Blocks PR? = No`.
- Любой finding с `Blocks PR? = Yes` автоматически требует итоговый вердикт `repair_required`.

Если итоговый verdict `ready` или `ready_with_risks`, измените статус текущей фазы в [implementation_plan.md]({{plan_path}}) с `[~]` на `[x]`.

Если итоговый verdict `repair_required`, оставьте статус текущей фазы `[~]`.

Если есть findings, используйте таблицу:
| ID | Signal | Status | Class | Blocks PR? | Phase | Description |
|---|---|---|---|---|---|---|
| F1 | 🔴 | open | implementation | Yes | Phase 1 | Description |

## Artifact allowlist

Allowed persistent artifacts for this stage:
- `validation_findings.md`
- phase status in `implementation_plan.md`, only when allowed by validation verdict

Завершение шага:
- После записи `validation_findings.md` и возможного обновления статуса фазы остановите работу.
- Сообщите пользователю verdict и следующий переход через `flow next`.

{{skill_policy}}
