# Agent Workflows

QA Intel is meant to be a validation surface for agentic engineering. It gives coding agents a shared contract format, deterministic execution, structured diagnostics, and queryable history.

## Typical Loop

```text
Authoring agent
  -> writes or updates a .feature file
  -> QA Intel compiler produces suite.json
  -> validation agent runs the suite
  -> investigation agent reads JSON, artifacts, and SQLite history
  -> coding agent patches app/test code
```

The CLI and exported tool functions are intentionally JSON-first so agents can pass results to each other without scraping terminal prose.

## CLI Handoff

Compile a Gherkin file to a structured suite:

```bash
npx qa-runner compile examples/login.feature --base-url http://localhost:3002
```

Run the compiled suite:

```bash
npx qa-runner run .qa-results/compile/suite.json --base-url http://localhost:3002
```

The run result includes `runId`, `traceId`, per-contract statuses, step artifacts, assertion results, failures, and fix hints. CLI stdout is JSON. Non-fatal persistence warnings go to stderr.

## Programmatic Tools

Use exported functions when an agent wants to call QA Intel directly:

```ts
import {
  runSuiteTool,
  executeContractTool,
  executeStepTool,
  validateUIAssertionTool,
  validateAPIResponseTool,
  getStepArtifactsTool,
} from "@qutecoder/qa-intel";
```

Every tool-style function returns an `{ ok, data, error }` shape. That makes it safe for another agent to branch on `ok`, inspect `error.code`, or forward `data` as structured context.

Useful surfaces:

| Function | Purpose |
|----------|---------|
| `runSuiteTool` | Compile raw Gherkin or run a `TestSuite` and aggregate results |
| `executeContractTool` | Run one contract and return step/assertion diagnostics |
| `executeStepTool` | Execute one step in a trace-scoped browser session |
| `validateUIAssertionTool` | Check a UI assertion against an active browser session |
| `validateAPIResponseTool` | Validate API response data |
| `getStepArtifactsTool` | Read live DOM/console context for a step when available |

## SQLite Investigation

CLI runs persist to `.qa-results/results.db` by default. Programmatic runs persist when `resultsDb` is provided to `runSuiteTool`.

Use `ResultStore` for typed reads:

```ts
import { ResultStore } from "@qutecoder/qa-intel";

const store = new ResultStore(".qa-results/results.db");
const latest = store.getLatestRun();

if (latest) {
  const failedSteps = store.getFailedSteps(latest.runId);
  const networkByContract = store.getRunNetworkLogs(latest.runId);
  const consoleLogs = store.getRunConsoleLogs(latest.runId);
}

store.close();
```

Direct SQL is also useful for investigation agents:

```sql
select run_id, trace_id, status, created_at
from runs
order by created_at desc
limit 5;
```

```sql
select c.intent, s.step_id, s.type, s.error_type, s.error_message
from steps s
join contracts c on c.id = s.contract_id
where c.run_id = ? and s.status = 'failed'
order by c.contract_index, s.step_index;
```

```sql
select nl.method, nl.url, nl.status, h.name, h.value
from network_logs nl
left join network_log_headers h on h.log_id = nl.id
join contracts c on c.id = nl.contract_id
where c.run_id = ?
order by c.contract_index, nl.log_index;
```

## What To Hand To A Coding Agent

When a validation agent reports a failure, the highest-signal payload is usually:

- the failing contract intent
- failed step or assertion result
- `failure.layer` and `failure.rootCause`
- screenshot paths from `artifacts`
- relevant console logs and page errors
- matching network calls and response bodies
- fix hints, if present

That context is usually enough for a coding agent to decide whether to patch the application, backend API, fixture data, or the Gherkin contract.
