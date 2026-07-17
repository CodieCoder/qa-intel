# Extensibility

QA Intel is organized into DSL, execution, assertion, artifact, diagnostic, and persistence modules. These boundaries make extension possible, but the current step and assertion sets are closed: there is not yet a public capability-registration API.

This document defines the compatibility and isolation requirements for expanding the product without misrepresenting internal extension boundaries as a public plugin API.

## Non-Negotiable Invariants

Every capability must preserve these contracts:

- Gherkin remains strict, deterministic, and compile-time validated.
- Semantic locators remain preferred over `testid:` and `css:` fallbacks.
- CLI stdout remains one parseable JSON value with no ANSI or progress prose.
- Non-fatal warnings remain on stderr.
- Existing accepted suites and result shapes remain valid through additive changes.
- Failures and artifacts remain structured and trace-scoped.
- SQLite changes include an explicit compatibility and migration decision.
- Potentially dangerous system access is opt-in, constrained, and auditable.

Do not add generic arbitrary-code, arbitrary-shell, or unrestricted-SQL Gherkin steps. System capabilities should use typed inputs, allowlisted operations, explicit configuration, redaction, and deterministic outputs.

## Current Extension Path

Adding a step, assertion, locator, artifact, result domain, or configuration option currently requires a coordinated change across the applicable layers:

1. Define the canonical Zod schema and TypeScript type.
2. Add an internal built-in definition with a unique identifier, discriminator, parser precedence, result domain, failure layer, declared artifacts, and dependencies.
3. Add strict Gherkin parsing when the capability is authorable from `.feature` files.
4. Implement its registered step or assertion handler against a narrow runtime context.
5. Map structured results, failures, diagnostics, and artifacts through the result boundary.
6. Persist new data without losing existing run history.
7. Export public types only when they are intended package API.
8. Update reference docs and agent guidance.
9. Add focused registry, compiler, runtime, compatibility, integration, and persistence tests as applicable.

Follow [Testing And Test-First Development](testing.md). Capture current behavior with characterization tests before changing a shared seam.

## Isolation Requirements

A new capability should:

- own its validation and execution logic instead of expanding unrelated modules
- depend on a narrow runtime context rather than global state
- return structured results instead of writing directly to stdout
- emit artifacts through the artifact boundary rather than choosing storage paths itself
- keep optional dependencies outside unaffected execution paths
- fail within its own contract without corrupting other contract results
- preserve deterministic defaults and require explicit opt-in for experimental behavior

Specialized tools such as accessibility scanners, image comparators, load generators, security scanners, log providers, and database clients should be adapters. QA Intel should orchestrate them and normalize their evidence rather than reimplementing their engines.

## Implemented Internal Boundaries

QA Intel now uses a strict internal capability registry plus injected runtime services. These are implementation boundaries, not package exports or a supported consumer registration API.

The internal registry owns:

- unique capability identifiers
- Zod input validation
- ordered Gherkin parsing with collision detection
- step or assertion execution handlers
- result domain and failure classification metadata
- declared artifact types and optional dependencies

Canonical public run-result schemas live under `src/modules/results/`; tool transport schemas live under `src/modules/tools/`; the historical `src/modules/types/` module is a re-export-only compatibility facade. Strict compiled DSL schemas remain under `src/modules/dsl/`.

Runtime orchestration accepts internal defaulted factories for browser execution, assertions, artifacts, persistence, logging, IDs, and time. Engine sessions and API-contract lookup use isolated state services behind their existing public compatibility functions. Existing built-in behavior works without consumer configuration.

Before exposing any plugin API, define versioning, lifecycle, failure isolation, security boundaries, and compatibility tests. Do not publish a provisional registry as stable package API.

## Compatibility Review

Ask the user before finalizing changes that materially affect:

- supported Gherkin or its precedence
- public TypeScript or JSON interfaces
- CLI commands, flags, output, or exit codes
- artifact naming or retention
- database schemas or migration behavior
- security boundaries or access to external systems
- backward compatibility for stored or compiled contracts

Low-risk implementation details should follow repository conventions. Record approved breaking changes in `CHANGELOG.md` and provide migration guidance.
