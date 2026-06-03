# CLI Runner

The CLI runner (`src/cli.ts`) executes test suites and outputs structured JSON. Designed for agent-to-agent consumption — no ANSI formatting, no interactive commands.

## Usage

```bash
# Run from JSON files
qa-runner <suite.json> <contracts.json> [flags]

# Run directly from Gherkin
qa-runner <feature-file> <contracts.json> [flags]

# Compile Gherkin to JSON (without running)
qa-runner compile <feature-file> [flags]
```

## Run Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--base-url <url>` | `string` | From suite.json | Override the suite's base URL |
| `--headed` | `boolean` | `false` | Show browser window (for debugging) |
| `--fail-fast` | `boolean` | `false` | Stop on first contract failure |
| `--artifact-dir <dir>` | `string` | `.qa-results/artifacts` | Directory for screenshot PNG files |
| `--results-db <path>` | `string` | `.qa-results/results.db` | SQLite DB path for persistent results (13 normalized tables) |

## Compile Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--name <name>` | `string` | Derived from filename | Suite name |
| `--base-url <url>` | `string` | `http://localhost:3002` | Base URL |
| `--out-dir <dir>` | `string` | `.` | Output directory for suite.json + contracts.json |

## Output Format

All output is JSON to stdout.

### Run Output

```json
{
  "ok": true,
  "data": {
    "runId": "uuid",
    "traceId": "uuid",
    "status": "passed" | "failed",
    "summary": {
      "totalContracts": 3,
      "passed": 2,
      "failed": 1
    },
    "contracts": [
      {
        "intent": "login_with_valid_credentials",
        "status": "passed" | "failed" | "error",
        "durationMs": 1200,
        "steps": [
          {
            "stepId": "trace-c0-step-0",
            "type": "navigate",
            "status": "passed",
            "durationMs": 500,
            "targetRef": "login-form",
            "selector": "[data-testid=login-form]",
            "value": "admin@test.com",
            "artifacts": {
              "beforeScreenshot": ".qa-results/artifacts/trace-c0/step-0-before.png",
              "afterScreenshot": ".qa-results/artifacts/trace-c0/step-0-after.png",
              "domSnapshot": "<html>...</html>"
            }
          }
        ],
        "assertions": [...],
        "failure": {
          "layer": "ui" | "api" | "business",
          "rootCause": "element not found",
          "causedByStep": "trace-c0-step-2"
        },
        "failures": [
          {
            "intent": "login_with_valid_credentials",
            "layer": "ui",
            "issue": "element not found within 5000ms",
            "fixHints": [
              { "type": "frontend", "suggestion": "Add data-testid=\"dashboard-container\"" }
            ]
          }
        ]
      }
    ],
    "failures": [...]
  }
}
```

### Compile Output

```json
{
  "ok": true,
  "suite": "tests/suite.json",
  "contracts": "tests/contracts.json",
  "stats": {
    "contracts": 3,
    "targets": 12,
    "errors": 0
  }
}
```

### Error Output

```json
{
  "ok": false,
  "error": "description of what went wrong"
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed |
| `2` | Fatal error (bad input, crash) |

## Screenshots

Every step writes before/after PNG screenshots to the artifact directory (default `.qa-results/artifacts/`). File paths are included in the JSON output under `steps[].artifacts.beforeScreenshot` and `steps[].artifacts.afterScreenshot`.

A final page screenshot is also captured at `.qa-results/artifacts/{traceId}/final.png`.

## Step Execution Context

Each step in the output includes the execution context that was used:

| Field | Description |
|-------|-------------|
| `targetRef` | The logical target name from the contract (e.g. `login-submit`) |
| `selector` | The resolved CSS selector (e.g. `[data-testid=login-submit]`) |
| `value` | The input value for type/select steps (e.g. `admin@test.com`) |
| `artifacts.domSnapshot` | Full DOM snapshot captured on failure (`page.content()`) |

## Diagnostic Data (SQLite only)

The following data is captured during execution and persisted to the SQLite database (`.qa-results/results.db`) but is **not** included in the JSON stdout output:

- **Network logs**: Full HTTP request/response traffic per contract (method, url, status, headers, bodies)
- **Console logs**: Browser console output per step (`console.log`, `console.error`, `console.warn`, etc.)
- **JS errors**: Uncaught JavaScript exceptions (`pageerror` level in `console_logs` table)

Query these from the DB for post-hoc debugging. See the README for the `ResultStore` API.
