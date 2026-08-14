# Surface-Specific Narrowing Sequences

Ordered checks per failure surface. Work top to bottom; stop when the failure point is identified.

## API / Backend

1. Reproduce with curl or the test runner against the endpoint.
2. Check request validation — does the schema reject the input, or does it let bad data through?
3. Check auth context at the point of failure.
4. Check the database query — does it return expected data? Run EXPLAIN for slow queries.
5. Check error handling — does the catch block swallow, transform, or propagate correctly?

## Frontend / UI

1. Check browser console for errors, network tab for failed requests.
2. Determine if API data is correct — if yes, the bug is in rendering or state management.
3. Trace component prop flow to the failing component.
4. Check event handlers — does the user action trigger the expected dispatch or callback?
5. Check SSR hydration mismatch if applicable.

## Database / Performance

1. Identify the slow or failing query from logs or ORM debug mode.
2. Run EXPLAIN ANALYZE — missing index? full table scan? cartesian join?
3. Check for N+1 patterns (same query executed in a loop).
4. Check connection pool exhaustion or timeout settings.
5. Check if dataset size has grown beyond what the query handles efficiently.

## Async / Flaky

1. Run the failing test 5 times. How often does it fail?
2. Check for shared mutable state between tests (globals, singletons, database rows).
3. Check timing assumptions (setTimeout, sleep, waitFor with insufficient duration).
4. Check execution-order dependency (does the test rely on another test running first?).
5. Check resource cleanup (ports, connections, file handles released properly?).
