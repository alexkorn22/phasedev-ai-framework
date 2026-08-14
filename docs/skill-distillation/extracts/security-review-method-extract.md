# Экстракт: security-review-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Экстракт S1–S49 (агент sonnet). Фильтры — см. карточку.

## Inventory (главное)

| Path | Verdict |
|---|---|
| `zuvo/rules/security.md` (215) | **Primary**: границы валидации, XSS, SSRF (IPv6/CGNAT/redirect/DNS-rebinding), path traversal (symlink/parent-realpath), upload, SQLi, секреты, authN/token transport, API-чеклист, threat-model таблица, крипта, десериализация, security-логирование, supply chain |
| `zuvo/rules/cq-checklist.md` (partial) | Смыслы security-гейтов: guard+query-scoping; PII в логах/ошибках/хедерах; CSRF; опасные синки (path/shell/deserialize/URL); supply chain; CSPRNG/KDF; authz двух уровней (BFLA/mass assignment) + N/A-ловушки («SameSite достаточно» — нет; «input is trusted» — решает происхождение, не доверие) |
| `ECC/agents/security-reviewer.md` (118) | OWASP-проход; таблица паттерн→severity; **security-FP список** (.env.example, помеченные тест-креды, публичные ключи, SHA для чексумм — «always verify context before flagging») |
| `ECC/skills/security-review/SKILL.md` (partial) | Триггеры; verification-чеклисты по темам; CSP-позиция («start strict, loosen only with documented removal plan»); pre-deployment чеклист |
| `ECC/rules/common/security.md`, `rules/web/security.md` | Pre-commit чеклист; nonce-CSP, SRI, security-заголовки |
| `zuvo/rules/cq-patterns{,-core}.md` (partial) | NEVER/ALWAYS: timing-safe compare через hash-first (timingSafeEqual на сырых буферах бросает = length oracle + 500); webhook по сырым байтам с replay-окном; LLM-вывод = недоверенный ввод; prototype pollution; ReDoS; GCM authTagLength; полевой allowlist против mass assignment; normalize+startsWith-ловушка traversal |
| `zuvo/shared/includes/pentest-finding-registry.md` (partial) | Универсальная таксономия finding_type → CWE (37 строк) |
| `zuvo/skills/security-audit` (981, light) | Source→sink дисциплина уверенности (**локальный прямой поток = HIGH; непрослеженный межфункциональный — кап MEDIUM**); auth coverage-матрица по эндпоинтам; multi-tenant чеклист (источник tenant ID: токен SAFE / параметры DANGEROUS; cross-tenant векторы: кэши, очереди, файлы, фоновые джобы); бизнес-логика (TOCTOU, price-from-client, обход state machine) |
| `zuvo/skills/pentest` (881, light) | PT1–PT7 классы; **Next.js 'use server': каждый экспорт server action — гард первой строкой, иначе CRITICAL** («looks internal» — не гард); MUST-GATE: ASSUME-EXPLOIT / NO-HEDGING / PROOF / FULL-COVERAGE / STRICT-SEQUENCE (sink→trace→defense→verdict) |
| `zuvo/skills/api-audit` (light) | OWASP API Top 10: BOLA/BOPLA/BFLA/JWT alg-confusion/GraphQL; различение «auth есть» vs «auth корректен» |
| `ECC/skills/security-bounty-hunter` (light) | Skip-список FP: локальный pickle без remote-пути, eval в CLI-тулинге, shell=True на хардкод-командах, отсутствие заголовков само по себе, self-XSS, demo/test-код |
| `zuvo/.../cross-provider-review.md` (light) | Подавление secret-FP: комментарии, .env.example, плейсхолдеры — не живые секреты |
| `zuvo/.../adversarial-loop.md` (light) | HIGH_RISK-сигналы (auth/token/payment/migration/crypto-пути) → обязательный security-режим ревью |
| Отложено | Cloud-infra (361), 20+ per-language security-правил ECC + зеркала/переводы — ось B; pentest-регистры safe-pattern/source-sink/dedup-scoring — тулинг |

Полные формулировки S1–S49 — в отчёте агента сессии 2026-08-04; победители перенесены дословно в SKILL.md и references.

## Ключевые решения при экстракте

- CQ-нумерация донора при переносе снимается — остаются смыслы гейтов.
- Продуктовые имена ECC-чеклистов (Supabase/Vercel/Dependabot) генерализуются.
- Worked examples (TS/Node) → `references/patterns.md`; CWE-таксономия → `references/vulnerability-taxonomy.md`.
- Общая evidence/confidence-дисциплина — граница с code-review-method: здесь остаётся только security-специфика (source→sink уверенность, ASSUME-EXPLOIT, security-FP списки).
