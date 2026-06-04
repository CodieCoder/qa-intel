# Changelog

All notable changes to QA Agent will be documented here.

This project follows semantic versioning once it leaves the initial `0.x` phase. While the package is `0.x`, minor versions may still include breaking changes, and breaking behavior should be called out clearly in this file.

## 0.0.1 - 2026-06-04

Documentation and package polish for the public project.

- added contributor setup and release guidance
- added practical real-project usage guidance for app, CI, and agent workflows
- added changelog, security policy, and code of conduct
- included public project docs in future npm package contents
- verified the published CLI binary metadata

## 0.0.0 - 2026-06-04

Initial public release as `@qutecoder/qa-intel`.

- strict Gherkin compiler for semantic QA flows
- `qa-runner` CLI for compile, run, and compile-and-run workflows
- Playwright execution for UI and API validation
- JSON-only output for agent-to-agent handoff
- screenshot, console, network, trace, and failure diagnostics
- SQLite result persistence through `ResultStore`
- experimental locator auto-healing hooks
- Apache-2.0 license
