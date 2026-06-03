# CLI Runner

The CLI executes strict Gherkin features or compiled `suite.json` files and prints JSON to stdout.

## Usage

```bash
# Compile Gherkin to suite.json
qa-runner compile <feature-file> [flags]

# Run compiled suite JSON
qa-runner run <suite.json> [flags]

# Compile and run directly
qa-runner <feature-file> [flags]
```

`contracts.json` is no longer generated or accepted.

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--base-url <url>` | `http://localhost:3002` for compile/direct run; suite value for `run` | Base URL for relative navigation/API calls |
| `--headed` | `false` | Show the browser |
| `--fail-fast` | `false` | Stop after first failed contract |
| `--artifact-dir <dir>` | `.qa-results/artifacts` | Screenshot/artifact directory |
| `--results-db <path>` | `.qa-results/results.db` | SQLite persistence path |
| `--auto-heal` | `false` | Enable experimental LLM locator healing |
| `--name <name>` | filename-derived | Compile-only suite name |
| `--out-dir <dir>` | `.qa-results/compile` | Compile-only output directory |

## Examples

```bash
qa-runner compile examples/login.feature --base-url http://localhost:3002
qa-runner run .qa-results/compile/suite.json --base-url http://localhost:3002
qa-runner examples/login.feature --base-url http://localhost:3002 --headed
```

## Output

All output is JSON:

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
