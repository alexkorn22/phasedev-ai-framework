# Удаление проверки approved_hash

## Проблема

Механизм `approved_hash` — over-engineering. `approvalContentHash()` считает SHA-256 тела артефакта (с нормализацией чекбоксов задач, статусов итераций и таблиц Check Evidence, чтобы прогресс выполнения не сбивал хэш), `approveArtifact()` пишет его в frontmatter вместе с `approved: true`, а `isApproved()` при каждой проверке (`advance`/`check`) пересчитывает хэш и сравнивает с сохранённым. Если файл поменяли руками после approve — хэш не совпадает и approval молча аннулируется (soft-блок в state machine), даже если правка была тривиальной (опечатка, форматирование). Если `approved_hash` отсутствует (legacy/hand-edited файл) — approval тоже отклоняется.

Это добавляет сложность (три функции нормализации, отдельный слой сравнения) ради защиты, которая не была запрошена и создаёт неожиданные блокировки при ручном редактировании одобренных файлов.

## Новая семантика

`approved: true` во frontmatter — единственный источник истины. Если пользователь/агент проставил `approved: true`, артефакт считается одобренным всегда, независимо от последующих изменений содержимого. Ответственность за повторное одобрение после правок — на пользователе/агенте, не на фреймворке.

## Изменения

### 1. `src/shared/markdown/frontmatter.ts`
- Удалить функции `approvalContentHash`, `normalizeTaskCheckboxes`, `normalizeCheckEvidenceTables` (включая связанные импорты из `./table`, если больше нигде не используются).
- `isApproved()`: оставить только проверку `frontmatter.approved === true`. Убрать чтение и сравнение `approved_hash`.

### 2. `src/features/artifact-ops/approve-artifact.ts`
- Убрать вычисление `approvalContentHash(content)` и запись строки `approved_hash` в YAML. При approve пишутся только `approved: true` и `approved_by`.

### 3. `src/features/phase-control/reopen-phase.ts`
- Убрать логику удаления/сброса строки `approved_hash` (она больше не пишется при approve, поэтому и чистить при reopen нечего). Сброс `approved: false`, `approved_by: ""` остаётся как есть.

### 4. `scripts/generate-agent-prompts.ts`
- Убрать `approved_hash` из сгенерированного примера approved-артефакта.

### 5. Тесты
- Удалить `test/approval-hash.test.ts` целиком.
- Из `test/frontmatter.test.ts` убрать тесты, специфичные для хэш-нормализации (чекбоксы задач, статусы итераций, таблицы Check Evidence) и любые прямые тесты `approvalContentHash`.
- В `test/cli.test.ts`, `test/controller.test.ts`, `test/e2e-flow.test.ts` заменить хелперы/фикстуры, которые сейчас вызывают `approvalContentHash` для подготовки approved-файлов, на прямую запись `approved: true` без хэша.

### 6. Незакоммиченная рабочая копия
- В рабочем дереве сейчас лежат недавно добавленные `normalizeTaskCheckboxes`/`normalizeCheckEvidenceTables` в `src/shared/markdown/frontmatter.ts` и соответствующие тесты в `test/frontmatter.test.ts` — это работа по починке хэш-нормализации, которая целиком выбрасывается вместе с самим хэшем. Эти незакоммиченные изменения не переносятся, а откатываются/не включаются в новую версию файла.
- Остальные несвязанные uncommitted-изменения (`get-phase-prompt.ts`, `get-route-prompt.ts`, тесты в `cli.test.ts` про `--task`/auto-resolution/maxIterations) не относятся к этой задаче и не трогаются.

## Что не меняется

- Поля `approved`, `approved_by` во frontmatter и их запись/сброс.
- `state.json`, маршрутизация фаз, `isSetupApproved`/`isDesignApproved`/`isPlanApproved` — продолжают работать через упрощённый `isApproved()`.
- Существующие артефакты с устаревшим полем `approved_hash` во frontmatter — поле просто игнорируется, принудительной очистки старых файлов не делаем.

## Тестирование

- `bun test test/frontmatter.test.ts test/cli.test.ts test/controller.test.ts test/e2e-flow.test.ts`
- `bun test` (полный прогон, т.к. изменение затрагивает cross-module approval-логику)
- `npm run typecheck`
