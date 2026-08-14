# Карточка скилла: `security-review-method`

## Паспорт

- **Скилл**: `security-review-method`
- **Этап**: 5 (порядок «по флоу»)
- **Роли-потребители** (§5.3): `security-review`
- **Статус**: assembled → приёмка L1

## Шаг 1. Источники

См. `extracts/security-review-method-extract.md` (S1–S49; sonnet). Сильнейшая композиция — authz из трёх независимых источников (объектный/функциональный/полевой уровни: BOLA/BFLA/mass assignment), чего ни один донор не покрывает в одиночку.

## Шаг 3. Решения фильтров

**Фильтр 1 (lifecycle) — выбыли:** pentest-регистры (probe-шаблоны, source-sink regex, dedup-scoring, output-контракты); донорская агент-маршрутизация в S26 (сам протокол реагирования сохранён без имён агентов); CQ-нумерация снята — остались смыслы; продуктовые имена (Supabase/Vercel/Dependabot) генерализованы; D9/D12-разметка аудита снята — различение «auth есть vs auth корректен» сохранено.

**Фильтр 2 (дельта к своду):**

- dev-core несёт «injection-safe by default» и «validate at boundaries» — но роль security-review dev-core не носит, и контекст другой (аудит, не написание). Прецедент codebase-recon/R37 применён: оставлено.
- Общая evidence/confidence-дисциплина — у code-review-method; здесь только security-специфика: source→sink уверенность (локальный прямой поток = HIGH; непрослеженный межфункциональный — кап MEDIUM), ASSUME-EXPLOIT/NO-HEDGING, security-FP списки.
- Threat-model таблица «угроза → контроль → требуемый тест» пересекается с acceptance-criteria (намеренный конфликт для негативных критериев) — здесь оставлена как проверочная таблица ревьюера, не как метод написания критериев.

**Стековое → references/ или ось B:** TS/Node worked examples (timing-safe hash-first, webhook raw-bytes, path-traversal с symlink-parent, GCM authTagLength, prototype pollution) → `references/patterns.md`; CWE-таксономия → `references/vulnerability-taxonomy.md`; per-language правила ECC (20 файлов + зеркала) и cloud-infra — волна 5/по потребности.

**Фильтр 3 — выбыли:** декларации и дубликатные чеклисты ECC (S22/S24/S25 схлопнуты с zuvo-аналогами — оставлена одна формулировка на правило), S20/S26 слиты в один протокол реагирования.

## Шаг 4. Конфликты

Новых записей нет. Донор-vs-донор: пересекающиеся чеклисты zuvo/ECC схлопнуты в пользу более строгой формулировки (zuvo, кроме OWASP-прохода ECC — он структурно полнее).

## Шаг 6. Приёмка

- L1 — после сборки. L2 — батчем.

## Интеграция

`config.yaml`: `security-review: [security-review-method]` — полный целевой список §5.3.
