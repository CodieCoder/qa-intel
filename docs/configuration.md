# Configuration

Configuration is done through CLI flags, environment variables, or the `RunSuiteInput` object when calling `runSuiteTool` programmatically.

## CLI Flags

See [CLI Runner](cli.md) for all command forms and flags.

Important defaults:

| Setting | CLI default |
|---------|-------------|
| Base URL | `http://localhost:${PORT}`; `PORT` defaults to `3002` |
| Artifact directory | `.qa-results/artifacts` |
| SQLite results DB | `.qa-results/results.db` |
| Browser mode | headless unless `--headed` is passed |
| Auto-healing | disabled unless `--auto-heal` is passed |

## Environment

`PORT` controls the CLI's default base URL when `--base-url` is not provided and the compiled suite does not already include `baseUrl`.

Auto-healing uses:

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Required when `--auto-heal` is enabled |
| `OPENAI_API_URL` | Optional override; defaults to `https://api.openai.com/v1/chat/completions` |

Runtime step values and request URLs can contain `{{ENV_VAR}}` placeholders. The action engine resolves those at run time from the process environment and the repo env cascade used by `runtime-env-placeholders.ts`.

## RunSuiteInput

Programmatic callers can pass a parsed `TestSuite`, a JSON string, or raw Gherkin text as `suite`.

```typescript
import { runSuiteTool } from "@qutecoder/qa-intel";

const result = await runSuiteTool({
  suite: suiteJSON,
  baseUrl: "http://localhost:3002",
  artifactDir: ".qa-results/artifacts",
  resultsDb: ".qa-results/results.db",
  config: {
    headless: true,
    failFast: false,
    timeoutMs: 10000,
    autoHeal: false,
  },
});
```

Unlike the CLI, `runSuiteTool` only persists to SQLite when `resultsDb` is supplied.

## SuiteConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `failFast` | `boolean` | `false` | Stop after the first non-passing contract |
| `timeoutMs` | `number` | engine default | Action timeout passed into `ActionEngine` |
| `autoHeal` | `boolean` | `false` | Enable experimental LLM locator healing |

## ActionEngine Config

Direct `ActionEngine` users can configure the lower-level engine:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baseUrl` | `string` | `undefined` | Prepended to relative navigation and request paths |
| `timeout` | `number` | `10000` | Default timeout for actions in milliseconds |
| `retries` | `number` | `2` | Number of retries for failed actions |
| `retryDelay` | `number` | `500` | Delay between retries in milliseconds |
| `screenshotOnFailure` | `boolean` | `true` | Capture screenshot on failure |
| `domOnFailure` | `boolean` | `true` | Capture DOM snapshot on failure |
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `slowMo` | `number` | `0` | Slow down actions for debugging |
| `viewport` | `{width, height}` | `1280x720` | Browser viewport dimensions |
| `autoHeal` | `boolean` | `false` | Enable experimental LLM locator healing |

## Assertion Timeout

`executeContractTool` creates an `AssertionEngine` with a 10 second timeout per assertion. The CLI does not currently expose a separate assertion-timeout flag.

## Artifact Storage

Screenshots are saved as PNG files to the artifact directory:

```text
{artifactDir}/{traceId}/step-{index}-before.png
{artifactDir}/{traceId}/step-{index}-after.png
{artifactDir}/{traceId}/final.png
```

Override the default with `--artifact-dir <dir>` on the CLI or `artifactDir` in `RunSuiteInput`.

## SQLite Persistence

CLI runs persist to `.qa-results/results.db` by default. Programmatic runs persist when `resultsDb` is provided.

The `ResultStore` keeps normalized rows for runs, contracts, steps, assertions, failures, fix hints, network logs, network headers, and console logs. It also uses schema versioning, WAL mode, a `busy_timeout`, and automatic retention pruning.
