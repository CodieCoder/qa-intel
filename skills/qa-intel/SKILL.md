---
name: qa-intel
description: "Use when an agent needs to work on QA Intel (@qutecoder/qa-intel): generating strict Gherkin validation features, compiling or running qa-runner suites, interpreting JSON and SQLite diagnostics, investigating Playwright UI/API failures, updating QA Intel docs/tests, or onboarding quickly in the QA Intel repository."
---

# QA Intel

## Start Here

Use QA Intel as a deterministic validation layer for agentic engineering. Prefer structured inputs and outputs at every step:

1. Author strict Gherkin `.feature` files.
2. Compile them to `suite.json`.
3. Run the suite with `qa-runner`.
4. Read JSON stdout, artifacts, and optional SQLite history.
5. Patch the app, API, fixtures, or test contract based on the failure layer.

If working in the QA Intel repository, read these files only as needed:

- `README.md` for the product overview and exported API surface.
- `docs/gherkin.md` for supported strict Gherkin syntax.
- `docs/cli.md` for commands, flags, JSON output, and exit codes.
- `docs/agent-workflows.md` for agent-to-agent handoff and SQLite investigation.
- `docs/dsl.md` for compiled `suite.json` and `LocatorSpec` details.
- `docs/configuration.md` for artifacts, environment, and persistence options.

## Repo Workflow

When editing QA Intel itself:

```bash
yarn build
yarn typecheck
yarn test
```

For a quick package smoke check:

```bash
yarn check:fast
```

Run the local CLI from built source:

```bash
yarn build
node dist/cli.js examples/login.feature --base-url http://localhost:3002
```

Keep agent guidance files outside `src`; they should not be compiled by TypeScript. In this repository, keep reusable agent instructions under `skills/qa-intel/` and do not add them to `package.json.files` unless the user explicitly wants the npm package to ship agent onboarding assets.

## Author Features

Write deterministic, parseable Gherkin. Prefer semantic targets over raw selectors:

```gherkin
Feature: Login

Scenario: Successful login
  Given I navigate to "/login"
  When I type "maac@example.com" into the field "Email"
  And I type "secret" into the field "Password"
  And I click the button "Log in"
  Then I should see the heading "Dashboard"
  And the url should contain "/dashboard"
```

Preferred locator phrases:

- `the button "Log in"`
- `the heading "Dashboard"`
- `the field "Email"`
- `the placeholder "Search"`
- `"Welcome"`

Use explicit fallbacks only when semantic targets are unavailable:

```gherkin
When I click testid:login-submit
When I click css:[data-state='ready']
```

Reject unsupported free-form steps such as:

```gherkin
When I click login-submit
Then I should see dashboard-container
```

## Run Validation

For installed package usage:

```bash
npx qa-runner compile path/to/flow.feature --base-url http://localhost:3002
npx qa-runner run .qa-results/compile/suite.json --base-url http://localhost:3002
npx qa-runner path/to/flow.feature --base-url http://localhost:3002
```

Important flags:

- `--base-url <url>` for relative navigation and API requests.
- `--headed` when visual inspection is useful.
- `--fail-fast` to stop at the first failed contract.
- `--artifact-dir <dir>` for screenshots and captured files.
- `--results-db <path>` for SQLite run history.
- `--auto-heal` only when the user accepts experimental locator healing and `OPENAI_API_KEY` is configured.

Treat stdout as JSON. Do not scrape terminal prose. Non-fatal persistence warnings should be on stderr.

## Investigate Failures

Use the structured result first:

- Check `ok`, `data.status`, `summary`, and failed contract entries.
- Inspect failed step/assertion details, `failure.layer`, `failure.rootCause`, and fix hints.
- Open screenshot/artifact paths when UI state matters.
- Compare console logs, page errors, network requests, response bodies, and trace IDs before choosing a patch.

Use SQLite when history or deeper correlation matters. CLI runs default to `.qa-results/results.db`.

Useful questions:

- What was the latest failed run?
- Which step failed first?
- Did the failure layer point to UI, API, business logic, or the test contract?
- Were there console/page errors around the failed step?
- Did relevant network calls return the expected status, body, headers, and trace ID?

## Patch Guidance

Patch the smallest layer that explains the evidence:

- `ui`: Fix accessible names, labels, roles, rendering, timing, or interaction state.
- `api`: Fix route behavior, status codes, response bodies, headers, auth, or trace propagation.
- `business`: Fix app logic, data setup, permissions, or workflow state.
- `test`: Fix the Gherkin only when the contract is unsupported, ambiguous, or no longer describes intended behavior.

After patching, rerun the narrowest relevant feature first, then run the repo test command that matches the changed surface.
