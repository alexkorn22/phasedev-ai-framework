---
name: codebase-recon
description: Use when exploring an unfamiliar codebase, module, or feature area before analysis, design, or planning — to build an accurate map of entry points, execution flow, layers, and conventions without reading everything.
version: 1.0.0
compatibility: universal
metadata:
  source: distilled
---

# Codebase Recon

## Purpose

A systematic method for reconnoitering a codebase: what to look at, in what order, when to stop, and how to stay honest about what was not examined. The goal is understanding grounded in the source itself — how existing behavior actually works — before any new work begins.

## When to Use

- First contact with an unfamiliar project, module, or feature area.
- Scoping research before design, planning, or estimation.
- Gathering evidence for an analysis where the code is the primary source.

## Intake-Restricted Mode

Before intake is complete, a PhaseDev change-intake phase forbids inspecting the repository at all — no file reads, searches, logs, config, tests, or template inspection. If your dispatch is an intake role and intake is not yet complete, do NOT run Step 1's signal sweep: gather only the task description and the task-specific constraints from the user, then stop.

After intake completes, the phase allows a narrow budget: at most one broad file listing, plus focused searches for concrete evidence (and one focused package/workspace listing when needed for nested or monorepo package discovery). Apply Step 1 within that budget — run the signal-sweep categories selectively, not as a full parallel sweep, and prefer focused grep over broad listing when you already know what you are looking for.

## Step 1 — Signal sweep (no deep reading)

Gather raw signals about the project without reading every file. Outside an intake-restricted context (see above), run these checks in parallel; inside one, apply only the budget the phase allows.

- Package manifests: package.json, go.mod, Cargo.toml, pyproject.toml, pom.xml, build.gradle, Gemfile, composer.json, mix.exs, pubspec.yaml.
- Framework fingerprints: next.config.*, nuxt.config.*, angular.json, vite.config.*, django settings, flask app factory, fastapi main, rails config.
- Entry points: main.*, index.*, app.*, server.*, cmd/, src/main/.
- Directory snapshot: top 2 levels of the tree, ignoring node_modules, vendor, .git, dist, build, __pycache__.
- Config and tooling: linter configs, tsconfig.json, Makefile, Dockerfile, docker-compose*, CI configs, .env.example.
- Test structure: tests/, test/, __tests__/, *_test.go, *.spec.ts, *.test.js, pytest.ini, jest.config.*, vitest.config.*.

From the signals, identify: languages and version constraints; frameworks and major libraries; databases and ORMs; build tools and CI platform; the architecture shape (monolith, monorepo, microservices, or serverless; API style: REST, GraphQL, gRPC, tRPC); and the purpose of each top-level directory.

## Step 2 — Trace execution

- Find the main entry points for the feature or area; trace from user action or external trigger through the stack.
- Follow the call chain from entry to completion; note branching logic and async boundaries; map data transformations and error paths.
- Trace one request from entry to response: where does it enter (router, handler, controller); how is it validated (middleware, schemas, guards); where is business logic (services, models, use cases); how does it reach the database (ORM, raw queries, repositories).
- Identify which layers the code touches and how those layers communicate; note reusable boundaries and anti-patterns.

## Step 3 — Conventions and dependencies

- Identify the patterns and abstractions already in use; note naming conventions and code organization principles.
- Detect code patterns: error handling style (try/catch, Result types, error codes); dependency injection or direct imports; state management approach; async patterns.
- Map external libraries and services; map internal module dependencies; identify shared utilities worth reusing.
- Detect git conventions from recent history (branch naming, commit message style). If the repo has no commits or only a shallow history, note "Git history unavailable or too shallow to detect conventions" instead of guessing.

## Sampling strategy for large scopes

A 50-file module cannot be fully read in one session. Use this progressive strategy:

- **Sample**: read the entry files first — routers, controllers, service facades, public API surfaces. These typically contain ~70% of behavioral assertions.
- **Expand**: for each behavior found in the sample, trace one level down its call chain to verify it. Stop when: the call chain reaches an external boundary (DB query, HTTP call, message queue); three consecutive expanded files yield no new findings; or you have read ~15 files for this capability.
- **Defer**: if files remain unread, list them explicitly as deferred — never imply they were covered.

## Rules

- Don't read everything — reconnaissance uses glob and grep, not open-every-file. Read selectively only for ambiguous signals.
- Verify, don't guess — if a framework is detected from config but the actual code uses something different, trust the code.
- Recon is production-first: do not inherit someone else's plan or summary of the code — build the inventory from source.
- Flag unknowns — if something can't be confidently detected, say so rather than guessing. "Could not determine test runner" is better than a wrong answer.

## Red Flags

- Reading every file in a large module instead of sample-and-expand — wastes tokens and hits context limits.
- Listing every dependency — highlight only the ones that shape how code is written.
- Describing obvious directory names — src/ doesn't need an explanation.
- Copying the README — recon adds structural insight the README lacks.
- Claiming or implying coverage of files that were never opened.

## Completion Condition

Recon is complete when entry points, at least one traced execution path, layer boundaries, active conventions, and load-bearing dependencies are identified from the source itself — and everything not examined is explicitly flagged as unknown or deferred.
