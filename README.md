# QA Intel

QA Intel (`@qutecoder/qa-intel`) is a portable QA intelligence layer for agentic engineering. It turns human- or LLM-authored acceptance flows into structured contracts that another agent, CI job, or test harness can execute, validate, inspect, and reason about.

The aim is not only to run Playwright. The project gives agents a shared validation surface:

- strict Gherkin input that compiles to `suite.json`
- semantic locators instead of brittle raw selectors
- JSON-only command output for agent-to-agent handoff
- browser execution with UI, API, network, trace, console, screenshot, and DOM diagnostics
- failure summaries and fix hints that point toward frontend, backend, or test issues
- optional SQLite persistence so an agent can query prior runs and dig deeper

## Why It Exists

Modern coding agents can generate code quickly, but they need a reliable way to check whether a user journey still behaves correctly. QA Intel provides that feedback loop in a format agents can consume without scraping terminal output.

One agent can generate or update a `.feature` file. Another can compile and run it. A third can inspect JSON, screenshots, console logs, network calls, trace IDs, and SQLite history before deciding whether the issue is UI, API, business logic, or the test itself.

## How It Works

```text
Gherkin feature
  -> strict compiler
  -> suite.json with structured locators
  -> Playwright browser/API execution
  -> JSON result + screenshots + network/console logs
  -> optional SQLite history for later investigation
```

The core idea is semantic-first targeting:

```gherkin
When I type "maac@example.com" into the field "Email"
And I click the button "Log in"
Then I should see the heading "Dashboard"
```

When a UI has no stable semantic target, use an explicit escape hatch:

```gherkin
When I click testid:login-submit
When I click css:[data-state='ready']
```

## Agent-Facing Guarantees

The CLI is designed for machine consumption:

- stdout is JSON, with no ANSI formatting
- failures are structured by layer: `ui`, `api`, or `business`
- runs include stable `runId` and `traceId` values
- step results include status, duration, target references, screenshots, and typed failure details
- assertion results include expected/actual data where available
- non-fatal persistence warnings go to stderr instead of corrupting JSON stdout

The package also exports tool-style functions for agent workflows:

```ts
import {
  runSuiteTool,
  executeContractTool,
  executeStepTool,
  validateUIAssertionTool,
  validateAPIResponseTool,
  getStepArtifactsTool,
  ResultStore,
} from "@qutecoder/qa-intel";
```

These functions return `{ ok, data, error }` shapes so agents can pass validation results to each other without needing to infer state from prose.

## Usage

Install from npm:

```bash
npm install -D @qutecoder/qa-intel
```

Compile a feature file:

```bash
npx qa-runner compile examples/login.feature --base-url http://localhost:3002
```

Run a compiled suite:

```bash
npx qa-runner run .qa-results/compile/suite.json --base-url http://localhost:3002
```

Compile and run in one command:

```bash
npx qa-runner examples/login.feature --base-url http://localhost:3002
```

Useful flags:

| Flag | Description |
|------|-------------|
| `--base-url <url>` | Base URL for relative navigation and API requests |
| `--headed` | Show the browser |
| `--browser-executable-path <path>` | Launch a specific Chromium-compatible browser executable |
| `--browser-channel <channel>` | Launch a Playwright Chromium channel such as `chrome` or `msedge` |
| `--fail-fast` | Stop after the first failing contract |
| `--artifact-dir <dir>` | Screenshot/artifact output directory |
| `--results-db <path>` | SQLite results database path, default `.qa-results/results.db` |
| `--auto-heal` | Enable experimental LLM locator healing |

Browser selection precedence is: explicit executable path, explicit channel, `QA_INTEL_BROWSER_EXECUTABLE_PATH`, `QA_INTEL_BROWSER_CHANNEL`, then bundled Playwright Chromium.

## Gherkin Syntax

UI steps:

```gherkin
Given I navigate to "/login"
When I click the button "Log in"
When I type "secret" into the field "Password"
When I select "Admin" in the field "Role"
When I wait for the heading "Dashboard"
```

UI assertions:

```gherkin
Then I should see the heading "Dashboard"
Then I should not see the alert "Invalid credentials"
Then the text "Welcome back" should exist
Then the heading "Dashboard" should contain text "Dash"
```

API steps and assertions:

```gherkin
When I POST "/api/auth/login" with body '{"email":"a@b.com","password":"secret"}'
Then the API response to "/api/auth/login" should have status 200
Then the API response to "/api/auth/login" field "user.email" should equal "a@b.com"
Then requests to "/api/auth/login" should include trace ID
```

## Locator Model

Compiled suites use structured locators:

```ts
type LocatorSpec =
  | { strategy: "role"; role: string; name: string }
  | { strategy: "label"; name: string }
  | { strategy: "placeholder"; text: string }
  | { strategy: "text"; text: string }
  | { strategy: "testid"; id: string }
  | { strategy: "css"; selector: string };
```

The runtime resolves those through Playwright:

| Strategy | Playwright call |
|----------|-----------------|
| `role` | `page.getByRole(role, { name })` |
| `label` | `page.getByLabel(name, { exact: true })` |
| `placeholder` | `page.getByPlaceholder(text)` |
| `text` | `page.getByText(text)` |
| `testid` | `page.getByTestId(id)` |
| `css` | `page.locator(selector)` |

## Output And Diagnostics

All CLI output is JSON. A passing run looks like:

```json
{
  "ok": true,
  "data": {
    "runId": "uuid",
    "traceId": "uuid",
    "status": "passed",
    "summary": {
      "totalContracts": 1,
      "passed": 1,
      "failed": 0
    },
    "contracts": []
  }
}
```

Failures include step/assertion context, screenshot paths, layer classification, and fix hints. During execution, QA Intel captures browser console messages, uncaught page errors, filtered network traffic, request/response bodies when available, and trace headers for API assertions.

Failed semantic locators include additive diagnostics:

```json
{
  "selector": "heading \"Dashboard\"",
  "found": false,
  "matchedCount": 0,
  "visibleCount": 0,
  "nearestMatches": [
    {
      "kind": "text",
      "text": "Dashboard",
      "score": 1,
      "reason": "Visible text matches \"Dashboard\", but it is exposed as text, not heading."
    }
  ],
  "guidance": [
    "Target text exists but not as heading. Fix the accessible HTML so it exposes heading semantics, or change the contract target kind to text."
  ]
}
```

## SQLite Investigation

CLI runs persist history to `.qa-results/results.db` by default. Pass `--results-db <path>` to choose another database:

```bash
npx qa-runner examples/login.feature \
  --base-url http://localhost:3002 \
  --results-db .qa-results/results.db
```

The SQLite store is intended for agents that need to ask follow-up questions after a run:

- What was the latest failed run?
- Which step failed first?
- What network calls happened around a failing assertion?
- What console or page errors appeared during a step?
- Did a previous run fail in the same layer with the same target?

Programmatic access is available through `ResultStore`:

```ts
import { ResultStore } from "@qutecoder/qa-intel";

const store = new ResultStore(".qa-results/results.db");
const latest = store.getLatestRun();

if (latest) {
  const network = store.getRunNetworkLogs(latest.runId);
  const consoleLogs = store.getRunConsoleLogs(latest.runId);
}

store.close();
```

The database uses normalized tables for runs, contracts, steps, assertions, network logs, network headers, and console logs, so agents can also query it directly with SQL.

## Auto-Healing

Auto-healing is experimental and disabled by default. Enable it with `--auto-heal` and configure an `OPENAI_API_KEY`.

When a locator-based action fails after normal retries, the healer receives the failed structured locator, accessibility tree, screenshot, and error message. It must return a validated `LocatorSpec`; invalid suggestions are dropped and the original deterministic failure is preserved.

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/agent-workflows.md](docs/agent-workflows.md) | Agent-to-agent validation loops and SQLite investigation |
| [docs/using-in-real-projects.md](docs/using-in-real-projects.md) | How teams use the package in apps, CI, and agent workflows |
| [docs/cli.md](docs/cli.md) | CLI commands, flags, JSON output, and exit codes |
| [docs/gherkin.md](docs/gherkin.md) | Supported strict Gherkin syntax |
| [docs/dsl.md](docs/dsl.md) | Compiled `suite.json` and `LocatorSpec` reference |
| [docs/configuration.md](docs/configuration.md) | CLI, environment, programmatic, artifact, and SQLite configuration |

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, docs expectations, and release notes. Please also read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md) before reporting sensitive issues.

## License

Licensed under the [Apache License 2.0](LICENSE). This keeps the project permissive for commercial and internal use while preserving attribution and Apache-2.0's patent grant/termination terms.

## Development

```bash
yarn install
yarn build
yarn typecheck
yarn test
yarn run:example
```

## Keywords

`qa-intel`, `qa`, `quality-assurance`, `testing`, `test-automation`, `test-runner`, `automation`, `playwright`, `browser-automation`, `ui-testing`, `api-testing`, `gherkin`, `gherkin-tests`, `cucumber`, `bdd`, `bdd-testing`, `e2e`, `end-to-end`, `acceptance-tests`, `acceptance-testing`, `ai`, `ai-agents`, `agentic`, `agentic-testing`, `llm`, `llm-testing`, `validation`, `test-diagnostics`, `structured-output`, `sqlite`, `ci`, `cli`
