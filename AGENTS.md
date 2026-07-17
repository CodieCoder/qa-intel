# Agent Guide

QA Intel is a deterministic validation layer for agentic engineering. Keep agent work structured, parseable, and narrow.

## Fast Path

1. Read `skills/qa-intel/SKILL.md` first.
2. Use `README.md` only for the product overview and exported API surface.
3. Use `docs/gherkin.md` for supported strict Gherkin syntax.
4. Use `docs/cli.md` for commands, flags, JSON output, and exit codes.
5. Use `docs/agent-workflows.md` when investigating failures, artifacts, or SQLite history.
6. Use `docs/testing.md` for the mandatory TDD workflow.
7. Use `docs/extensibility.md` before changing schemas, runtime boundaries, results, persistence, or public APIs.

## Planning Rules

- Ask the user about unresolved material decisions that affect scope, behavior, public APIs, persistence, security, or compatibility.
- Resolve low-risk implementation details from repository evidence and established conventions.
- Persist major implementation plans under `docs/plan/` and keep their status and decision log current as work proceeds.
- Do not finalize a plan while a material decision remains unresolved.

## Test-First Development

- Start every behavioral production-code change with a focused failing test and observe the expected failure before implementation.
- Exempt documentation-only changes, generated files, behavior-preserving mechanical refactors, and characterization tests that capture existing behavior.
- Add characterization coverage before refactoring a shared seam.
- Run the narrowest relevant test during development, then run the broader relevant suite.
- Follow `docs/testing.md`; preserve the extension invariants in `docs/extensibility.md`.

## Rules

- Author `.feature` files with strict Gherkin.
- Prefer semantic targets: `button`, `field`, `heading`, `link`, `alert`, visible text.
- Use `testid:` only when semantic targets are unavailable.
- Use `css:` as the last resort.
- Treat CLI stdout as JSON. Do not scrape prose.
- Keep non-fatal warnings on stderr so JSON stdout stays parseable.
- Patch the smallest layer supported by the evidence: `ui`, `api`, `business`, or `test`.
- Rerun the narrowest relevant feature after a fix.

## Commands

```bash
npm run build
npm run check:fast
npm test
```

Run the local CLI from built source:

```bash
npm run build
node dist/cli.js examples/login.feature --base-url http://localhost:3002
```

After changing `src/modules/dsl/element-kinds.ts`, regenerate the Gherkin element-kind table:

```bash
npm run generate:element-kinds
```
