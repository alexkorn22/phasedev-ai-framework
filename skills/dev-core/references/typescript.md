# DEV-CORE — TypeScript (Backend & Server-Side Engineering) Reference

Applies strictly when designing, writing, editing, or refactoring TypeScript on the backend and server side (Node.js, Bun, Deno, NestJS, Express, Fastify, Serverless, domain services). This reference governs server application logic, APIs, domain models, infrastructure adapters, and data persistence — NOT frontend UI/JSX components.

---

## 1. Architectural Blueprint (Server-Side Hybrid Architecture)

Enforce a 3-tier hybrid architecture to ensure long-term scalability, low cognitive load, zero "Flat Feature Hell", and zero "Layered Mud":

### 1.1 Macro-Level: Modular Monolith (Bounded Contexts)
- **Bounded Contexts**: Group server code into high-level business modules (`src/modules/<module_name>/`).
- **Strict Public API Boundary**: Every module MUST export a single entry point `index.ts`. All external modules MUST import exclusively from `modules/<module_name>/index.ts`.
- **Forbidden**: Never import internal module files directly (e.g., `import ... from 'modules/<module_name>/internal/...'` is PROHIBITED).

### 1.2 Domain Level: Clean Core (Protected Business Rules)
- **Clean Business Logic**: Keep core entities, business rules, and validation logic in `domain/` pure and free of framework dependencies, ORMs, or HTTP transport code.
- **Testability**: Domain logic must be 100% testable without database or network infrastructure.

### 1.3 Micro-Level: Vertical Slice Architecture (Feature-Based)
- **Feature Colocation**: Inside a module, organize use cases into feature directories (`features/<feature_name>/`).
- **Self-Contained Slices**: Each feature directory contains its handler (`.handler.ts`), request schema (`.schema.ts`), types (`.types.ts`), and spec (`.spec.ts`).
- **No Global Layer Clutter**: Never scatter a feature across global `controllers/`, `services/`, `models/` directories.

### 1.4 Shared Layer Isolation (`src/shared/`)
- Contains only headless technical utilities, database clients, loggers, and base error types.
- **Rule**: Code in `src/shared/` MUST NEVER import anything from `src/modules/`.

---

## 2. Programming Style: Pragmatic Hybrid (Data-Driven FP + Class Services)

Do not enforce dogmatic purism. Use the paradigm appropriate for the boundary:

- **Business Domain & Data Transformation -> Data-Driven Functional Style**:
  - Model domain data as plain `readonly` type aliases or interfaces.
  - Write pure functions for business calculations, state transitions, and data pipelines.
  - Never place methods directly on JSON/DTO objects that cross network boundaries (e.g., `JSON.stringify` strips class methods; POJOs + pure functions prevent prototype loss).
- **Infrastructure, Long-Lived Resources & Adapters -> Class-Based OOP**:
  - Use classes for database connection pools, socket clients, cache managers, and disposable resource handles (`class DbClient`, `class CacheManager`).
  - Use classes to encapsulate internal stateful resources or implement `Disposable` / `AsyncDisposable`.

---

## 3. Design Patterns Catalog & Application Rules

Apply these specific patterns to eliminate conditional bloat and keep code extensible:

### 3.1 Strategy Pattern via Object Lookup (`satisfies`)
- **Rule**: Replace branching `if/else` or `switch` chains for variant processing with a dictionary map typed with `satisfies`.
- **Pattern**:
  ```typescript
  export type VariantHandler<TContext, TResult, TError> = (ctx: TContext) => Promise<Result<TResult, TError>>;
  export const variantStrategies = {
    variantA: async (ctx) => handleVariantA(ctx),
    variantB: async (ctx) => handleVariantB(ctx),
  } satisfies Record<VariantType, VariantHandler<Context, ResultData, ErrorData>>;
  ```
- **Extensibility**: Adding a variant requires adding one object property without touching existing execution logic.

### 3.2 Composable Pipeline / Middleware Pattern
- **Rule**: Decompose multi-step data processing or request handling into a chain of composable functions `(ctx) => Promise<Result<ctx, Err>>`.
- **Pattern**: Combine steps using a typed `pipe()` utility or execution array to add steps (logging, audit, validation) without mutating core handlers.

### 3.3 Adapter Pattern (Ports & Adapters)
- **Rule**: Wrap external third-party SDKs and external APIs behind application-owned adapter interfaces. Never leak third-party types into domain code.

### 3.4 Type-Safe Builder Pattern
- **Rule**: For complex domain entities or configuration objects, use fluent builders that leverage generic type markers to enforce that mandatory fields are set before `.build()` can be called.

---

## 4. Strict Type System & Language Standards (TS 5.x+)

- **Zero `any`**: Use `unknown` combined with runtime guards (Zod, Valibot, or `is` type predicates). Never use `as any` or `@ts-ignore`.
- **`satisfies` over `as`**: Use `satisfies` to validate shapes while preserving exact literal inference. Use `as` assertions ONLY at genuinely unavoidable external boundaries.
- **No TS `enum`**: Never use TypeScript `enum` (they generate unnecessary JS code and unsafe numeric mappings). Use `const` object assertions with Union Types:
  ```typescript
  export const AppRole = { ADMIN: 'ADMIN', USER: 'USER' } as const;
  export type AppRole = (typeof AppRole)[keyof typeof AppRole];
  ```
- **Branded Nominal Types**: Prevent Primitive Obsession for domain entity identifiers and monetary/unit amounts by applying a nominal `Brand<T, Tag>` marker type:
  ```typescript
  export type Brand<T, K extends string> = T & { readonly __brand: K };
  export type EntityId<TDomain extends string> = Brand<string, TDomain>;
  export const makeEntityId = <TDomain extends string>(id: string) => id as EntityId<TDomain>;
  ```
- **Discriminated Unions & Exhaustiveness**: Model domain states as tagged unions. Enforce exhaustive handling with an `assertNever` helper:
  ```typescript
  export function assertNever(x: never): never {
    throw new Error(`Unhandled branch: ${JSON.stringify(x)}`);
  }
  ```
- **`noUncheckedIndexedAccess`**: Treat dynamic dictionary and array index accesses as `T | undefined` and handle `undefined` explicitly.

---

## 5. Error Handling, Resources & Async Standards

- **Result<T, E> Pattern for Business Errors**:
  - Model expected domain/business failures as typed return data: `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`.
  - **Rule**: Never use `throw new Error()` for expected business failures. Reserve `throw` strictly for unrecoverable runtime crashes / panics.
- **Explicit Resource Management (`using` / `await using`)**:
  - Use TS 5.2+ `using` / `await using` declarations for automatic, deterministic resource cleanup (database transactions, file handles, locks) implementing `Disposable` or `AsyncDisposable`. Never rely on manual `try/finally` when a disposable resource handle can be used.
- **Mandatory `AbortSignal` Propagation**:
  - All asynchronous I/O operations (database queries, HTTP client requests, remote calls) MUST accept an optional `options?: { signal?: AbortSignal }` parameter and pass it to downstream calls to prevent zombie async tasks.
- **No Floating Promises**: Every promise must be explicitly `await`ed, returned, or handled with `Promise.all()`. Floating unhandled promises are strictly forbidden.
- **Pragmatic Closure DI**: Pass dependencies via function arguments or environment context objects (`type Env = { repository: DomainRepository }`) instead of heavy class decorators or IoC container magic.
