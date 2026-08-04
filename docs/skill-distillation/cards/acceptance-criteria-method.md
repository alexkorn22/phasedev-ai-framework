# Карточка скилла: `acceptance-criteria-method`

## Паспорт

- **Скилл**: `acceptance-criteria-method`
- **Этап**: 2 (порядок «по флоу»)
- **Роли-потребители** (§5.3): `intake-analyst`, `planner`
- **Статус**: assembled → приёмка L1

## Шаг 1. Источники

| Источник | Строк | Роль |
|---|---|---|
| `zuvo/shared/includes/acceptance-proof-protocol.md` | 169 | Донор рецептной части; экстрагирован ранее — V20–V58 в `extracts/verification-method-extract.md` |
| `ECC/skills/intent-driven-development/` | 360 | Основной донор ECC — A1–A61 в `extracts/acceptance-criteria-method-extract.md` |
| `zuvo/skills/brainstorm/agents/business-analyst.md` | 263 | Свип: edge/failure-элиситация, ship/success (A62–A78) |
| `zuvo/skills/brainstorm/agents/spec-reviewer.md` + `SKILL.md` | 239+671 | Свип: ревью-калибровка, дисциплина вопросов (A79–A105) |
| Тонкие (jira-integration, mle-workflow, adversarial-loop-docs) | — | A106–A111, почти всё дубли |

## Шаг 3. Решения фильтров — zuvo-часть (V-нумерация из verification-экстракта)

**Победители (авторская сторона критерия, переносятся):**

- V22 — AC = "a specific user-observable or system-observable behavior the feature must exhibit".
- V23 — пруф = "a deterministic procedure... that... produces evidence the AC is satisfied. Written alongside the AC" — пруф пишется вместе с критерием, а не изобретается при проверке.
- V29 — "MUST have command-observable pass/fail evidence... No 'it works' prose."
- V43 — "What is the user-observable behavior? Write it as a single declarative sentence."
- V44 — "What's the smallest deterministic procedure that exhibits this behavior? That is the proof body."
- V45 — "What artifact would a skeptic accept? That is the expected output."
- V46 — принцип «назови поверхность, предпочитай самую конкретную» — БЕЗ таблицы таксономии (см. дедуп ниже).
- V47 — авторская половина: критерий главного пользовательского флоу помечается и как whole-feature smoke.
- V48 — "negative/uniqueness/idempotency invariant → the proof MUST seed a deliberate conflict... A happy-path-only proof lets a silent-drop implementation pass the gate."
- V31 (часть) — "A judgment AC without a numeric corpus target is too vague."
- V54 — "If you cannot answer... without using words like 'should work' or 'looks right', the AC is too vague — return... to tighten it."
- V21 (часть) — "Tests are an implementation detail of the proof — not the proof itself."

**Дедуп между своими скиллами (риск №2):** таблица таксономии поверхностей (V26) и исполнение/гейтинг пруфов (V25, V35–V42) принадлежат `verification-method`. Здесь остаётся только авторская сторона: как написать критерий и его пруф. Границу зафиксировать в обоих скиллах не нужно — она в карточках.

**Фильтр 2 vs `dev-core`:** Goal-Driven Execution в dev-core («преврати задачу в проверяемую цель») — то же направление, но без метода: там три примера-переформулировки, здесь структура критерия, запрет слов и правило конфликта. Не дубль и не конфликт: dev-core — дисциплина исполнителя, этот скилл — метод автора критериев; `intake-analyst` dev-core не несёт. Записи в конфликт-лог не требуется.

**Фильтр 1:** V34, V56–V58 (стадии их воркфлоу, legacy-обработка) — lifecycle, выбыли.

## Шаг 3 (продолжение). Решения фильтров — ECC/zuvo-свип

**Фильтр 1 (lifecycle) — выбыли:** A6, A22–A26, A33 (частично), A37–A44, A100–A103 — форматы донора (Acceptance Brief, Quick Capture, AC-NNN как мандат, revision log, Proof-шаблон спеки; решение роадмапа «режем шаблоны» + суть пруфа уже в V23); A10/A21 — сохранена суть ревизии без `[revised]`-разметки; A17, A40, A61 — файловая/handoff-механика; A111 — severity-машинка.

**Фильтр 2 (дельта к своду) — решения:**

- A13/A31 (бизнес-ограничения не из кода) — сильнее dev-core «never guess domain logic»: двухисточниковая модель + «record as assumptions, never as discovered facts». Перенос дословный; это ядро скилла по роадмапу.
- A96–A97 (верификация точных заявлений) — родственно verification-method V2, но контекст другой (факты интервью, не заявления о завершении). Оставлено здесь в краткой форме.
- Дубли внутри экстракта схлопнуты: A64–A67 ⊂ A36 (таблица категорий полнее); A54–A60 ⊂ A48–A53; A106–A109 ⊂ A11/A35.

**Фильтр 3 — выбыли:** A1/A3 (декларации, ушли в Purpose), A46 (pass-пример — суть в правиле «two people would agree»), A62/A79/A80 (родовые формулировки ревью).

**Победители:** V-часть (см. выше) + A2/A4 (When to Use), A5/A12–A16, A18–A21, A27–A32, A34–A36, A45, A47–A53, A68–A78, A83–A93 (в авторской форме), A95–A99, A110.

## Шаг 4. Конфликты

Проверен кандидат по конфликту №1 (порог покрытия): intent-driven-development порогов не несёт, A33 прямо говорит «criteria and tests are not required to map one-to-one» — согласуется с Test Economy, конфликта нет. Числовые минимумы ревьюера zuvo (min 3 сценария, 1:1 маппинг компонентов) не перенесены — по духу конфликта №3 (чеклист берём, скоринг-машинку нет). Новых записей в лог нет.

## Шаг 6. Приёмка

- L1 — после сборки.
- L2 — батчем после этапа.
