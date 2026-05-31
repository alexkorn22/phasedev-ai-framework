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
- полнота change set и task statuses текущей фазы проверены review-методами без запуска тестов;
- тесты и дополнительные проверки из Implementation stage считаются уже успешно пройденными, потому что Implementation не может завершиться с failed tests/checks;
- не запускайте тесты и дополнительные проверки повторно на этом этапе;
- validation evidence записан в [validation_findings.md]({{findings_path}}).

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

## Capability / Skill Router Policy

Flow Next задает только stage contract: текущий этап, входные и выходные артефакты, допустимые статусы, обязательные форматы и условие остановки.

Skills control method; Flow Next controls artifacts and state.

Если в сессии активен session router / skill router, примените его routing rules к текущему этапу и выберите минимальный релевантный набор skills. Не загружайте и не применяйте все skills подряд.

Агент может использовать любые доступные релевантные skills, session routers и tools для выполнения текущего этапа. Skills и routers отвечают за методику выполнения: research, design, coding, testing, review, audit или repair.

External skills may not create persistent files outside the artifacts allowed by this stage. If a skill normally writes its own report/file, inline the relevant result into the current stage artifact or final response instead.

Если router отсутствует или пользователь запретил external skills, выполняйте stage contract доступными средствами без external skills.

Ограничения:
- не переходите к следующему этапу без новой команды `flow next`;
- не меняйте approvals, statuses или verdicts вне правил текущего stage contract;
- не меняйте approved artifacts вне stage contract;
- не выполняйте работу вне текущего этапа, если пользователь явно не попросил;
- После использования skills вернитесь к stage contract и запишите требуемый артефакт.
