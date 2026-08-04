# Quick-Fail Patterns — Examples and Detection

JS/TS (vitest/jest/Testing Library) examples; the patterns themselves are stack-neutral.

**1. Always-true assertion**
```typescript
// FORBIDDEN — screen is always defined
expect(screen).toBeDefined();
// FIX
expect(screen.getByText('Industry Name')).toBeInTheDocument();
```

**2. UI input echo**
```typescript
// FORBIDDEN — you typed 'moon', you check 'moon'
await userEvent.type(input, 'moon');
expect(input).toHaveValue('moon');
// FIX — assert the downstream effect
expect(fetchProfiles).toHaveBeenCalledWith({ searchParams: { first_name: 'moon' } });
```

**3. Mock echo**
```typescript
// FORBIDDEN — mock returns { id: 29 }, you verify id === 29
expect(payload.id).toEqual(id);
// FIX — verify transformed or computed output
expect(payload.industry_name).toBe('Finance');
```

**4. Opaque dispatch**
```typescript
// FORBIDDEN — proves "a function was dispatched" but not which one
expect(typeof dispatchedAction).toBe('function');
// FIX — mock the thunk, verify args
expect(fetchProfiles).toHaveBeenCalledWith({ searchParams: expect.objectContaining({ first_name: 'moon' }) });
```

**5. Silent test skip**
```typescript
// FORBIDDEN — test passes when it skips
if (checkboxes.length === 0) return;
// FIX
expect(checkboxes.length).toBeGreaterThan(0);
```

**6. Hand-built wrong initial state**
```typescript
// FORBIDDEN
const state = reducer({ initialState: {} }, action);
// FIX — use the real state shape
const state = reduceFrom({ type: addProfile.fulfilled.type, payload });
expect(state.profiles).toContainEqual(expect.objectContaining({ id: 29 }));
```

**7. Loading-only assertions**
```typescript
// FORBIDDEN — loading checked but data never verified
expect(state.loading).toEqual(false);
// FIX
expect(state.loading).toBe(false);
expect(state.profiles).toEqual(PROFILE_FIXTURES);
```

**8. Tautological formula oracle**
```typescript
// FORBIDDEN — expected value mirrors implementation logic
expect(calcTotal(100, 2)).toBe(100 * 2 * 1.1);
// FIX — spec-derived literal
expect(calcTotal(100, 2)).toBe(220); // from pricing spec: "10% tax on subtotal"
```

**9. Raw .length compare**
```typescript
// FORBIDDEN — worse error messages, masks missing property
expect(result.issues.length).toBe(3);
// FIX
expect(result.issues).toHaveLength(3);
```

**10. Vague quantity on a known fixture**
```typescript
// FORBIDDEN — fixture output is known, but "at least one" is asserted
expect(result.errors.length).toBeGreaterThan(0);
// FIX — exact count
expect(result.errors).toHaveLength(2);
```

**11. Mock return echoed in assertion**
```typescript
// FORBIDDEN — proves the mock setup, not production logic
mockService.findOne.mockResolvedValue(testData[0]);
const result = await controller.getOne('123');
expect(result.id).toBe(testData[0].id);  // echo
// FIX — assert a computed/transformed value
expect(result.cpiAfterDiscount).toBe(2.25); // 2.5 * 0.9
```

**12. Persistent skip without tracking**
```typescript
// FORBIDDEN — dead code, silent coverage gap
describe.skip('FeedbackService', () => { /* 200 lines never run */ });
// FIX — remove, unskip, or track with expiry
// SKIP: [TICKET-123] blocked by migration, expires 2026-04-15
```

Also auto-fail: a committed focus marker (`it.only` / `describe.only` / `fit` — silently disables the rest of the suite; detect with grep or the linter's no-focused-tests rule) and retry/flaky annotations without a ticket and expiry.

## Echo-detection greps

```bash
# Input echoed as expected value: same literal in call and assertion
grep -n 'expect.*(\(.*\)).*toBe(\1)' <test-file>

# Mock return echoed: for each mockResolvedValue/mockReturnValue, search for the
# same value inside toBe/toEqual within the same test block (manual check)
```

## Tooling traps (vitest/jest)

- `vi.mock()` factories are hoisted above imports — outside variables must be wrapped in `vi.hoisted()`. Jest's hoisting differs.
- `vi.clearAllMocks()` clears call records but NOT `mockResolvedValue`/`mockImplementation` — a mock set in test A leaks into test B; use `resetAllMocks()` when a test relies on a mock having no return value. Exception: pass-through module mocks (spy-wrapped real impl) — reset wipes the wrapped impl and silently turns the mock into a no-op; use `clearAllMocks()` there.
- Async generators are mocked with `async function*`, streams with a real PassThrough/EventEmitter — a bare `vi.fn()` never emits, so the test hangs instead of failing.
- Time-dependent code uses fake timers, never the real clock.
