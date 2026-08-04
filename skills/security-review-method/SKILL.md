---
name: security-review-method
description: Use when performing a defensive security review of application code changes — walking vulnerability classes, tracing attacker-controlled input to dangerous sinks, and reporting evidenced security findings without noise.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Security Review Method

## Purpose

A security reviewer's method for finding real, reachable vulnerabilities in application code — and not drowning the one real leak in a flood of theoretical flags. Stack-independent, aligned with common vulnerability taxonomies.

## When This Review Is Mandatory

A change touches: auth, guards, tokens, sessions, payment/billing, migrations or schema, encryption/hashing, secrets, PII — or paths like auth/, payment/, crypto/, migrations/. Also: new API endpoints, user input or file-upload handling, third-party integrations, anything storing or transmitting sensitive data.

## Review Discipline

- **Assume-exploit.** Treat a traced flow as exploitable unless the defense is proven sufficient on the live path. A safe-pattern match is evidence, not auto-exclusion — the trace must show the defense covers this flow.
- **No hedging.** "Might be vulnerable" is not a finding: prove it or move it out of final findings. Every final finding needs a source trace or runtime evidence.
- **Strict sequence per candidate: sink → trace → defense → judgment.** Confirm the sink; trace whether attacker-controlled input reaches it (provenance, not trust, decides — "input is trusted" is not an argument); check framework mitigations and explicit validation on the traced path; then judge.
- **Confidence by trace quality.** A locally visible direct flow (untrusted input meets the sink in the same function) is high-confidence on its own. A cross-function flow you could NOT connect is capped at medium — report it as needs-verification, never as a headline finding. Low-confidence theory is excluded.
- **Fix completeness:** for data-flow findings, the fix covers BOTH the source side (validation) and the sink side (escaping/parameterization).
- **Coverage is reported**: state which files were checked against the scope inventory — a partial pass is not a clean pass.

## Vulnerability Walkthrough

Work the classes; per-class worked examples live in `references/patterns.md`, the class→CWE map in `references/vulnerability-taxonomy.md`.

- **Boundaries and injection.** Input validated at every system boundary (server-side; client validation is UX, not control). No string-built SQL — parameterized only. Subprocess args as argv arrays, never interpolated shell strings. No eval/dynamic code on untrusted input; no native deserialization of untrusted bytes; JSON parsing followed by schema validation.
- **XSS.** Sanitize before rendering user HTML with a vetted library; framework auto-escaping bypasses (raw-HTML props, template literals in HTML contexts) are the audit points. CSP: start strict, per-request nonces, no unsafe-inline as a permanent state.
- **SSRF.** Allowlist hosts AND protocols; block private IPv4 and IPv6 ranges (including CGNAT and IPv4-mapped IPv6 — an IPv4-only list is the classic bypass); disable or re-validate redirects on every hop; where feasible resolve DNS and pin the IP (rebinding); timeouts on all outbound calls.
- **Path traversal.** Resolve to absolute, prove containment via relative-path segment compare — normalize+startsWith passes real escapes (sibling-directory trap). Symlinks: realpath the PARENT (target may not exist yet). Prefer DB-stored file references over user-supplied names.
- **Uploads.** Server-side size limits; MIME by magic bytes, never the header; random server-side filenames; storage outside web root; explicit type allowlist.
- **Secrets.** None in source, client bundles, or logs; env/secret-manager with startup validation; leaked once — rotate everything. Auth-bearing tokens never in query params (they leak into logs, history, referer headers).
- **AuthN and sessions.** Verify auth on EVERY mutation endpoint and server action — including framework server actions, which are public POST endpoints by default: each one needs a first-line guard before any data access; "looks internal" is not a guard. JWT: verify signatures (decoding is not verification), pin the algorithm. Cookie sessions: httpOnly + Secure + SameSite plus CSRF token for mutations; bearer tokens in memory, sent via headers. Rate-limit auth endpoints.
- **Authorization — three distinct levels, audit each.** Object-level: every fetch/mutation filters by owner/tenant — guard alone is insufficient, the tenant/owner must appear in the query itself (defense in depth). Function-level: the handler asserts permission for THIS operation, not just "is authenticated". Field-level: write payloads are allowlisted — a blanket body spread into the ORM is mass assignment. Tenant ID comes from the auth token (safe), never request params (dangerous); check cross-tenant vectors beyond queries: cache keys, queue messages, file storage, background jobs.
- **CSRF.** Cookie-authenticated mutation needs SameSite AND a token (or origin verification), or a bearer transport the browser cannot auto-attach.
- **Crypto.** CSPRNG for anything an attacker must not predict — never `Math.random()`/timestamps; credentials via argon2id or bcrypt (cost ≥ 12), never bare fast hashes (high-entropy API tokens may be stored as SHA-256 — unlike passwords); library verify functions for comparison (constant-time); no bespoke crypto; secrets compared timing-safe via hash-to-fixed-width first (raw compare throws on length mismatch — a length oracle plus a crash).
- **Webhooks.** Verify HMAC over the RAW body bytes (a re-serialized body is different bytes), timing-safe compare, a bounded timestamp replay window, dedupe by event id.
- **LLM output is untrusted input.** Model text reaching any sink — path, shell, SQL, URL — gets the same validation as user input; schema-parse structured output and reject, don't silently repair; the loop gets only the caller's privileges, never ambient admin credentials.
- **Business logic.** Check-then-act races without atomicity; client-submitted prices/amounts used without server re-fetch; state-machine step-skipping by calling a later-stage endpoint directly.
- **Supply chain.** Lockfile committed; new dependencies pinned and checked against advisories.
- **Logging.** Failed auth and authz denials logged (identity, resource, action — never credentials); PII masked everywhere; alerts on repeated failures.

Verification pairing: every control has a required test that attacks it — the classic payloads table (metadata IP for SSRF, traversal path, missing-token request, wrong-tenant request expecting the service NOT called) is part of `references/patterns.md`.

## Security False Positives — Verify Context Before Flagging

- `.env.example` placeholders, comment-line matches, test fixtures, obvious placeholder tokens are not live secrets — a real finding is an assignment to a live config value. A flood of placeholder flags buries the one real leak.
- Clearly marked test credentials; deliberately public keys; fast hashes used for checksums (not credentials).
- Local-only deserialization with no remote path; eval in CLI-only tooling; shell invocation on fully hardcoded commands; missing security headers by themselves; self-XSS requiring the victim to paste code; demo/example/test-only code.
- Rate-limiting complaints without exploit impact.

## On a Critical Find

Document with the trace and a secure example; alert immediately; verify the remediation actually closes the path; if credentials were exposed — rotate them and sweep the codebase for the same pattern.

## Completion Condition

The security review is complete when every in-scope file was walked against the classes, every final finding carries a trace or runtime evidence with location, needs-verification items are separated from findings, dismissals name their verified false-positive class, and coverage against the scope inventory is stated.
