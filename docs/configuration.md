# Configuration

Configuration is done through CLI flags or the `RunSuiteInput` object when calling `runSuiteTool` programmatically. There are no config files.

## CLI Flags

See [CLI Runner](cli.md) for all flags.

## RunSuiteInput (Programmatic)

```typescript
import { runSuiteTool } from "@codie/qa-agent";

const result = await runSuiteTool({
  suite: suiteJSON,          // TestSuite object or raw JSON
  contracts: contractsJSON,  // ContractMap object or raw JSON
  baseUrl: "http://localhost:3002",
  artifactDir: ".qa-results/artifacts",  // optional, default shown
  config: {
    headless: true,     // optional, default: true
    failFast: false,    // optional, default: false
    timeoutMs: 10000,   // optional, default: 10000
  },
});
```

## EngineConfig

The `ActionEngine` accepts these configuration options:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `baseUrl` | `string` | `undefined` | Prepended to relative navigation paths |
| `timeout` | `number` | `10000` | Default timeout for actions (ms) |
| `retries` | `number` | `2` | Number of retries for failed actions |
| `retryDelay` | `number` | `500` | Delay between retries (ms) |
| `screenshotOnFailure` | `boolean` | `true` | Capture screenshot on failure |
| `domOnFailure` | `boolean` | `true` | Capture DOM snapshot on failure |
| `headless` | `boolean` | `true` | Run browser in headless mode |
| `slowMo` | `number` | `0` | Slow down actions (ms, for debugging) |
| `viewport` | `{width, height}` | `1280x720` | Browser viewport dimensions |

## Assertion Timeout

The `AssertionEngine` uses a default timeout of 10 seconds per assertion. This is set in `executeContractTool` and cannot currently be overridden via CLI flags.

## Artifact Storage

Screenshots are saved as PNG files to the artifact directory:

```
{artifactDir}/{traceId}/step-{index}-before.png
{artifactDir}/{traceId}/step-{index}-after.png
{artifactDir}/{traceId}/final.png
```

Default artifact directory: `.qa-results/artifacts/`

Override with `--artifact-dir <dir>` on the CLI or `artifactDir` in `RunSuiteInput`.
