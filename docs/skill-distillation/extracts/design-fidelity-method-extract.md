# Экстракт: design-fidelity-method (шаги 1–2 конвейера)

Дата: 2026-08-04. Фильтры применены — см. карточку `cards/design-fidelity-method.md`.

## Inventory

| Path | Lines | Verdict |
|---|---|---|
| `zuvo/shared/includes/provided-artifact-supremacy.md` | 92 | **Primary donor** — полный экстракт (D1–D36) |
| `zuvo/skills/brainstorm/SKILL.md` | 671 | Additional — Provided-Design Check (D37–D43), новое правило про существующие approved-спеки |
| `zuvo/skills/brainstorm/agents/spec-reviewer.md` | 239 | Additional — ревьюерский чеклист верности C13 (D44–D49) |
| `zuvo/skills/plan/SKILL.md` | 649 | Additional — Provided-Design Check плановой стадии (D50–D55) |
| `zuvo/skills/plan/agents/plan-reviewer.md` | 196 | Additional — ревьюерский чеклист верности №9 (D56–D61) |
| `zuvo/docs/skill-improvements-2026-06.md` | 790 | Excluded — предложения, не влитые в живые скиллы |
| Прочие хиты («source of truth» про env/state/gates, docs/specs, rules) | — | Excluded — другая тема |
| `ECC/**` целиком | — | Excluded — два независимых словаря свипа; темы «артефакт пользователя vs репозиторий» в ECC нет |

## Extracted statements (D1–D61)

### `zuvo/shared/includes/provided-artifact-supremacy.md`

- D1 (3): "that artifact is the SOURCE OF TRUTH for WHAT to build."
- D2 (3): "The existing codebase tells you HOW to build it; it is NEVER grounds to override the design."
- D3 (5): "The agent read the handoff but treated it as advisory and substituted its own repo reading — the cardinal sin this include forbids."
- D4 (11-17): определение «выданного» артефакта: приложенный/указанный файл или папка (handoff, прототип, спека, дизайн-экспорт); скриншот/мокап/картинка UI; ссылка на прототип/референс или страница «match this»; фразы "match this", "1:1", "pixel", "like the prototype/design"; **живой внешний контракт**, промеренный в сессии (реальные HTTP-вызовы, CLI round-trip), или рабочая референс-реализация в другой кодовой базе/языке.
- D5 (18-22): "A measured response IS a provided artifact: it constrains the design exactly as a spec does... Extract those constraints with the verifying evidence inline (status code + response fragment, or the reference file:line), so a later reader can tell a **measured** constraint from an **assumed** one."
- D6 (24): "If ANY holds → this protocol is MANDATORY. If none → skip it (you are designing from scratch; the user's words are the brief)."
- D7 (28): "Before exploring the codebase, **read the artifact end-to-end** and extract its hard constraints into a checklist with IDs."
- D8 (30): "**Layout / structure** — panels, columns, docks, regions, what is where."
- D9 (31): "**Interactions** — what each control does, navigation, state transitions."
- D10 (32): "**Explicit do / don't** — every `do not`, `never`, `must`, `always`, `one`, `single`, `no <X>` is a HARD constraint. Quote it."
- D11 (33): "**Visual specifics** that the user can verify (counts, order, spacing rules the design states)."
- D12 (34-40): формат чеклиста DC-N с тегами [layout]/[interaction]/[DO-NOT].
- D13 (42): "Skimming and extracting the wrong thing... is the failure. If the artifact is long, read all of it; do not stop at the first section that looks relevant."
- D14 (46): "If the provided artifact contains a **working implementation**... the default is to **port that code 1:1** into the target stack, NOT to read its behavior in prose and hand-roll your own version."
- D15 (48): "**First action: inventory the artifact's code files**... and READ them. They are the ground truth for layout, structure, interactions, and styling — far more precise than any prose handoff."
- D16 (49): "Port component-by-component: map each artifact component to a target-stack equivalent, preserving its structure, class names / tokens, and interaction wiring. Adapt only what the stack genuinely requires."
- D17 (50): "'Reinventing it from the handoff because the stack differs' is the failure. The stack difference is a porting task, not a reason to design fresh."
- D18 (51): "Only when the artifact is *purely* prose/image (no code) do you design the implementation yourself — and even then §2–§4 bind you to its constraints."
- D19 (56): "The artifact decides **what the result must be** (layout, behavior, the do/don'ts)."
- D20 (57): "The repo decides **how you implement it** (which store, which component, migration path)."
- D21 (58): "You may NEVER downgrade the artifact to 'reference-only' because the current code is structured differently. 'The repo already has a left sidebar...' is a HOW problem to solve (move those modes), not a license to keep a panel the design forbids."
- D22 (62): "The rule is therefore **NO SILENT DIVERGENCE IN EITHER DIRECTION** — not 'copy the prototype pixel-for-pixel no matter what'"
- D23 (64): "The original sin... is silently substituting **your own** design for the artifact's. Forbidden."
- D24 (65): "The opposite sin is silently 'fixing' or improving the artifact with **your own** opinion. Also forbidden."
- D25 (66): "When the artifact is **wrong / incomplete / ambiguous / impossible / conflicts with reality**..., you do NOT blindly copy the mistake AND you do NOT quietly override it. You **surface it** with your proposed correction and get the user's call. The prototype being authoritative means it's the default and the baseline — not that it's beyond question."
- D26 (68): "follow the artifact by default; flag where it's genuinely deficient; let the user decide. Both 'I ignored your design' and 'I copied a flaw in your design without telling you' are failures."
- D27 (72): "When a spec/plan decision would **differ from a Design Constraint**... you do NOT proceed silently and you do NOT rationalize it from repo structure. Surface it and get a decision"
- D28–D29 (75-82): форматы [DEVIATION]/[ARTIFACT-GAP] с текстом «Confirm: (a) follow the design as-is, or (b) accept this deviation».
- D30 (84): "A **surfaced, user-approved** deviation recorded in the spec/plan is legitimate... The defect is a **SILENT** divergence in either direction... Reviewers FAIL only the silent ones."
- D31 (88): "Clarifying questions cover **deviations from the provided design FIRST**... before any generic gap."
- D32 (88): "The load-bearing question is 'your design shows X, the repo has Y — which wins here?', asked EARLY, not 'how should I build the thing your prototype already specifies?', asked at the end."
- D33 (88): "If the artifact already answers a question unambiguously, do NOT ask it — follow it."
- D34 (92): чеклист копируется в спеку и план; ревьюеры грейдят **верность**, не только внутреннюю консистентность.
- D35 (92): "Every architecture decision that touches a DC cites it."
- D36 (92): "A plan that is internally perfect but contradicts a DC is a FAIL, not an APPROVE."

### `zuvo/skills/brainstorm/SKILL.md` (D37–D43)

- D37–D42: Provided-Design Check как обязательный шаг ДО начала работы; "the gate that stops the dominant expensive failure: building the wrong thing correctly because the agent grounded on its own repo reading instead of the design the user handed it" (D42).
- D43 (185): существующая approved-спека пересекающейся темы = выданный артефакт (supremacy применяется): "frame the new spec around it — never author a parallel or conflicting spec."

### Ревьюерские чеклисты (D44–D49, D56–D61)

- D46/D58: отсутствие извлечённого чеклиста ограничений при выданном артефакте = FAIL ("grounded on the agent's own reading, not the user's design").
- D47/D59: молчаливое противоречие жёсткому ограничению = FAIL независимо от качества остального.
- D48/D60: surfaced + одобренное отклонение = легитимно, не FAIL; фейлится только молчаливое.
- D49/D61: артефакт с рабочим кодом + план «переизобрести» вместо портирования без объяснения = FAIL.
- D51/D57: инцидент-обоснование (план держал сайдбар, который handoff прямо запрещал; все остальные проверки прошли; 5 часов впустую).
- D54 (168): "A 7000-line working prototype is ground truth, not a sketch to reinterpret."
