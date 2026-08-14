# Worked Patterns (TS/Node examples; the traps are stack-neutral)

## Threat → control → required test

| Threat | Control | Required test |
|---|---|---|
| XSS | Sanitizer / auto-escape | Render user HTML → verify sanitized output |
| SQL injection | Parameterized queries / ORM | Pass `'; DROP TABLE--` → verify no raw execution |
| SSRF | Host allowlist + protocol check | Pass `http://169.254.169.254` → verify blocked |
| Path traversal | resolve + containment check | Pass `../../etc/passwd` → verify 400 |
| Auth bypass | Middleware auth check | Request without token → verify 401 |
| Credential in URL | Header/cookie transport | Request with `?token=` → verify rejected |
| Tenant isolation | org/owner filter in query | Wrong-org request → verify 403 AND the service was not called |
| CSRF | SameSite + token | POST without CSRF token → verify 403 |
| Rate limiting | Limiter middleware | N+1 requests → verify 429 |
| Upload abuse | Size + magic-byte check | Oversized / executable upload → verify rejected |
| Log leakage | PII masking | Trigger error with PII → verify logs masked |

## Timing-safe compare — the throw trap

```typescript
// NEVER — === leaks length via short-circuit timing
if (botSecret !== expectedSecret) throw new UnauthorizedException();
// ALSO NEVER — timingSafeEqual on raw buffers THROWS on length mismatch:
// wrong-length token => uncaught 500 = remote DoS + length oracle.
// ALWAYS — hash both to fixed width first; length becomes unobservable, compare can't throw
import { createHash, timingSafeEqual } from 'node:crypto';
const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
if (!timingSafeEqual(digest(botSecret ?? ''), digest(expectedSecret))) throw new UnauthorizedException();
```

## Path traversal — normalize+startsWith is broken

```typescript
// NEVER — normalize() isn't absolute; startsWith matches sibling dirs:
// base /var/data + "../data-evil/x" -> /var/data-evil/x, startsWith('/var/data') === true
const base = path.resolve(baseDir);
const target = path.resolve(base, userInput);
const rel = path.relative(base, target);
if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))
  throw new Error('Path traversal blocked');
// Symlinks: realpath the PARENT (target may not exist yet; realpath throws ENOENT)
const realParent = await fs.promises.realpath(path.dirname(target));
const relReal = path.relative(base, path.join(realParent, path.basename(target)));
if (relReal === '..' || relReal.startsWith('..' + path.sep) || path.isAbsolute(relReal))
  throw new Error('Symlink escape');
// Still check-then-use: where a swap between check and open matters, open with O_NOFOLLOW.
```

## SSRF — the bypass set

```typescript
const url = new URL(req.body.webhookUrl);            // parse, never concatenate
if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new BadRequestException();
const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
```

Block private ranges in BOTH families: `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `127/8`, `100.64/10` (CGNAT/cloud metadata), and `::1`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96` (IPv4-mapped — `::ffff:169.254.169.254` passes a v6-only check). An allowlisted host that 302s internally defeats the list — disable redirects or re-validate every hop; resolve DNS and pin the IP where rebinding matters.

## Webhooks — raw bytes or nothing

```typescript
// NEVER verify JSON.stringify(req.body) — the parsed+re-serialized body is different bytes.
app.post("/webhooks/pay", express.raw({ type: "application/json" }), (req, res) => {
  const { timestamp, signature } = parseSigHeader(String(req.headers["x-signature"] ?? ""));
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return res.status(400).end(); // replay window
  const expected = createHmac("sha256", process.env.WEBHOOK_SECRET!)
    .update(`${timestamp}.${req.body}`).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return res.status(400).end();
  // at-least-once delivery: dedupe by event id before side effects
});
```

## Authorization — three levels in code

```typescript
// Object-level: guard AND query filter (defense in depth)
return this.prisma.item.findMany({ where: { surveyId, organizationId: orgId } });

// Function-level + field-level: permission for THIS operation; allowlisted writes
@Patch(':id') @RequirePermission('user:update')
update(@Body() dto: UpdateUserDto) {
  const { displayName, avatarUrl } = dto;   // role/orgId/id not writable here
  return this.users.update(id, { displayName, avatarUrl });
}
// NEVER: update(id, { ...body }) — mass assignment lets the caller set role/orgId.
```

## Crypto quickies

```typescript
const resetToken = crypto.randomBytes(32).toString('base64url');  // never Math.random()
const stored = await argon2.hash(password);                        // or bcrypt cost >= 12
const ok = await argon2.verify(stored, password);                  // library verify = constant time
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 }); // no truncation
```

## Misc sinks

```typescript
// LLM/model output reaching any sink gets user-input validation:
const Plan = z.object({ action: z.enum(["search", "summarize"]), query: z.string().max(500) });
const plan = Plan.parse(JSON.parse(llmResponse));   // reject, don't silently repair

execFileSync('convert', [userFile, 'out.png']);      // argv array, never shell: true
const escaped = userInput.replace(/[.*+?^{}()|[\]\\]/g, '\\$&'); // before new RegExp(userInput)
// Dynamic keys: reject __proto__/constructor/prototype before obj[key] = v
// External scripts: subresource integrity + crossorigin
// JSON.parse at a boundary: try/catch, then schema-validate the unknown
```

## Security headers baseline

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{RANDOM}'; frame-src 'none'; object-src 'none'; base-uri 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

Adjust origins per project — do not cargo-cult the CSP block unchanged; no permanent unsafe-inline/unsafe-eval.
