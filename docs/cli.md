# CLI Runner

The CLI executes strict Gherkin features or compiled `suite.json` files and prints JSON to stdout. It is designed for agent-to-agent consumption: no ANSI output, no prose-only status, and stable result shapes.

## Usage

Install from npm:

```bash
npm install -D @qutecoder/qa-intel
```

```bash
# Compile Gherkin to suite.json
npx qa-runner compile <feature-file> [flags]

# Run compiled suite JSON
npx qa-runner run <suite.json> [flags]

# Compile and run directly
npx qa-runner <feature-file> [flags]
```

`contracts.json` is no longer generated or accepted.

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--base-url <url>` | `http://localhost:3002` from `PORT`, or suite value for `run` | Base URL for relative navigation/API calls |
| `--headed` | `false` | Show the browser |
| `--browser-executable-path <path>` | unset | Launch a specific Chromium-compatible browser executable |
| `--browser-channel <channel>` | unset | Launch a Playwright Chromium channel such as `chrome` or `msedge` |
| `--fail-fast` | `false` | Stop after first failed contract |
| `--artifact-dir <dir>` | `.qa-results/artifacts` | Screenshot/artifact directory |
| `--results-db <path>` | `.qa-results/results.db` | SQLite persistence path. CLI runs persist by default |
| `--auto-heal` | `false` | Enable experimental LLM locator healing |
| `--name <name>` | filename-derived | Compile-only suite name |
| `--out-dir <dir>` | `.qa-results/compile` | Compile-only output directory |

## Examples

```bash
npx qa-runner compile examples/login.feature --base-url http://localhost:3002
npx qa-runner run .qa-results/compile/suite.json --base-url http://localhost:3002
npx qa-runner examples/login.feature --base-url http://localhost:3002 --headed
npx qa-runner examples/login.feature --browser-executable-path /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
npx qa-runner examples/login.feature --browser-channel chrome
```

Browser selection precedence is deterministic: `--browser-executable-path`, `--browser-channel`, `QA_INTEL_BROWSER_EXECUTABLE_PATH`, `QA_INTEL_BROWSER_CHANNEL`, then bundled Playwright Chromium. Only the selected `executablePath` or `channel` option is passed to Playwright.

## Output

All stdout output is JSON:

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

Step and assertion diagnostics use human-readable locator descriptions such as `button "Log in"`, `field "Email"`, `testid:login-submit`, or `css:[data-state='ready']`.

Failed semantic locators can include additive diagnostics:

```json
{
  "selector": "button \"Savve\"",
  "found": false,
  "matchedCount": 0,
  "visibleCount": 0,
  "nearestMatches": [
    {
      "kind": "button",
      "text": "Save",
      "score": 0.85,
      "reason": "Closest visible button candidate."
    }
  ],
  "guidance": [
    "No visible button matched \"Savve\". Check the accessible role and name, or change the contract target kind if the UI intentionally uses different semantics."
  ]
}
```

Browser launch failures stay JSON-parseable and include `error.details` or contract `failure.details` with the attempted browser selection and setup hints.

Exit codes:

| Code | Meaning |
|------|---------|
| `0` | Suite ran and all contracts passed |
| `1` | Suite ran and at least one contract failed |
| `2` | CLI/tool execution failed before producing a run result |

Non-fatal SQLite persistence warnings are written to stderr so stdout remains parseable JSON.
