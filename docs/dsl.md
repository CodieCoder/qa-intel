# Test Contract DSL

The DSL (Domain-Specific Language) defines the JSON schema for test contracts. Every test is expressed as a structured JSON object with **steps** (actions to perform) and **assertions** (conditions to verify). All schemas are validated at runtime using [Zod](https://zod.dev).

**Module:** `src/modules/dsl/`

## Table of Contents

- [Test Contract](#test-contract)
- [Test Suite](#test-suite)
- [Actions (Steps)](#actions)
- [Assertions](#assertions)
- [Result Types](#result-types)
- [Failure Report](#failure-report)
- [Validation Functions](#validation-functions)

---

## Test Contract

A single test scenario with a clear intent, a sequence of steps, and one or more assertions.

```json
{
  "intent": "login_success",
  "description": "User can log in with valid credentials",
  "tags": ["auth", "smoke"],
  "steps": [
    { "type": "navigate", "url": "/login" },
    { "type": "type", "targetRef": "email_input", "value": "test@example.com" },
    { "type": "click", "targetRef": "login_button" }
  ],
  "assertions": [
    { "type": "visible", "targetRef": "dashboard_container" }
  ]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `intent` | `string` | Yes | Unique identifier for this test (e.g. `login_success`). Must be non-empty. |
| `description` | `string` | No | Human-readable description of what this test validates. |
| `tags` | `string[]` | No | Tags for filtering/grouping (e.g. `["auth", "smoke"]`). |
| `steps` | `Step[]` | Yes | Ordered list of actions to perform. Must contain at least 1 step. |
| `assertions` | `Assertion[]` | Yes | Conditions to verify after steps complete. Must contain at least 1 assertion. |

---

## Test Suite

A collection of test contracts with optional shared configuration.

```json
{
  "name": "Login Flow Suite",
  "baseUrl": "http://localhost:3002",
  "contracts": [
    { "intent": "login_success", "steps": [...], "assertions": [...] },
    { "intent": "login_failure", "steps": [...], "assertions": [...] }
  ]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Name of the test suite. Must be non-empty. |
| `baseUrl` | `string` | No | Base URL prepended to relative paths in `navigate` steps. Must be a valid URL if provided. |
| `contracts` | `TestContract[]` | Yes | List of test contracts to execute. Must contain at least 1 contract. |

---

## Actions

Actions are the steps executed sequentially by the Playwright engine. Each step uses a **logical target name** (`targetRef`) that is resolved to a CSS selector through the [UI contract map](contracts.md).

### `navigate`

Navigate the browser to a URL.

```json
{ "type": "navigate", "url": "/login" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"navigate"` | Yes | Step discriminant |
| `url` | `string` | Yes | URL path or full URL. Relative paths are prepended with `baseUrl`. |

- If `url` starts with `http://` or `https://`, it is used as-is.
- Otherwise, `baseUrl` from the suite or engine config is prepended.
- Uses Playwright's `page.goto()` with `waitUntil: "domcontentloaded"`.

### `click`

Click an element.

```json
{ "type": "click", "targetRef": "login_button" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"click"` | Yes | Step discriminant |
| `targetRef` | `string` | Yes | Logical target name (resolved via contract map) |

- Uses Playwright's `page.click()`.

### `type`

Type text into an input field. Clears existing content first.

```json
{ "type": "type", "targetRef": "email_input", "value": "test@example.com" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"type"` | Yes | Step discriminant |
| `targetRef` | `string` | Yes | Logical target name (resolved via contract map) |
| `value` | `string` | Yes | Text to enter. Can be empty string to clear the field. |

- Uses Playwright's `page.fill()` (clears the field then types the value).

### `select`

Select an option in a dropdown/select element.

```json
{ "type": "select", "targetRef": "country_dropdown", "value": "US" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"select"` | Yes | Step discriminant |
| `targetRef` | `string` | Yes | Logical target name (resolved via contract map) |
| `value` | `string` | Yes | Option value to select |

- Uses Playwright's `page.selectOption()`.

### `wait`

Wait for an element to become visible, or wait for a fixed duration.

```json
{ "type": "wait", "targetRef": "loading_spinner" }
```

```json
{ "type": "wait", "timeout": 2000 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"wait"` | Yes | Step discriminant |
| `targetRef` | `string` | No | Logical target name to wait for (waits for visibility) |
| `timeout` | `number` | No | Duration in milliseconds to wait. Must be positive. |

- If `targetRef` is provided: uses `page.waitForSelector()` with `state: "visible"`.
- If only `timeout` is provided: uses `page.waitForTimeout()`.
- If neither is provided, the engine's default timeout is used.

### `request`

Make a direct HTTP request. For API-only flows that have no frontend trigger.

```json
{ "type": "request", "method": "POST", "url": "/api/auth/login", "body": "{\"email\":\"a@b.com\",\"password\":\"pass\"}" }
```

```json
{ "type": "request", "method": "GET", "url": "/api/users/me", "headers": {"Authorization": "Bearer tok"} }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"request"` | Yes | Step discriminant |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | Yes | HTTP method |
| `url` | `string` | Yes | URL path or full URL. Relative paths are prepended with `baseUrl`. |
| `body` | `string` | No | Request body (typically JSON string). If JSON, `content-type: application/json` is set automatically. |
| `headers` | `Record<string, string>` | No | Custom headers to include in the request. |

- Uses Playwright's `APIRequestContext.fetch()` — no browser page needed.
- Automatically injects `X-Request-Id` on outbound requests for correlation (CORS-friendly; avoids custom headers disallowed by typical LMS `Access-Control-Allow-Headers`).
- Response (status, headers, body) is injected into the `NetworkEntry[]` log.
- All API assertions (`status_code`, `response_body_contains`, `response_body_equals`, `response_header_contains`, `trace_id_present`) work on both browser-observed and direct request traffic.

---

## Assertions

Assertions verify the page state after all steps have executed. All assertions run to completion — they do **not** fail-fast, so you get a complete picture of what passed and failed.

### `visible`

Assert that an element is visible on the page.

```json
{ "type": "visible", "targetRef": "dashboard_container" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"visible"` | Yes | Assertion discriminant |
| `targetRef` | `string` | Yes | Logical target name |

- Uses `page.waitForSelector()` with `state: "visible"`.
- Fails if element is not visible within the assertion timeout.

### `not_visible`

Assert that an element is hidden or absent.

```json
{ "type": "not_visible", "targetRef": "error_message" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"not_visible"` | Yes | Assertion discriminant |
| `targetRef` | `string` | Yes | Logical target name |

- Uses `page.waitForSelector()` with `state: "hidden"`.

### `exists`

Assert that an element exists in the DOM (regardless of visibility).

```json
{ "type": "exists", "targetRef": "hidden_input" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"exists"` | Yes | Assertion discriminant |
| `targetRef` | `string` | Yes | Logical target name |

- Uses `page.waitForSelector()` with `state: "attached"`.

### `text_equals`

Assert that an element's text content exactly equals a value (after trimming).

```json
{ "type": "text_equals", "targetRef": "welcome_text", "value": "Welcome, John" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"text_equals"` | Yes | Assertion discriminant |
| `targetRef` | `string` | Yes | Logical target name |
| `value` | `string` | Yes | Expected exact text |

- Reads text via `page.textContent()`, trims whitespace, then compares with `===`.
- On failure, the result includes both `expected` and `actual` values.

### `text_contains`

Assert that an element's text content contains a substring.

```json
{ "type": "text_contains", "targetRef": "error_message", "value": "Invalid" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"text_contains"` | Yes | Assertion discriminant |
| `targetRef` | `string` | Yes | Logical target name |
| `value` | `string` | Yes | Expected substring |

- Reads text via `page.textContent()`, trims whitespace, then checks `.includes()`.

### `url_equals`

Assert the current page URL exactly matches a value.

```json
{ "type": "url_equals", "value": "http://localhost:3000/dashboard" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"url_equals"` | Yes | Assertion discriminant |
| `value` | `string` | Yes | Expected full URL |

- Compares `page.url()` with `===`.

### `url_contains`

Assert the current page URL contains a substring.

```json
{ "type": "url_contains", "value": "/dashboard" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"url_contains"` | Yes | Assertion discriminant |
| `value` | `string` | Yes | Expected URL substring |

- Checks `page.url().includes(value)`.

### `status_code`

Assert the HTTP status code of a network request matching a URL pattern.

```json
{ "type": "status_code", "url": "/api/auth/login", "value": 200 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"status_code"` | Yes | Assertion discriminant |
| `url` | `string` | Yes | URL pattern (substring match against captured network requests) |
| `value` | `number` | Yes | Expected HTTP status code |

- Matches against the last `NetworkEntry` whose URL contains the pattern.
- Works on both browser-observed and direct request traffic.

### `response_body_contains`

Assert the response body contains a substring.

```json
{ "type": "response_body_contains", "url": "/api/auth/login", "value": "token" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"response_body_contains"` | Yes | Assertion discriminant |
| `url` | `string` | Yes | URL pattern (substring match) |
| `value` | `string` | Yes | Expected substring in the JSON-stringified response body |

### `response_body_equals`

Assert a specific field in the response body matches a value.

```json
{ "type": "response_body_equals", "url": "/api/auth/login", "path": "user.email", "value": "admin@test.com" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"response_body_equals"` | Yes | Assertion discriminant |
| `url` | `string` | Yes | URL pattern (substring match) |
| `path` | `string` | Yes | JSON path (dot-notation) to a field in the response body |
| `value` | `string` | Yes | Expected value (compared as string) |

### `response_header_contains`

Assert a response header contains a substring. Useful for checking cookies, auth tokens, cache headers.

```json
{ "type": "response_header_contains", "url": "/api/auth/login", "header": "set-cookie", "value": "session" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"response_header_contains"` | Yes | Assertion discriminant |
| `url` | `string` | Yes | URL pattern (substring match) |
| `header` | `string` | Yes | Header name (case-insensitive matching) |
| `value` | `string` | Yes | Expected substring in the header value |

- Case-insensitive header name lookup.
- Checks `.includes()` on the header value.

### `trace_id_present`

Assert that requests to a URL pattern include `X-Request-Id` or legacy `x-trace-id`.

```json
{ "type": "trace_id_present", "url": "/api/auth/login" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"trace_id_present"` | Yes | Assertion discriminant |
| `url` | `string` | Yes | URL pattern (substring match) |

---

## Result Types

### StepResult

Returned for each executed step.

| Field | Type | Description |
|-------|------|-------------|
| `stepId` | `string` | Unique step identifier (e.g. `"trace-c0-step-0"`) |
| `type` | `string` | Step type (`navigate`, `click`, `type`, `select`, `wait`, `request`) |
| `status` | `"passed" \| "failed" \| "skipped"` | Outcome. Steps after a failure are `"skipped"`. |
| `durationMs` | `number` | Execution time in milliseconds |
| `error.type` | `FailureType?` | Classified failure type (e.g. `TIMEOUT`, `ELEMENT_NOT_FOUND`) |
| `error.message` | `string?` | Error message if failed |
| `targetRef` | `string?` | Logical target name from the contract (e.g. `login-submit`) |
| `selector` | `string?` | Resolved CSS selector (e.g. `[data-testid=login-submit]`) |
| `value` | `string?` | Input value for type/select steps |
| `artifacts.beforeScreenshot` | `string?` | Absolute file path to before-action PNG screenshot |
| `artifacts.afterScreenshot` | `string?` | Absolute file path to after-action PNG screenshot |
| `artifacts.domSnapshot` | `string?` | Full DOM snapshot on failure (`page.content()`) |

### AssertionResult

Returned for each evaluated assertion.

| Field | Type | Description |
|-------|------|-------------|
| `assertion` | `string` | Human-readable assertion description (e.g. `"visible: dashboard"`) |
| `status` | `"passed" \| "failed"` | Outcome |
| `reason` | `string?` | Error message if failed |
| `expected` | `string?` | Expected value (for text/url assertions) |
| `actual` | `string?` | Actual value found (for text/url assertions) |

### TestResult

Returned for each test contract.

| Field | Type | Description |
|-------|------|-------------|
| `intent` | `string` | The contract's intent identifier |
| `status` | `"passed" \| "failed" \| "error"` | Overall outcome |
| `duration` | `number` | Total execution time in milliseconds |
| `steps` | `StepResult[]` | Results for each step |
| `assertions` | `AssertionResult[]` | Results for each assertion |
| `error` | `string?` | Uncaught exception message |
| `traceId` | `string?` | Trace ID for backend correlation |

### SuiteResult

Returned for a complete test suite run.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Suite name |
| `status` | `"passed" \| "failed" \| "error"` | Overall outcome |
| `duration` | `number` | Total execution time in milliseconds |
| `results` | `TestResult[]` | Results for each contract |
| `timestamp` | `string` | ISO 8601 timestamp of the run |

---

## Failure Report

Failures are included in the `RunResult` output as a `failures` array with typed failure layers and fix hints:

```json
{
  "failures": [
    {
      "intent": "login_success",
      "layer": "ui",
      "issue": "element not found within 5000ms",
      "fixHints": [
        { "type": "frontend", "suggestion": "Add element with data-testid=\"dashboard-container\"" }
      ]
    }
  ]
}
```

### Failure Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `intent` | `string` | Which test contract failed |
| `layer` | `"ui" \| "api" \| "business"` | Failure domain |
| `issue` | `string` | Short description of the problem |
| `location` | `string?` | Endpoint, selector, or file reference |
| `fixHints` | `FixHint[]?` | Actionable fix suggestions |

### FixHint

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"frontend" \| "backend" \| "test"` | Area where the fix should be applied |
| `suggestion` | `string` | Actionable suggestion for resolving the issue |

---

## Validation Functions

The DSL package exports functions to parse and validate JSON at runtime:

```js
import {
  parseContract,
  parseTestSuite,
  safeParseContract,
  safeParseTestSuite
} from "@repo/qa-agent";
```

| Function | Returns | Throws on invalid? |
|----------|---------|---------------------|
| `parseContract(input)` | `TestContract` | Yes — throws `ZodError` |
| `parseTestSuite(input)` | `TestSuite` | Yes — throws `ZodError` |
| `safeParseContract(input)` | `{ success: boolean, data?, error? }` | No — returns result object |
| `safeParseTestSuite(input)` | `{ success: boolean, data?, error? }` | No — returns result object |

### Example: Safe validation

```js
const result = safeParseContract(userInput);

if (!result.success) {
  console.error("Invalid contract:", result.error.format());
} else {
  console.log("Valid:", result.data.intent);
}
```
