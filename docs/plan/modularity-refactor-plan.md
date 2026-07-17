# Compatibility-Preserving Modularity Refactor

Status: Complete
Created: 2026-07-13
Current phase: Complete
Last validated: 2026-07-13 (109/109 tests)

## Outcome

Refactor QA Intel into explicit contract, orchestration, service, and capability boundaries without changing accepted v1 Gherkin, compiled suites, public package exports, CLI JSON, artifact behavior, or SQLite history.

The completed implementation establishes one canonical owner for every current schema and type shape, internal dependency injection, and a strict built-in capability registry behind the existing public API.

## Decisions

These decisions follow the compatibility and modular direction already established in `docs/testing.md` and `docs/extensibility.md`:

- This is an internal, compatibility-preserving refactor. Observable behavior changes require a separate approved plan and a red test.
- Existing unversioned v1 suite and run-result fixtures remain valid and are never silently regenerated.
- Root package export names and existing tool-function signatures remain available.
- Existing legacy aliases remain available. Their removal is not part of this plan.
- Canonicalization does not mean tightening validation. Currently distinct schemas remain distinct when they accept different inputs, even if their names overlap.
- `src/modules/dsl/schema.ts` remains the canonical owner of compiled locator, step, assertion, contract, and suite shapes.
- Public result schemas move to a dedicated result-contract owner. Tool I/O schemas move to a dedicated tool-contract owner. `src/modules/types/index.ts` becomes a compatibility facade.
- The internal assertion-engine evaluation result is not the public assertion result. It moves to the assertion domain while its existing aliases remain exported.
- The capability registry is internal. This plan does not publish a plugin API or add a package subpath export.
- The SQLite schema, schema version, migrations, retention, artifact paths, and CLI flags do not change in this refactor.
- Default behavior requires no consumer configuration. Injected services always have production defaults.
- No generic arbitrary-code, shell, or SQL capability is introduced.

## Baseline Evidence Before Implementation

The refactor was needed because shared seams had mixed ownership:

- `src/modules/dsl/schema.ts` correctly owns strict compiled DSL schemas.
- `src/modules/types/index.ts` mixes failures, results, configuration, and every tool's transport schema.
- `StepSchema` and `StepInputSchema` look equivalent but are not: the tool input schema currently accepts partial step shapes that the strict DSL rejects.
- `AssertionResultSchema` names two different contracts: an internal assertion-engine evaluation and the public UI/API result union.
- `RunSuiteInputSchema.suite` and `ExecuteContractInputSchema.contract` currently use `z.any()`, while runtime validation happens later or only shallowly.
- `executeContractTool` creates concrete engines and artifact storage directly; `runSuiteTool` creates loggers and persistence directly.
- Step and assertion dispatch are closed switches, while Gherkin parsing is centralized in one ordered compiler.
- `EngineManager` and the API-contract lookup use process-global mutable maps.
- The package root explicitly re-exports schemas, types, engines, stores, and tool functions, so internal movement must preserve the root surface.

These differences are characterization targets, not invitations to change behavior during extraction.

## Implemented Boundaries

```text
strict Gherkin
  -> compiler using ordered built-in capability definitions
  -> canonical DSL schemas
  -> orchestration with injected internal services
  -> step/assertion handlers with narrow runtime contexts
  -> canonical public result mapping
  -> artifacts and optional SQLite persistence
  -> unchanged public tool and CLI facades
```

Implemented ownership:

| Concern | Canonical owner | Compatibility surface |
|---|---|---|
| Locators, steps, assertions, contracts, suites | `src/modules/dsl/schema.ts` | DSL barrel and package root |
| Internal assertion evaluation | `src/modules/assertions/results.ts` | existing `DslAssertionResult*` aliases |
| Public failures and run results | `src/modules/results/schema.ts` | `src/modules/types/index.ts` and package root |
| Tool errors, configuration, inputs, and outputs | `src/modules/tools/schema.ts` | `src/modules/types/index.ts` and package root |
| Mapping internal events to public results | `src/modules/results/mappers.ts` | internal only |
| Runtime service contracts and defaults | `src/modules/engine/runtime-services.ts` | internal only |
| Capability definitions and lookup | `src/modules/capabilities/` | internal only |
| CLI and exported tool functions | existing files | unchanged public facade |

Each schema has one implementation owner. Compatibility files re-export the same schema objects and inferred types rather than cloning definitions.

## Phase 0 — Foundation

Status: Complete

- [x] Establish material-decision planning rules.
- [x] Establish red-green-refactor policy and exceptions.
- [x] Document compatibility and isolation invariants.
- [x] Add v1 Gherkin, suite, and run-result fixtures.
- [x] Add documentation governance and package smoke coverage.
- [x] Record a green 82-test baseline before runtime refactoring.

## Phase 1 — Canonical Schema Ownership

Status: Complete

Goal: assign one owner to each current schema without changing parsing, inferred public types, or exports.

### 1A. Characterize the shared seam

- [x] Add `tests/schema-contract.test.mjs` and import the public package root.
- [x] Assert the required runtime schema exports and legacy aliases remain present.
- [x] Exercise representative accepted and rejected values for locator, step, assertion, suite, result, configuration, and tool I/O schemas.
- [x] Explicitly characterize intentional differences between strict DSL schemas and transport schemas, including `StepSchema` versus `StepInputSchema`.
- [x] Characterize the current `z.any()` tool boundaries so extraction does not accidentally tighten them.
- [x] Assert v1 fixtures still parse and compiled Gherkin remains byte-for-structure equivalent.
- [x] Add a TypeScript public-API fixture compiled with `tsc --noEmit` to protect exported type names and tool signatures.
- [x] Run the focused schema and compatibility tests before moving production definitions.

This is characterization coverage for an existing seam, so a failing red test is not required. Any desired validation change discovered here becomes separate behavioral work and starts with a failing test.

### 1B. Extract canonical owners mechanically

- [x] Add `src/modules/results/schema.ts` for the existing public failure, step-result, assertion-result, contract-result, and run-result definitions.
- [x] Add `src/modules/tools/schema.ts` for the existing tool error, suite configuration, tool input, and tool output definitions.
- [x] Move the internal assertion evaluation schema from the DSL result file to `src/modules/assertions/results.ts`.
- [x] Convert `src/modules/types/index.ts` into a compatibility barrel that re-exports the canonical result and tool schemas.
- [x] Keep `src/modules/dsl/schema.ts` authoritative for compiled DSL shapes.
- [x] Keep `src/modules/dsl/results.ts` only if needed as an internal compatibility re-export during the transition.
- [x] Preserve root export names and the explicit `DslAssertionResultSchema` and `DslAssertionResult` aliases in `src/index.ts`.
- [x] Update internal imports to canonical owners only after compatibility re-exports are green.
- [x] Remove duplicated schema bodies only after equivalence tests pass.

### 1C. Validate the slice

- [x] Run `npm run build`.
- [x] Run `node --test tests/schema-contract.test.mjs tests/compatibility-contract.test.mjs tests/package-smoke.test.mjs`.
- [x] Run `npm run check:fast`.
- [x] Run `npm test`.
- [x] Run `git diff --check` and the documentation link contract.
- [x] Update this plan's status and decision log with the observed red/green or characterization evidence.

Phase 1 is complete only when emitted declarations and root runtime exports remain compatible, not merely when internal imports compile.

## Phase 2 — Canonical Result Mapping

Status: Complete

Goal: make result construction explicit and typed before changing orchestration.

- [x] Add focused characterization for step-event, assertion-evaluation, contract-result, and run-result mapping.
- [x] Extract pure mappers into `src/modules/results/mappers.ts`.
- [x] Replace the local assertion result shape and `as any` cast in `executeContractTool` with canonical mapper inputs and outputs.
- [x] Keep failure layer classification, expected/actual encoding, diagnostic fields, counts, IDs, and artifact references unchanged.
- [x] Validate every produced contract and run result against the canonical schemas in tests.
- [x] Prove `ResultStore` round trips the same normalized data without a schema-version bump.
- [x] Update result documentation only if ownership or maintainer guidance changes; public JSON examples stay unchanged.

Focused gates:

```bash
node --test tests/schema-contract.test.mjs tests/compatibility-contract.test.mjs tests/result-store.test.mjs
```

## Phase 3 — Injected Runtime Services

Status: Complete

Goal: separate orchestration from browser, artifact, logging, identity, and persistence construction while preserving exported facades.

- [x] Characterize default service construction, cleanup ordering, non-fatal persistence warnings, and failure isolation.
- [x] Define narrow internal service factories in `src/modules/engine/runtime-services.ts` for logger, action engine, assertion engine, artifact storage, result store, IDs, and time.
- [x] Provide production defaults matching current behavior.
- [x] Extract internal orchestration functions that accept services.
- [x] Keep `runSuiteTool(input)` and `executeContractTool(input, logger?)` as compatibility wrappers with their current signatures.
- [x] Guarantee engine, browser, store, and artifact cleanup on success and failure.
- [x] Use fakes for browserless orchestration tests.
- [x] Leave `EngineManager`, API-contract registry functions, artifact naming, and persistence format unchanged until separately characterized.

This phase changes a shared runtime seam. Start with focused failing tests for any new injection behavior; treat the implementation movement itself as a covered mechanical refactor.

## Phase 4 — Strict Internal Capability Registry

Status: Complete

Goal: introduce registry primitives without migrating behavior or exposing a plugin API.

- [x] Define an internal `CapabilityDefinition` with a unique identifier, kind, canonical input schema, ordered parser metadata, execution handler, result domain, failure classification metadata, declared artifacts, and optional dependency keys.
- [x] Define narrow step and assertion runtime contexts; do not pass global process state.
- [x] Reject duplicate identifiers and discriminators deterministically.
- [x] Detect parser collisions and preserve explicit ordering.
- [x] Build an immutable default registry containing only built-in definitions.
- [x] Require typed opt-in for optional or experimental dependencies.
- [x] Add unit tests for lookup, ordering, duplicates, collisions, missing dependencies, and handler-local failures.
- [x] Keep the registry out of `src/index.ts` and `package.json` exports.

No compiler or engine behavior changes in this phase; it creates the tested internal seam.

## Phase 5 — Incremental Compiler Migration

Status: Complete

Goal: turn the Gherkin compiler into orchestration over registered built-ins while preserving exact strict syntax and precedence.

- [x] Expand compiler characterization so every supported step and assertion syntax has exact output coverage.
- [x] Preserve error line numbers, messages, legacy-target guidance, warnings, tags, descriptions, and scenario intent generation.
- [x] Migrate one low-risk parser first, then proceed capability by capability in current precedence order.
- [x] Keep suite assembly, scenario validation, and source metadata in the compiler orchestrator.
- [x] Run strict Gherkin and v1 fixture tests after each migrated capability.
- [x] Regenerate the element-kind table only if `src/modules/dsl/element-kinds.ts` changes.

Focused gates:

```bash
node --test tests/declarative-grammar.test.mjs tests/compatibility-contract.test.mjs tests/element-kinds.test.mjs
```

## Phase 6 — Incremental Execution Migration

Status: Complete

Goal: dispatch built-in steps and assertions through registered handlers with structured results and narrow contexts.

- [x] Characterize each action and assertion before moving its switch branch.
- [x] Migrate one handler at a time, beginning with a simple browser action and a pure network assertion.
- [x] Keep retries, timeouts, screenshots, DOM capture, locator diagnostics, console/network capture, and environment placeholder behavior unchanged.
- [x] Keep one failed capability local to its contract result and preserve fail-fast semantics at the suite level.
- [x] Preserve failure classification and fix-hint inputs.
- [x] Retain `ActionEngine` and `AssertionEngine` as public compatibility facades until a separately approved API change.
- [x] Remove old switch branches only after focused runtime tests pass through registry dispatch.

Focused gates:

```bash
node --test tests/action-engine-runtime.test.mjs tests/assertion-engine-runtime.test.mjs tests/auto-healing-runtime.test.mjs tests/compatibility-contract.test.mjs
```

## Phase 7 — State Isolation, Cleanup, And Documentation

Status: Complete

Goal: finish internal ownership cleanup and document the implemented architecture accurately.

- [x] Characterize `EngineManager` and API-contract registry lifecycle behavior.
- [x] Move process-global mutable state behind injected internal services while retaining public compatibility functions.
- [x] Remove obsolete internal `V2` terminology only where it cannot affect public exports or documentation contracts.
- [x] Remove temporary compatibility files that are not public and no longer imported.
- [x] Update `CONTRIBUTING.md`, `docs/extensibility.md`, README project shape, and the QA Intel skill to match implemented boundaries.
- [x] Do not describe the internal registry as a supported plugin API.
- [x] Search for stale module paths, duplicate schema definitions, outdated ownership comments, and broken links.
- [x] Run the complete validation matrix.

## Compatibility Matrix

Every phase must preserve:

| Surface | Required proof |
|---|---|
| Strict Gherkin | grammar tests and exact v1 compiled fixture |
| `suite.json` | `TestSuiteSchema` accepts the unversioned v1 fixture |
| Public run JSON | `RunResultSchema` accepts the v1 fixture; runtime mapping tests stay equal |
| Root JavaScript exports | package smoke and schema export manifest |
| TypeScript API | public compile fixture against emitted declarations |
| CLI stdout and exit codes | CLI runtime tests; stdout parses as one JSON value |
| stderr warnings | persistence failure characterization |
| Artifacts | runtime paths and artifact tests remain stable |
| SQLite | result-store round trips; no version bump without a separate decision |
| Browser behavior | focused action/assertion tests and integration suite |

## Change Discipline

Each implementation slice should be independently reviewable:

1. Update this plan to mark the slice in progress.
2. Add the narrowest characterization or failing test required by `docs/testing.md`.
3. Record the expected failure when the slice changes behavior.
4. Implement only the named boundary.
5. Run focused tests, then broader relevant tests.
6. Update affected documentation in the same slice.
7. Record results and decisions below before marking the slice complete.

Do not combine schema extraction, service injection, compiler migration, and execution migration in one change.

## Completion Criteria

The modularity refactor is complete when:

- every schema and inferred type has one canonical owner
- compatibility barrels contain re-exports rather than cloned definitions
- public result construction uses typed pure mappers with no `as any` bridge
- orchestration receives internal services with unchanged production defaults
- built-in compiler and execution behavior is registered and collision-checked
- capability failures remain isolated and structured
- root exports, strict Gherkin, JSON output, artifacts, and SQLite history remain compatible
- no provisional registry or plugin surface is public
- focused suites, `npm run check:fast`, and `npm test` pass
- documentation describes implemented behavior and ownership without stale paths

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-07-13 | Persist major plans under `docs/plan/` and update them during execution. | Keeps multi-slice work auditable across agent sessions. |
| 2026-07-13 | Begin with schema characterization and mechanical ownership extraction. | Schemas are the shared contract for compiler, runtime, results, persistence, and public exports. |
| 2026-07-13 | Preserve current schema acceptance rather than tightening similarly named shapes. | Tightening is observable and needs a separate compatibility decision and red test. |
| 2026-07-13 | Keep the registry internal and the public API unchanged. | Plugin lifecycle, versioning, and security are not yet designed as public contracts. |
| 2026-07-13 | Exclude SQLite and artifact migrations. | They are unnecessary for the modular boundary and would broaden compatibility risk. |

## Progress Log

| Date | Phase | Evidence | Result |
|---|---|---|---|
| 2026-07-13 | Phase 0 | Recorded foundation validation: 82/82 tests, skill validation, Markdown links, and `git diff --check`. | Complete |
| 2026-07-13 | Plan | Repository boundary and compatibility audit. | Phase 1 ready |
| 2026-07-13 | Plan validation | `npm run build`; documentation and package smoke tests: 5/5 passed; `git diff --check`. | Passed |
| 2026-07-13 | Phase 1 baseline | Unrestricted `npm test`: 82/82 passed. | In progress |
| 2026-07-13 | Phase 1 | Schema characterization: 11/11 focused tests; package smoke: 2/2; unrestricted `npm test`: 88/88. | Complete |
| 2026-07-13 | Phase 2 | Mapper red observed; 17/17 focused mapping/schema/compatibility/store tests; unrestricted `npm test`: 92/92. | Complete |
| 2026-07-13 | Phase 3 | Runtime-service red observed; 17/17 focused orchestration/compatibility tests; unrestricted `npm test`: 96/96. | Complete |
| 2026-07-13 | Phase 4 | Registry red observed; 18/18 focused registry/orchestration/compatibility tests; unrestricted `npm test`: 101/101. | Complete |
| 2026-07-13 | Phase 5 | Full grammar characterization: 19/19; compiler/registry focused gate: 32/32; unrestricted `npm test`: 102/102. | Complete |
| 2026-07-13 | Phase 6 | Registry-dispatch red observed; focused runtime gate: 20/20; unrestricted `npm test`: 103/103. | Complete |
| 2026-07-13 | Phase 7 | State-isolation characterization and red observed; isolated/public state and cleanup tests: 8/8; documentation/package gate: 5/5. | Complete |
| 2026-07-13 | Completion audit | Typecheck; `check:fast`: 2/2; focused matrix: 64/64; unrestricted `npm test`: 107/107; stale-path, Markdown-link, public-export, and `git diff --check` audits. | Passed |
| 2026-07-13 | Post-review cleanup fixes | Setup-factory cleanup and retryable session-close reds observed; targeted suites: 10/10; focused matrix: 45/45; unrestricted `npm test`: 109/109; typecheck, package, documentation, and `git diff --check` gates passed. | Passed |
