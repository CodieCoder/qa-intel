# Agent Guide

QA Intel is a deterministic validation layer for agentic engineering. Keep agent work structured, parseable, and narrow.

## Fast Path

1. Read `skills/qa-intel/SKILL.md` first.
2. Use `README.md` only for the product overview and exported API surface.
3. Use `docs/gherkin.md` for supported strict Gherkin syntax.
4. Use `docs/cli.md` for commands, flags, JSON output, and exit codes.
5. Use `docs/agent-workflows.md` when investigating failures, artifacts, or SQLite history.

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
