# QA Agent (`@repo/qa-agent`)

A portable tool that validates full-stack features through the browser. Write Gherkin specs, run them, get structured JSON with screenshots and fix hints. Designed for autonomous agent-to-agent use.

## How It Works

```
Gherkin Spec (.feature)
       │
       ▼
Gherkin Compiler ──> Test Suite (JSON)
                          │
                          ▼
                 Playwright Execution
                 (screenshots at every step)
                          │
                          ▼
                 Assertion Engine
                 (UI + API + trace)
                          │
                          ├──> JSON Output to stdout
                          │    {failures, screenshot paths, fix hints}
                          │
                          ├──> SQLite DB (.qa-results/results.db)
                          │    Persistent queryable results + absolute screenshot paths
                          │
                          └──> PNG Screenshots (.qa-results/artifacts/)
                               Before/after screenshots for every step
```

The coding agent reads the JSON (or queries the SQLite DB for previous runs), views the screenshot files, fixes the code, and re-runs until all tests pass.

## Quick Start (LMS monorepo)

This package is **`@repo/qa-agent`** at `packages/qa-agent`. Dependencies and builds are managed with **Yarn** from the **repository root**.

**Recommended (one command):**

```bash
# From repository root
yarn install
bash .agents/skills/qa-testing/setup.sh
```

`setup.sh` runs `yarn install`, installs Playwright Chromium for this workspace, and `yarn workspace @repo/qa-agent build`, producing `dist/cli.js`.

**Same steps manually:**

```bash
yarn install
yarn workspace @repo/qa-agent build
yarn workspace @repo/qa-agent exec playwright install chromium
```

## Usage

### 1. Scan your app for `data-testid` attributes

From the **repository root** (canonical skill scripts):

```bash
bash .agents/skills/qa-testing/scan.sh apps/admin/src --output apps/admin/e2e/contracts.json
```

### 2. Write a Gherkin feature file

**UI flow** (browser-driven, observes API calls passively):

```gherkin
Feature: Login

@auth
Scenario: Login with valid credentials
  Given I navigate to "/login"
  When I type "admin@test.com" into login-email-input
  And I click login-submit-btn
  Then I should see dashboard-container
  And the API response to "/api/auth" should have status 200
```

**API-only flow** (direct HTTP requests, no browser UI):

```gherkin
Feature: Auth API

@api @auth
Scenario: Login API returns valid token
  When I POST "/api/auth/login" with body '{"email":"admin@test.com","password":"password123"}'
  Then the API response to "/api/auth/login" should have status 200
  And the API response to "/api/auth/login" field "user.email" should equal "admin@test.com"
  And the response header "set-cookie" from "/api/auth/login" should contain "session"
```

### 3. Run tests (output is JSON)

After `yarn workspace @repo/qa-agent build`, from **repository root**:

```bash
# Using the workspace CLI (recommended)
yarn workspace @repo/qa-agent exec qa-runner tests/login.feature tests/contracts.json --base-url http://localhost:3002

# Or from this package directory after build
cd packages/qa-agent && node dist/cli.js tests/login.feature tests/contracts.json --base-url http://localhost:3002
```

Or use **`bash .agents/skills/qa-testing/compile.sh`** / **`run.sh`** — see [`apps/admin/e2e/README.md`](../../apps/admin/e2e/README.md) and [`.agents/skills/qa-testing/SKILL.md`](../../.agents/skills/qa-testing/SKILL.md).

### 4. Read the output

Passing:

```json
{
  "ok": true,
  "data": {
    "status": "passed",
    "summary": { "totalContracts": 1, "passed": 1, "failed": 0 }
  }
}
```

Failing:

```json
{
  "ok": true,
  "data": {
    "status": "failed",
    "failures": [
      {
        "intent": "login_with_valid_credentials",
        "layer": "ui",
        "issue": "element not found within 5000ms",
        "fixHints": [
          { "type": "frontend", "suggestion": "Add element with data-testid=\"dashboard-container\"" }
        ]
      }
    ],
    "contracts": [
      {
        "steps": [
          {
            "type": "navigate",
            "status": "passed",
            "artifacts": {
              "beforeScreenshot": "/absolute/path/to/.qa-results/artifacts/trace-c0/step-0-before.png",
              "afterScreenshot": "/absolute/path/to/.qa-results/artifacts/trace-c0/step-0-after.png"
            }
          }
        ]
      }
    ]
  }
}
```

Screenshots are PNG files on disk with **absolute paths**. Read them to see what the page looked like.

## Persistent Results (SQLite)

Every test run is automatically persisted to `.qa-results/results.db`. This enables agents to query results from previous runs without relying on captured stdout.

All data is stored in **normalized tables** — no JSON blobs. Every field is individually queryable via SQL.

### Database Schema (13 tables)

| Table | Purpose |
|-------|---------|
| `schema_version` | Schema version tracking (auto-recreate on mismatch) |
| `runs` | Run metadata (id, trace, status, pass/fail counts, duration) |
| `contracts` | Per-contract results (intent, status, duration, root failure info) |
| `steps` | Per-step results with execution context (`target_ref`, `selector`, `value`), screenshots, DOM snapshots |
| `step_error_details` | Key-value rows for step error details |
| `assertions` | Per-assertion results (domain, type, status) |
| `assertion_expected` | Key-value rows for assertion expected values |
| `assertion_actual` | Key-value rows for assertion actual values |
| `assertion_diagnostics` | Key-value rows for assertion diagnostics (e.g. resolved selector, found flag) |
| `failures` | Failure summaries (layer, issue, location) |
| `fix_hints` | Normalized fix hint rows per failure (type, suggestion, target file/function/endpoint) |
| `network_logs` | Per-contract HTTP traffic (method, url, status, request/response bodies as JSON TEXT) |
| `network_log_headers` | Individual HTTP header rows per network log (direction, name, value) |
| `console_logs` | Per-step browser console output and JS errors (level, message, source URL, line number) |

**Robustness:**
- **Schema versioning**: DB auto-recreates when schema version changes — no manual deletion
- **Retention policy**: auto-prunes oldest runs (default 50). Configure: `new ResultStore(path, { maxRuns: 20 })`
- **Concurrent safety**: WAL mode + `busy_timeout = 5000ms`

### Programmatic API

```typescript
import { ResultStore } from "@repo/qa-agent";

const store = new ResultStore(".qa-results/results.db");

// Get the most recent run (fully hydrated)
const latest = store.getLatestRun();

// Get all failed steps with screenshot paths, DOM snapshots, and console logs
const failedSteps = store.getFailedSteps(latest.runId);

// Get screenshots for a specific step
const screenshots = store.getStepScreenshots(runId, stepId);

// Get network logs for a specific contract (by index)
const networkLogs = store.getNetworkLogs(runId, 0);

// Get all network logs for a run, grouped by contract
const allNetworkLogs = store.getRunNetworkLogs(runId);

// Get console logs for a specific step
const consoleLogs = store.getConsoleLogs(runId, stepId);

// Get all console logs for a run
const allConsoleLogs = store.getRunConsoleLogs(runId);

// List recent runs (metadata only)
const runs = store.listRuns(10);

store.close();
```

### What's Captured

| Data | Stored | Queryable |
|------|--------|-----------|
| Run metadata (id, trace, status, counts, duration) | runs table | Yes |
| Contract results (intent, status, duration, root failure) | contracts table | Yes |
| Step results (id, type, status, duration, error) | steps table | Yes |
| Step execution context (targetRef, resolved CSS selector, input value) | steps table | Yes |
| Before/after screenshot file paths | steps table | Yes |
| DOM snapshots on failure | steps table | Yes |
| Assertion expected/actual values | assertions table | Yes |
| Assertion diagnostics (selector, found, etc.) | assertion_diagnostics table | Yes, per key |
| Fix hints (type, suggestion, target) | fix_hints table | Yes, per field |
| Network request/response logs (method, url, status, headers, bodies) | network_logs table | Yes |
| Browser console output (log/info/warn/error/debug) | console_logs table | Yes |
| Uncaught JS exceptions (pageerror) | console_logs table | Yes |

## Test Data Generators

For feature files that fill forms, use `{{gen.*}}` placeholders (expanded at compile time):

```typescript
import { createGeneratorContext, generators, GENERATOR_NAMES } from "@repo/qa-agent";

// Context: cached per compile (same name → same value)
const ctx = createGeneratorContext();
ctx.resolve("username");   // "qa_1776113402750_a1b2c3"
ctx.resolve("username_1"); // different value (_N numbered variant)
ctx.register("phone", () => `+1555${Date.now().toString().slice(-7)}`); // extensible

// Stateless: fresh value each call
generators.password(); // "Qada601e1d!1"
```

**Built-in generators:** `username`, `password`, `email`, `national_id`, `uuid`, `timestamp`, `random_int`.

**Numbered variants:** `{{gen.username_1}}`, `{{gen.username_2}}` — distinct values per suffix, cached within a context.

## Programmatic API

From another workspace package in this monorepo, import from **`@repo/qa-agent`** (see `src/index.ts` and `docs/`).

## Skill scripts (canonical)

In this repository, use **`.agents/skills/qa-testing/`** (`setup.sh`, `scan.sh`, `compile.sh`, `run.sh`). They resolve the runner at `packages/qa-agent/dist/cli.js`. The `run.sh` wrapper **defaults to `--fail-fast`** for agent workflows (opt out with `QA_NO_FAIL_FAST=1`).

The **`packages/qa-agent/.kilo/`** tree is auxiliary (e.g. Kilo/Code tooling metadata); it is not the canonical path for LMS QA workflows.

## Package layout

```
packages/qa-agent/
  package.json          # name: @repo/qa-agent, bin: qa-runner -> dist/cli.js
  tsconfig.json
  src/
    cli.ts              # CLI entry
    index.ts            # Public API
    modules/            # dsl, engine, contracts, assertions, store, logger, generators, types
  dist/                 # produced by `yarn workspace @repo/qa-agent build`
  docs/                 # DSL, contracts, CLI reference
  examples/
```

## Key Principles

1. **Agent-to-agent only** — no dashboards, JSON + SQLite output for programmatic consumption
2. **Browser is the integration point** — frontend + backend validated in one pass
3. **API-only flows supported** — direct HTTP requests for endpoints with no UI trigger
4. **Screenshots are files** — PNGs on disk, **absolute paths** in JSON output and SQLite DB
5. **Results are persistent** — SQLite DB at `.qa-results/results.db` survives across runs and context resets
6. **Failures are actionable** — typed layers (ui/api/business), fix hints, network traces
7. **No raw selectors** — all selectors go through `UIContractMap`
8. **Monorepo-native** — Yarn workspace `@repo/qa-agent`

## License

Private — internal use only.
