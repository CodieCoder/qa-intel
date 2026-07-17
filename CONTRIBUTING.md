# Contributing

Thanks for helping improve QA Intel. The project is public, Apache-2.0 licensed, and aimed at making QA evidence easier for humans, CI, and coding agents to share.

## Good First Contributions

Useful contribution areas:

- Gherkin grammar examples and clearer compiler errors
- semantic locator coverage and documentation
- Playwright runtime diagnostics, screenshots, console logs, and network traces
- SQLite result-store queries and agent investigation helpers
- package ergonomics, CLI output, and CI examples
- docs that explain real agentic QA workflows without marketing fluff

## Development Setup

```bash
npm install
npm run build
npm test
npm run run:example
```

The runtime tests start local HTTP servers and browsers. If they fail with a localhost permission error in a restricted environment, rerun them in a normal shell.

## Project Shape

- `src/cli.ts` contains the `qa-runner` CLI.
- `src/modules/dsl/` owns strict compiled schemas and assembles Gherkin into `suite.json`.
- `src/modules/capabilities/` contains the internal built-in registry, parser order, validation metadata, and execution dispatch.
- `src/modules/results/` owns public result schemas and pure result mappers.
- `src/modules/tools/` owns tool transport schemas; `src/modules/types/` is a compatibility facade.
- `src/modules/engine/` runs compiled suites through injected internal services, Playwright, and tool-style APIs.
- `src/modules/store/` persists run history and diagnostics to SQLite.
- `docs/` contains user-facing references and workflow guides.
- `tests/` contains compiler, runtime, package, generator, and result-store tests.

## Contribution Workflow

1. Open an issue or discussion for larger behavior changes.
2. Resolve decisions that materially affect scope, behavior, APIs, persistence, security, or compatibility.
3. Keep pull requests focused on one concern.
4. Start behavioral changes with a focused failing test and observe the expected failure.
5. Make the smallest implementation pass, then refactor with focused tests green.
6. Update docs when user-facing commands, Gherkin syntax, output shapes, or configuration change.
7. Run `npm test` before submitting.

See `docs/testing.md` for the red-green-refactor workflow, exceptions, test layers, and completion criteria. Read `docs/extensibility.md` before changing schemas, runtime boundaries, result domains, artifacts, persistence, or public APIs.

The failing-test requirement does not apply to documentation-only changes, generated files, behavior-preserving mechanical refactors, or characterization tests that only capture current behavior. Shared-seam refactors still require characterization coverage before they begin. The capability registry and injected service entry points are internal; do not export them from the package root without an approved public API design.

For docs-only changes, run at least:

```bash
npm run build
node --test tests/documentation-contract.test.mjs tests/package-smoke.test.mjs
```

## Generated Documentation

The element-kind vocabulary is generated from source comments. After changing `src/modules/dsl/element-kinds.ts`, run:

```bash
npm run generate:element-kinds
```

## API And Output Compatibility

The CLI is intentionally JSON-only on stdout. Avoid adding human-formatted logs, ANSI output, or progress text to stdout. Non-fatal warnings should go to stderr so agents can parse the JSON result safely.

When changing public result shapes, prefer additive fields over breaking renames. If a breaking change is necessary, document it in `CHANGELOG.md`.

## Release Notes

This package is published as `@qutecoder/qa-intel`. Do not hand-edit version fields in `package.json` or `package-lock.json`; use the bump scripts so both files stay in sync:

```bash
npm run bump:patch
# or: npm run bump:minor
# or: npm run bump:major
# or: npm run bump:prerelease
```

After the bump, update `CHANGELOG.md`, run the release checks, and publish with public access:

```bash
npm run release:check
npm run release:publish
```

`release:publish` checks `npm whoami` before publishing. If it returns `E401`, run `npm login` with the account that owns or has publish access to the `@qutecoder` scope. If authentication succeeds but publish still returns `E404`, the logged-in npm account does not have access to publish `@qutecoder/qa-intel`.
