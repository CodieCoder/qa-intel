# Testing And Test-First Development

QA Intel uses test-driven development for behavioral changes. Tests are executable contracts for the strict DSL, runtime, JSON output, artifacts, persistence, and public package surface.

## Policy

Before changing production behavior:

1. Add the smallest test that expresses the intended behavior.
2. Run it and observe it fail for the expected reason.
3. Add only enough production code to make it pass.
4. Refactor while keeping the focused tests green.
5. Run the broader relevant suite before completion.

Do not weaken an assertion, replace a meaningful check with a snapshot, or update a compatibility fixture merely to make a test pass.

The failing-test requirement does not apply to:

- documentation-only changes
- generated files whose source and generation check are unchanged
- behavior-preserving mechanical refactors
- characterization tests added solely to capture existing behavior

Mechanical refactors must have relevant characterization coverage before they begin. If a refactor may change observable behavior, treat it as a behavioral change and start with a failing test.

## Planning Before Red

Resolve the intended behavior before writing the test. Ask the user about unresolved material decisions that affect scope, behavior, public APIs, persistence, security, or compatibility. Follow established repository conventions for low-risk implementation details.

For changes to public JSON, Gherkin, CLI behavior, exported APIs, or SQLite data, record the compatibility decision in the test and update the matching reference documentation in the same change.

## Test Layers

| Layer | Purpose | Typical files |
|------|---------|---------------|
| Unit | Pure schema, compiler, registry, mapper, locator, generator, and helper behavior | focused `*.test.mjs` files |
| Characterization | Preserve accepted v1 inputs and outputs before refactoring | `compatibility-contract.test.mjs`, `tests/fixtures/` |
| Runtime | Exercise registered browser actions, assertions, injected services, diagnostics, state isolation, and API behavior | action/assertion, registry-dispatch, runtime-service, and state-isolation tests |
| Integration | Validate compiler-to-runner and CLI flows | integration and CLI runtime tests |
| Persistence | Validate normalized SQLite round trips, concurrency settings, retention, and migrations | result-store tests |
| Package and docs | Protect exports, published files, documentation rules, and links | package/documentation contract tests |

Prefer the lowest layer that can prove the behavior. A parser change should begin with a compiler test, not a browser test. Add runtime or CLI coverage when the behavior crosses those boundaries.

## Commands

Build before running tests directly because the tests import compiled files from `dist`:

```bash
npm run build
```

Run the narrowest relevant test during the red-green-refactor loop:

```bash
node --test tests/declarative-grammar.test.mjs
node --test tests/compatibility-contract.test.mjs
node --test tests/capability-registry.test.mjs tests/registry-dispatch.test.mjs
node --test tests/documentation-contract.test.mjs
```

Then run the repository checks appropriate to the change:

```bash
npm run check:fast
npm test
```

Browser/runtime tests start localhost servers and Chromium. A restricted environment may require permission to bind localhost.

## Compatibility Fixtures

Fixtures under `tests/fixtures/v1/` preserve currently accepted unversioned suite and run-result shapes. Future versioning may add fields, but existing v1 fixtures must continue to parse unless a breaking change is explicitly approved, documented in `CHANGELOG.md`, and covered by migration guidance.

When a fixture fails:

- fix an accidental regression in the implementation; or
- obtain the required compatibility decision before intentionally changing the contract.

Never silently regenerate compatibility fixtures.

## Completion Criteria

A behavioral change is complete only when:

- the focused test was observed failing for the expected reason
- focused tests pass after the implementation
- existing compatibility contracts still pass
- public behavior and configuration documentation are updated
- `npm test` passes in an environment that supports the browser runtime
