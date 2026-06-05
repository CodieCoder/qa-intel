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
```

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

Exit codes:

| Code | Meaning |
|------|---------|
| `0` | Suite ran and all contracts passed |
| `1` | Suite ran and at least one contract failed |
| `2` | CLI/tool execution failed before producing a run result |

Non-fatal SQLite persistence warnings are written to stderr so stdout remains parseable JSON.
