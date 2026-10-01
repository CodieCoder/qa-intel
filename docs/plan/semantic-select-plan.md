# Deterministic Semantic Select

Status: Complete
Created: 2026-10-01
Completed: 2026-10-01
Current phase: Verified

## Goal

Allow a `select` step to target a native option by its visible label while
preserving existing selection-by-value contracts and structured runtime
diagnostics.

## Compatibility Decision

- Existing `When I select "..." in ...` syntax remains valid and keeps the
  existing compiled shape. At runtime it uses deterministic `auto` matching.
- `auto` inspects the option list and succeeds only when the requested text
  identifies one option by exact value, exact visible label, or both on the
  same option.
- If value and label matches identify different options, or a visible label is
  duplicated, the step fails as ambiguous instead of choosing silently.
- Explicit human-readable forms are additive:
  - `When I select the option labeled "..." in ...`
  - `When I select the option with value "..." in ...`
- Explicit forms compile with an additive `match` field (`label` or `value`).
  Existing unversioned suites without `match` continue to parse and execute.
- Runtime environment placeholders are expanded before matching.
- Selection failures include structured details describing the requested
  text, match mode, available options, and value/label matches.

## Implementation Slices

- [x] Inspect the DSL, parser, action engine, and compatibility contract.
- [x] Record the additive compatibility decision.
- [x] Add focused compiler/schema/runtime tests.
- [x] Observe the focused tests fail for the missing capability.
- [x] Add the optional match mode to the canonical select schema and parser.
- [x] Implement deterministic native-option resolution and structured failure details.
- [x] Preserve action-timeout waiting for asynchronously populated options.
- [x] Update public documentation and changelog.
- [x] Run focused, compatibility, package, and full test suites.

## Validation

- Focused parser/schema/runtime: 25/25 passed.
- Compatibility/schema/documentation: 12/12 passed.
- Package smoke: 2/2 passed.
- Full repository suite: 114/114 passed.

## Decision Log

- 2026-10-01: Chose exact dual-mode matching for the natural syntax with
  fail-closed ambiguity handling. This preserves old value contracts while
  keeping new acceptance journeys readable.
- 2026-10-01: The focused pre-implementation run failed in the expected four
  places: explicit grammar, strict schema validation, missing/ambiguous
  diagnostics, and explicit collision resolution.
- 2026-10-01: Restored the missing tracked v1 `suite.json` compatibility
  fixture and corrected its ignore exception so a fresh checkout can run the
  complete suite.
- 2026-10-01: Added a regression test for delayed native options and replaced
  one-shot option inspection with timeout-bounded polling before selection.
- 2026-10-01: Kept packaged documentation and fixtures domain-neutral; external
  consumer acceptance evidence remains outside the repository plan.
