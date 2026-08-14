# Экстракт: verification-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Статус: задел — по порядку «по флоу» скилл собирается на этапе implementation-check/final-validator, после codebase-recon, планировочных и имплементерских скиллов. Фильтры (шаг 3) к экстракту ещё НЕ применялись.

## Inventory

| Path | Lines | Verdict |
|---|---|---|
| `zuvo/shared/includes/verification-protocol.md` | 81 | **Primary donor** — read in full |
| `zuvo/shared/includes/acceptance-proof-protocol.md` | 169 | **Primary donor** — read in full |
| `zuvo/shared/includes/regression-fence.md` | 85 | **Primary donor** — read in full |
| `zuvo/shared/includes/review-artifact.md` | 178 | Additional candidate — proof-of-work / anti-fabrication for review-completion claims |
| `zuvo/shared/includes/coverage-manifest-schema.md` | 110 | Additional candidate — validator-only-approval, no-claim-without-printed-proof |
| `zuvo/shared/includes/test-quality-gate.md` | 65 | Additional candidate — NO-SUBSTITUTION / never-relabel-WARN-as-PASS |
| `zuvo/shared/includes/refactor-reference.md` | 236 | Additional candidate — Anti-Rationalization Gate + "no `[x]` without proof" |
| `zuvo/shared/includes/stall-recovery.md` | 190 | Additional candidate — "rate-limit is a retry condition, never a quality lever" |
| `zuvo/shared/includes/retrospective.md` | 331 | Additional candidate — "pasting fabricated output is a falsification" |
| `zuvo/shared/includes/agent-preamble.md` | 60 | Additional candidate — evidence-required / no-completeness-claim rules |
| `zuvo/shared/includes/blind-coverage-audit.md` | 139 | Additional candidate — одна цитата (изоляция blind-аудита) |
| `ECC/.agents/skills/verification-loop/SKILL.md` | 125 | Additional candidate — checklist-style verification skill |
| `ECC/.agents/skills/agent-introspection-debugging/SKILL.md` | ~140 | Additional candidate — одна цитата (no unsupported auto-healing claims) |
| `zuvo/shared/includes/gate-registry.md`, `quality-gates.md`, `q-scoring-protocol.md` | — | Excluded — CQ/Q каталоги (code-review/test-quality) |
| `zuvo/shared/includes/tdd-protocol.md` | 81 | Excluded — tdd-method |
| `zuvo/shared/includes/provided-artifact-supremacy.md` | 92 | Excluded — design-fidelity-method |
| `zuvo/shared/includes/session-state.md`, `no-pause-protocol.md`, `live-probe-protocol.md`, `run-logger.md`, `fix-loop.md`, `compressed-response-protocol.md` | — | Excluded — чужой lifecycle/другие темы |
| `zuvo/shared/includes/adversarial-loop*.md`, `cross-provider-review.md` | — | Excluded — code-review-method |
| `zuvo/shared/includes/eval-schema.md`, `scanner-invocation.md`, `knowledge-*.md`, `test-reviewer-routing.md`, `audit-output-schema.md`, `backlog-protocol.md` | — | Excluded — другие темы |
| `zuvo/rules/*.md` | — | Excluded — стековые/ревью-каталоги |
| ECC `tdd-workflow`, `e2e-testing`, `security-review`, `agent-sort`, `everything-claude-code` | — | Excluded — другие темы |
| Остальные ~65 файлов `zuvo/shared/includes/` | — | Прочёсаны grep'ом (verif/proof/evidence/claim/completion/fresh/exit code/fabricat) — попаданий нет |

## Extracted statements

### `zuvo/shared/includes/verification-protocol.md`

**V1** (3) — "Iron law: no completion claims without fresh evidence from the actual system."

**V2** (7) — "Never state that something works, passes, is fixed, or is complete unless you have run a verification command in this session and read its output. Prior knowledge, memory of previous runs, and logical deduction are not substitutes for fresh evidence."

**V3** (9) — "This applies to every claim: 'tests pass,' 'build succeeds,' 'the bug is fixed,' 'the feature works,' 'no errors.' If you did not just run the command and read the output, you cannot make the claim."

**V4** (15) — Step 1 IDENTIFY: "Determine which command or check would prove your claim true. Be specific."

**V5** (17-25) — Claim → Verification command table:

| Claim | Verification command |
|-------|---------------------|
| "Tests pass" | `npm test` / `pytest` / `vitest run` (the project's actual test command) |
| "Build succeeds" | `npm run build` / `tsc --noEmit` |
| "The bug is fixed" | Run the exact reproduction steps from the bug report |
| "No type errors" | `tsc --noEmit` (not just "no red squiggles") |
| "Lint clean" | `npm run lint` / `eslint .` |
| "Feature works" | Manual verification or test that exercises the feature |
| "File is valid" | Read the file, confirm syntax and structure |

**V6** (29) — Step 2 RUN: "Execute the command. Run it fresh — do not rely on cached results from earlier in the conversation. If the command was run before a code change, it must be run again after."

**V7** (33) — Step 3 READ: "Read the complete output. Check the exit code. Do not skim."

**V8–V11** (34-37) — Look specifically for: "Non-zero exit codes"; "Failed test counts (even if some pass)"; "Warning messages that indicate problems"; "Error output that may appear after apparent success lines".

**V12** (41) — Step 4 VERIFY: "Confirm that the output actually supports the claim."

**V13** (42) — Common trap: "'3 passed, 1 failed' does NOT support 'tests pass'"

**V14** (43) — Common trap: "'Compiled with warnings' does NOT support 'build succeeds' if warnings are errors in CI"

**V15** (44) — Common trap: "A test passing does not mean the bug is fixed if the test does not reproduce the bug"

**V16** (48-54) — Step 5 CLAIM: "Only after steps 1-4 are complete, make the claim. Include the evidence:"
```
Tests pass: `npm test` exited 0, 47 passed, 0 failed.
Build succeeds: `tsc --noEmit` exited 0, no errors.
Bug fixed: reproduction steps from issue #42 now produce expected output (verified via test).
```

**V17** (58-70) — Red Flags table: "If you catch yourself doing any of these, stop and run the verification protocol:"

| Red flag | What is actually happening |
|----------|---------------------------|
| "Tests should pass" | You have not run them |
| "This should fix the issue" | You have not verified it does |
| "The build will succeed" | You have not run it |
| "I believe this is correct" | You have not checked |
| "Based on my earlier run..." | That run was before your latest changes |
| "No errors expected" | Expectation is not evidence |
| "The implementation is complete" | Complete = verified, not just written |
| Skipping verification because "it's a small change" | Small changes break things too |
| Running tests on only one file when you changed three | Partial verification is not verification |

**V18** (74-79) — Scope: применяется к каждому заявлению о завершении задачи, «implementation done», «refactoring complete», каждой оценке гейта по результатам тестов, любому утверждению о состоянии системы. (Формулировка донора привязана к их командам — при сборке обобщить.)

**V19** (81) — "It does not apply to analysis-only outputs (audit reports, design documents, plans) where the claim is about findings, not system state."

### `zuvo/shared/includes/acceptance-proof-protocol.md`

**V20** (7-11) — What "done" is NOT: "A task is not done because: code committed / unit tests passed / spec reviewer said 'compliant' / adversarial review said 'no critical findings'"

**V21** (13) — "A task is done when the behavior promised by the Acceptance Criteria can be demonstrated to actually work, with evidence captured during execute. Tests are an implementation detail of the proof — not the proof itself. A passing unit test on a function whose AC was misunderstood proves nothing."

**V22** (19) — "Acceptance Criterion (AC): a specific user-observable or system-observable behavior the feature must exhibit."

**V23** (20) — "Acceptance Proof: a deterministic procedure (command, interaction, or measurement) that, when executed, produces evidence the AC is satisfied."

**V24** (21) — "Per-task proof: proof scoped to one task's slice of behavior."

**V25** (22) — "Whole-feature smoke proof: proof exercising the end-to-end user flow described in the spec's main use case. Run after all tasks complete... Catches structural bugs that span tasks."

**V26** (28-38) — Surface taxonomy table:

| Surface | Examples | Proof shape | Deterministic? |
|---------|----------|-------------|----------------|
| `backend-logic` | Pure functions, classes, parsers, validators | Run function with spec inputs, assert outputs match spec | Yes |
| `api` | HTTP endpoints, RPC handlers, GraphQL resolvers | Real call (curl/fetch/SDK) against running service, assert status + body shape against spec schema | Yes |
| `db` | Migrations, schema changes, seed data | Run migration on test DB, run sample queries, assert schema + data invariants | Yes |
| `db-data` | Background jobs, ETL, data transforms | Run on sample dataset, assert before/after invariants (counts, sums, key properties) | Yes |
| `ui` | Components, pages, interactions | Open dev server, navigate, interact, assert DOM state + screenshot | Mostly yes; visual quality may need LLM judge |
| `integration` | Wiring across services, event handlers | Trigger upstream event, observe downstream effect end-to-end | Yes |
| `config` | Env vars, feature flags, build config | Load config, assert dependent code reads expected values | Yes |
| `docs` | Markdown, READMEs, runbooks | Linter, link checker, content validation against rubric | Yes |
| `advisory` | Post-deploy SLO checks, perf baselines, manual smoke | Captured artifact + recommended next action, NOT a gate | N/A (not gated) |

**V27** (40) — "LLM-judge required only when the AC includes a subjective dimension that no deterministic check can express... requiring a binary VERIFIED or BROKEN token plus one-sentence justification. Default: deterministic."

**V28** (42) — Next.js dev hidden-duplicate-page-tree caveat: dev-сервер может отрендерить дерево роута дважды, document-wide селектор матчится 2×; скоупить селекторы пруфа к одному контейнеру, финальный смоук — на production build.

**V29** (48) — "Automated AC — MUST have command-observable pass/fail evidence (curl/test exit code/assertion). No 'it works' prose."

**V30** (49) — "Deployment gate — a separate class that may legitimately rely on a runbook artifact, topology proof, or release marker... MUST NOT be filed as, or scored against, an automated AC."

**V31** (50) — Judgment AC: детерминированные проверки — в CI-гейты; judgment-проверки — статистический recall на размеченном корпусе с явным численным критерием. "A judgment AC without a numeric corpus target is too vague."

**V32** (54-73) — Proof structure: каждый пруф объявляет `ac_id`, `surface`, `preconditions`, `proof`, `expected`, `artifact_path`.

**V33** (75) — UI surface: proof = interaction script; expected описывает и DOM-состояние, и визуальный артефакт.

**V34** (97-102) — Владение пруфами по стадиям их воркфлоу (spec пишет AC+Proof, план копирует пруф inline, исполнение гоняет пруфы и гейтит завершение). [lifecycle-привязка донора]

**V35** (106) — "**No proof = no completion.** A task without an Acceptance Proof field is rejected... Execute cannot mark such a task COMPLETED."

**V36** (107) — "**No aggregate scoring.** Telemetry must report per-file scores, never aggregate. Aggregate scores hide per-file zeros" (реальный инцидент: агрегат 19/19 скрыл два нуля по конкретным файлам).

**V37** (108) — "**Independence.** The agent or runner that executes the proof must not be the same agent that implemented the code, when multi-agent dispatch is available."

**V38** (109) — "**Whole-feature smoke is mandatory** for any plan that has a 'main user flow' AC. Per-task proofs alone cannot detect cross-task structural defects."

**V39** (110) — "**Dual-allocate smoke proofs.** Every whole-feature smoke proof must appear in TWO places: (a) the plan's smoke section (run at the end), AND (b) at least one task's test suite as a runnable end-to-end exercise. End-only smoke surfaces a cross-task regression only at the very end; the per-task copy makes it fail the moment the breaking task lands."

**V40** (111) — "**Proof failure = task BLOCKED, not WARN.** A proof that does not produce its expected outcome blocks the task."

**V41** (112) — "**Deterministic preferred.** Use LLM judge only when no deterministic check expresses the AC."

**V42** (113-118) — Artifact retention: один консолидированный отчёт пруфов на задачу, не по файлу на каждый AC. [форматная часть — lifecycle донора]

**V43–V47** (124-128) — Рецепт пруфа: (1) "What is the user-observable behavior? Write it as a single declarative sentence." (2) "What's the smallest deterministic procedure that exhibits this behavior? That is the proof body." (3) "What artifact would a skeptic accept? That is the expected output." (4) "What surface is it on? ...If uncertain, default to the most concrete." (5) "Is this a main user flow? If yes, also list it under Whole-feature Smoke Proofs."

**V48** (129) — "Is this a 'must NOT merge / must NOT drop' invariant? (negative/uniqueness/idempotency) Then the proof MUST seed a deliberate conflict... and assert BOTH survive distinctly (or that the merge is rejected). A happy-path-only proof lets a silent-drop implementation pass the gate."

**V49** (131-133) — "Check the exit-code polarity of every proof command. A proof gates on `$?`, so a command whose output reads correct but whose exit code is inverted is a broken gate that reports green."

**V50** (134-135) — "`… | grep -c PATTERN` — grep exits 1 when the count is 0, so an 'expect zero matches' gate is exactly backwards. Use `test "$(… | grep -c PATTERN)" -eq 0`."

**V51** (136-138) — "`git diff --exit-code -- <paths>` with no commit-ish compares worktree↔index, so it passes vacuously the moment the change is committed. Pin a base: `git diff --exit-code "$(git merge-base HEAD origin/main)" -- <paths>`."

**V52** (139) — "Any pipeline: the exit status is the LAST command's unless `set -o pipefail` is in effect."

**V53** (140-148) — "A `-t`-filtered proof MUST assert a non-zero passed count. `vitest run <file> -t "<title>"` that matches nothing prints 'Tests N skipped' and exits 0 — a proof that verifies nothing while reporting green. Always assert the run happened." + Corollary: "naming a test title before the test exists is guessing. Tell the implementer to put the AC id in the test title."

**V54** (150) — "If you cannot answer (1) without using words like 'should work' or 'looks right', the AC is too vague — return to brainstorm to tighten it."

**V55** (154-160) — Таблица реальных инцидентов и как протокол их предотвращает (агрегат скрыл нули; UI ушёл на 60% готовности с PASS; смоук ловит cross-task потерю данных). [контекст, не норматив]

**V56–V58** (166-169) — Legacy-обработка спек без пруфов. [lifecycle донора]

### `zuvo/shared/includes/regression-fence.md`

**V59** (3-5) — "A regression fence is a declared set of paths that MUST come out of the work byte-identical to the base commit, proven mechanically at every verification step. It converts 'I did not change the existing behaviour' from a claim into a check."

**V60** (7-9) — "Load this when a run needs to prove something was left alone: a refactor claiming behavioural equivalence, a feature whose flag-off path must be untouched, or a review triaging which findings belong to the diff."

**V61** (13-16) — "Agents assert 'existing tests unchanged' and 'moved verbatim' constantly, and those assertions are exactly the ones nobody verifies — they read as procedural boilerplate."

**V62** (20-25) — Whole-set fence check:
```bash
BASE="$(git merge-base origin/main HEAD)"
git diff --quiet "$BASE"..HEAD -- tests/ || {
  echo "FENCE VIOLATED: $(git diff --name-only "$BASE"..HEAD -- tests/ | tr '\n' ' ')"; exit 1; }
```

**V63** (27-38) — Per-file fence check (blob-хеши, точный):
```bash
for f in $FENCE_FILES; do
  # --verify --quiet is REQUIRED, not stylistic: plain `git rev-parse "HEAD:missing"` exits 128
  # but still ECHOES the input string to stdout — a naive `|| echo MISSING` captures BOTH lines
  b0="$(git rev-parse --verify --quiet "$BASE:$f" || echo MISSING_BASE)"
  b1="$(git rev-parse --verify --quiet "HEAD:$f"  || echo MISSING_HEAD)"
  [ "$b0" = "$b1" ] || echo "FENCE VIOLATED: $f ($b0 -> $b1)"
done
```

**V64** (41) — "MISSING_HEAD means the file was deleted, MISSING_BASE that it is new — both are violations of a fence, and both are invisible to a naive 'diff is empty' check that only looks at surviving files."

**V65** (46-47) — "**Declare the fence BEFORE the work starts...** A fence derived afterwards from 'whatever happens to be unchanged' proves nothing — it is the diff wearing a different hat. The fence is a prediction; verifying it is the test of that prediction."

**V66** (50-55) — Печатать при объявлении, ре-верифицировать на КАЖДОМ шаге верификации, не только в конце.

**V67** (59-63) — Куда встраивается (их воркфлоу). [lifecycle; сама идея «забор для MOVED_VERBATIM / flag-off / scope ревью» — переносима]

**V68** (67-69) — "A fenced file is unchanged by this work, so a finding against it is pre-existing debt, not a defect of this diff — record it as such rather than scoring it against the change."

**V69** (72-75) — "A finding in a fenced file that this diff caused — a caller broken by a changed signature, a consumer of a removed export — is IN scope. The file being unchanged is what makes it a regression rather than pre-existing debt."

**V70** (76-78) — "A fenced file whose behaviour changed without its bytes changing (its dependency moved, a config it reads was edited) is not covered by the fence at all. The fence proves byte identity, not behavioural identity — say so rather than implying the stronger guarantee."

**V71** (82-85) — "The fence is a git-level check: it proves content, not behaviour... It is strong evidence for 'this file was left alone' and no evidence at all for 'this file still does the same thing'."

### `zuvo/shared/includes/review-artifact.md`

**V72** (3-5) — "A crashed / aborted / early-exit run writes nothing — a failed run must never grant pipeline coverage (crash-safe by construction)."

**V73** (54-59) — Content-key доказывает свежесть артефакта, НЕ факт ревью; фабрикация проходит тривиально — поэтому артефакт обязан цитировать самое дорогое для подделки. [механика их гейта; идея «пруф должен быть дорог для подделки» — переносима]

**V74–V80** — Механика их pipeline-гейта (PROVISIONAL-форма, upgrade по blob-сверке, «stale → fresh review, never a silent upgrade»). [lifecycle донора; идеи: незакоммиченное ревью = честно помеченный не-пруф; расхождение blob'ов после ревью = stale]

### `zuvo/shared/includes/stall-recovery.md`

**V81** (23-25) — "A rate-limit / API-error / overload is... a retry condition and NOTHING else. It is NEVER a valid reason to skip, defer, downgrade... any mandatory gate... The gate is delayed, never skipped."

**V82** (27-30) — Запрещённые рационализации: «сделаю один агрегат вместо per-task», «CONDITIONAL/DEGRADED из-за лимита», «отгружу суть без церемонии». "The run stays unfinished and keeps retrying; an unfinished run is honest, a fake-complete run is not."

**V83** (32) — Честные состояния под лимитом: still-running или genuinely-complete — никогда «complete-but-degraded-because-rate-limit».

### `zuvo/shared/includes/refactor-reference.md`

**V84** (148-150) — "Every file in the batch gets a full evaluation, even if the agent believes it is already fixed. No file gets `[x]` without proof."

**V85** (158-169) — Anti-Rationalization Gate:

| Escape | Rule |
|--------|------|
| "Already fixed" | Forbidden without a BEFORE eval proving all gates pass. Print the scores. |
| "Audit misclassification" | Forbidden without specific counter-evidence (file:line proving the audit was wrong). |
| "Out of scope" for the target file | Forbidden. The file IS the target. Valid only for fixes requiring files not in the queue. |
| Partial fix | If gates still fail, mark PARTIAL, not done. |
| "N/A" without justification | Each N/A needs a one-sentence explanation. >60% N/A triggers a low-signal flag. |

**V86** (170) — "`[x]` means ALL in-scope gates pass. If any fixable gate remains, use PARTIAL."

**V87** (207) — Если обязательное ревью реально невозможно диспатчить — честный BLOCKED и понижение вердикта, "never report a clean batch with the aggregate review absent... a real review or an honest BLOCKED, never a silent skip."

### `zuvo/shared/includes/retrospective.md`

**V88** (318) — "Printing the markdown emit... is NOT the retrospective. The retrospective is the file write... **Pasting fabricated output is a falsification**" (ловится сверкой mtime).

**V89–V90** (320-330) — Forced-evidence postamble: требовать РЕАЛЬНЫЙ stdout команд-проверок с условиями приёмки; команда с ошибкой = действие не выполнено, повторить до реального вывода. [формат — lifecycle; принцип «пруф записи = вывод команды чтения» переносим]

### `zuvo/shared/includes/coverage-manifest-schema.md`

**V91** (3-6) — "The agent WRITES this file; only the validator APPROVES it. Never claim a gate result the validator did not print."

**V92** (55) — На фазе инвентаря ни одна строка не может заявлять FULL (ещё ничего не написано).

**V93** (89-96) — Exit-code семантика их валидатора; "NEVER proceed past a FAIL"; DEGRADED_PASS ≠ full clean gate. [их машинка; принципы переносимы]

**V94** (104-105) — "The inventory is generated by the writer but approved ONLY by the validator — the same stage never both generates and certifies."

**V95** (106-108) — "A validator FAIL is not a prompt to edit the manifest into passing. Missing symbol → add tests..., never delete the symbol from extraction's reach."

**V96** (109-110) — "Paste the validator's own output block into the run log. Summaries in prose are not gate evidence."

### `zuvo/shared/includes/test-quality-gate.md`

**V97** (9-13) — NO-SUBSTITUTION: самопере-скоринг не заменяет независимый гейт; заявление PASS без реального артефакта гейта = INVALID.

**V98** (47-50) — "Never silently accept; never relabel WARN as PASS."

### `zuvo/shared/includes/agent-preamble.md`

**V99** (9-13) — "Every finding requires evidence. No exceptions... Evidence format: `file_path:line_number` or `file_path:function_name:line_number`."

**V100** (15) — "Findings without evidence are discarded. 'I believe there may be an issue' is not a finding."

**V101** (58) — "Do not claim completeness ('I checked everything') — state what you actually checked"

**V102** (59) — "Do not fabricate file paths or line numbers to fill evidence requirements"

### `zuvo/shared/includes/blind-coverage-audit.md`

**V103** (33) — "If strict isolation is unavailable, do not claim a passing blind audit. Defer the audit or fail the file explicitly."

### `ECC/.agents/skills/verification-loop/SKILL.md`

**V104–V113** — Шестифазный чеклист (build → types → lint → tests → security grep → diff review), формат отчёта, continuous mode. [В основном слабее zuvo-аналогов; порог покрытия 80% — конфликт №1; формат отчёта — фильтр 1]

### `ECC/.agents/skills/agent-introspection-debugging/SKILL.md`

**V114** (90) — "Do not claim unsupported auto-healing actions... unless you are actually doing them through real tools in the current environment."
