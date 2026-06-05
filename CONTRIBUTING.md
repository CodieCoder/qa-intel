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
```

The runtime tests start local HTTP servers and browsers. If they fail with a localhost permission error in a restricted environment, rerun them in a normal shell.

## Project Shape

- `src/cli.ts` contains the `qa-runner` CLI.
- `src/modules/dsl/` compiles strict Gherkin into `suite.json`.
- `src/modules/engine/` runs compiled suites through Playwright and tool-style APIs.
- `src/modules/store/` persists run history and diagnostics to SQLite.
- `docs/` contains user-facing references and workflow guides.
- `tests/` contains compiler, runtime, package, generator, and result-store tests.

## Contribution Workflow

1. Open an issue or discussion for larger behavior changes.
2. Keep pull requests focused on one concern.
3. Add or update tests for behavior changes.
4. Update docs when user-facing commands, Gherkin syntax, output shapes, or configuration change.
5. Run `npm test` before submitting.

For docs-only changes, run at least:

```bash
npm run build
node --test tests/package-smoke.test.mjs
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
