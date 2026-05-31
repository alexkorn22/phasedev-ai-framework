Этап 6. Archive.

Ваша задача — завершить уже перенесенный в архив change: синхронизировать спецификации OpenSpec на основании утвержденных артефактов archived change и завершить machine-state.

Controller уже проверил readiness gate:
- `prd.md`, `rules.md`, `architecture/design.md`, `implementation_plan.md` утверждены;
- все фазы в `implementation_plan.md` имеют статус `[x]`;
- `validation_findings.md` имеет `type: final` и `verdict: ready` или `ready_with_risks`.
- active change уже перенесен в archive path: `{{archive_path}}`.
- pending-state файл создан: [{{archive_state_path}}]({{archive_state_path}}).

Входные артефакты требований и дизайна (обязательно прочитайте):
- Требования PRD: [prd.md]({{prd_path}})
- Правила разработки: [rules.md]({{rules_path}})
- Факты исследования: [research_facts.md]({{research_path}})
- Утвержденный дизайн: [design.md]({{design_path}})
- План реализации: [implementation_plan.md]({{plan_path}})

Gate-status файл:
- Validation status: [validation_findings.md]({{findings_path}})

Не используйте `validation_findings.md` как источник требований, поведения продукта или архитектурных решений. Этот файл нужен только как gate status.

## Visual Formatting Scope

В финальном отчете можно использовать visual formatting и эмоджи как смысловые visual markers, если это помогает понять результат archive step.

Ограничения:
- В OpenSpec requirement text не используйте эмоджи, decorative callouts или rich formatting, которое не является частью spec language.
- OpenSpec specs остаются нормативными, стабильными и пригодными для долгоживущего чтения без визуального декора.
- не используйте эмоджи в YAML frontmatter.
- не используйте эмоджи в командах, file paths, code blocks и обязательных machine-readable labels.

## Delta-first specs

Работайте только с requirement-level изменениями, которые выводятся из артефактов archived change `{{change_name}}`.

1. Прочитайте входные артефакты и выделите только пользовательские/системные capability changes, которые должны попасть в долгоживущие OpenSpec specs.
2. Проанализируйте существующие спецификации: [openspec/specs]({{main_specs_path}}).
3. Если spec-level изменений нет, явно зафиксируйте в финальном отчете: `Spec sync skipped: no requirement-level changes`.
4. Если изменения есть, создайте delta specs в archived change-директории: [{{archive_path}}/specs]({{change_specs_path}}).
   - Путь capability spec: `{{archive_path}}/specs/<capability>/spec.md`.
   - One spec file = one functional area.
   - Перед созданием файлов выделите функциональные области из `prd.md`, `rules.md`, `research_facts.md`, `architecture/design.md` и `implementation_plan.md`.
   - Не создавайте один большой catch-all spec вроде `specification`, `change`, `archive` или `{{change_name}}`.
   - Если change затрагивает несколько независимых пользовательских сценариев, workflow, API/интерфейсов, модулей, доменов, ролей или интеграций, создайте несколько capability directories.
   - Не создавайте новую capability, если изменение должно обновить существующую capability.
   - Если изменение обновляет existing capability, пишите delta spec для этой capability, но не смешивайте unrelated требования из других функциональных областей.
   - Не переносите в specs внутренние implementation details, временные задачи, тестовые команды или validation findings.

Используйте формат OpenSpec delta specs:

```md
## ADDED Requirements

### Requirement: <requirement name>
The system SHALL ...

#### Scenario: <scenario name>
- WHEN ...
- THEN ...

## MODIFIED Requirements

### Requirement: <existing requirement name>
The system SHALL ...

#### Scenario: <scenario name>
- WHEN ...
- THEN ...

## REMOVED Requirements

### Requirement: <existing requirement name>
Reason: <why removed>

## RENAMED Requirements

### Requirement: <old requirement name>
Renamed to: <new requirement name>
```

Правила формата:
- Используйте только секции, которые реально нужны: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`.
- Каждый requirement начинается с `### Requirement: ...`.
- Каждый scenario начинается ровно с `#### Scenario: ...`.
- Нормативные требования формулируйте через `SHALL` или `MUST`.
- Для `MODIFIED` включайте полный обновленный requirement, а не patch-фрагмент.

## Sync specs

После создания delta specs синхронизируйте их в `openspec/specs`:
- аккуратно добавьте новые capabilities;
- обновите существующие capabilities только в пределах требований текущего change;
- сохраните существующие requirements/scenarios, которые текущий change не меняет;
- если не уверены, что изменение является spec-level, не добавляйте его в specs и объясните это в отчете.

## Complete archive state

После успешной spec sync или явного skip обновите `.flow-archive.json` в archived change:
- файл: [{{archive_state_path}}]({{archive_state_path}})
- установите `status: "completed"`;
- сохраните `changeName`, `archivePath`, `startedAt`;
- добавьте `completedAt` в ISO-8601 формате.

Завершение шага:
- Остановитесь после обновления `.flow-archive.json`.
- В отчете укажите, какие specs были созданы/обновлены или почему sync был пропущен.
- Укажите итоговый archive path: `{{archive_path}}`.
- Не предлагайте запускать следующий этап flow.

## Artifact allowlist

Allowed persistent artifacts for this stage:
- OpenSpec delta specs in `{{archive_path}}/specs`
- `openspec/specs`
- `{{archive_state_path}}`

{{skill_policy}}
