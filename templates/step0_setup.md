Этап 0. AI Layer Setup.

Stage contract: подготовить начальные артефакты change.

Вход:
- описание задачи/доработки из текущего контекста;
- правила и ограничения пользователя для этой задачи;
- проектный репозиторий;
- доступные пользователю уточнения, если описание задачи недостаточно для требований.

Обязательные действия:
1. Сначала запросите у пользователя описание задачи/доработки, если его еще нет в контексте, и остановитесь до ответа.
2. Затем отдельным запросом запросите правила и ограничения для этой задачи, если их еще нет в контексте, и остановитесь до ответа.
3. Не создавайте `prd.md` и `rules.md`, пока оба пункта не получены: описание задачи и правила/ограничения задачи.
4. Если после получения описания и правил остаются неоднозначности для требований или границ change, задайте точечные вопросы и остановитесь до ответа.
5. Создайте папку изменений: `openspec/changes/<название-доработки>/`.
6. Создайте `prd.md` в папке изменений. В начале файла должен быть YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
7. Создайте `rules.md` в папке изменений. В начале файла должен быть YAML frontmatter:
---
approved: false
approved_by: ""
date: {{date}}
---
8. В `rules.md` обязательно добавьте раздел `## Test Commands`:
```md
## Test Commands
- unit: `...`
- phase: `...`
- full: `...`
```

Требования к артефактам:
- `prd.md` фиксирует требования, границы change и критерии успеха.
- `rules.md` фиксирует project constraints и gate commands, нужные следующим этапам.
- ИИ-агент не имеет права менять `approved: false` на `approved: true`; approval делает пользователь.

## Human Review Formatting Policy

`prd.md` и `rules.md` являются approval artifacts, поэтому оформляйте их для быстрого human review.

Правила оформления:
- YAML frontmatter остается первым в каждом файле.
- Структуру выбирайте по содержанию конкретного change.
- Первая видимая часть документа должна быстро объяснять, что именно пользователь approve-ит.
- Сразу после title/intro добавьте compact visual review surface; это не фиксированная секция, а 2-5 callouts, bullets или table rows с самым важным для approval.
- В compact visual review surface используйте semantic emoji markers там, где они добавляют сигнал: 📌 approval scope, 🚫 out of scope, ✅ key success/decision, ⚠️ risk/reviewer attention, 🧪 validation, 🔒 security/secret boundary.
- Не оставляйте approval artifact как обычную простыню markdown, если semantic visual markers, callouts или grouping явно ускоряют review.
- Используйте один основной human language для prose artifact; code identifiers, file paths, commands и source terms оставляйте в оригинале.
- Если вопрос влияет на approval artifact, задайте его пользователю и остановитесь до ответа.
- Не записывайте pending open questions в `prd.md` или `rules.md` как замену вопросу пользователю.
- Отделяйте accepted assumptions и deferred design-stage decisions от вопросов, которые требуют ответа до approval.
- Не создавайте пустые, декоративные или искусственные разделы вроде risks/notes/security, если там нет material content.
- Используйте headings, короткие абзацы, bullets, tables, blockquotes и bold там, где это помогает чтению.
- Если список становится длиннее 7 пунктов, сгруппируйте его по смысловым категориям вместо одного long flat list.
- Используйте callouts для approval scope, reviewer attention, out-of-scope границ, accepted assumptions и deferred decisions, если они есть.
- Если есть scope boundaries, accepted assumptions или reviewer attention points, сделайте их визуально заметными near the top.
- Можно использовать эмоджи как смысловые visual markers, если они помогают сканировать документ.
- не используйте эмоджи в YAML frontmatter.
- не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.
- В `rules.md` сохраните все machine-readable элементы раздела `## Test Commands` без декоративного форматирования внутри команд.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- change folder `openspec/changes/<название-доработки>/`
- `prd.md`
- `rules.md`

Завершение шага:
- После создания `prd.md` и `rules.md` остановите работу.
- Сообщите пользователю, что он должен проверить файлы, установить `approved: true` и затем запустить `flow next`.

{{skill_policy}}
