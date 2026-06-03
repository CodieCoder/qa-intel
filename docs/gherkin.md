# Gherkin Compiler

The Gherkin compiler converts standard `.feature` files into structured [Test Contract](dsl.md) JSON. This lets you write tests in human-readable Gherkin syntax and automatically produce the JSON DSL consumed by the runner.

**Module:** `src/modules/dsl/`  
**Function:** `compileGherkin(gherkin: string): CompileResult`

## Quick Example

**Input** (`login.feature`):

```gherkin
Feature: User Authentication

@auth @smoke
Scenario: Successful login with valid credentials
  Given I navigate to "/login"
  When I type "test@example.com" into email_input
  And I type "password123" into password_input
  And I click login_button
  Then I should see dashboard_container
  And the url should contain "/dashboard"
```

**Output** (JSON):

```json
{
  "contracts": [
    {
      "intent": "successful_login_with_valid_credentials",
      "description": "Successful login with valid credentials",
      "tags": ["auth", "smoke"],
      "steps": [
        { "type": "navigate", "url": "/login" },
        { "type": "type", "targetRef": "email_input", "value": "test@example.com" },
        { "type": "type", "targetRef": "password_input", "value": "password123" },
        { "type": "click", "targetRef": "login_button" }
      ],
      "assertions": [
        { "type": "visible", "targetRef": "dashboard_container" },
        { "type": "url_contains", "value": "/dashboard" }
      ]
    }
  ],
  "errors": []
}
```

## Usage

```js
import { compileGherkin } from "@repo/qa-agent";
import { readFileSync } from "node:fs";

const gherkin = readFileSync("my-tests.feature", "utf-8");
const { contracts, errors } = compileGherkin(gherkin);

if (errors.length > 0) {
  console.error("Compilation errors:");
  for (const err of errors) {
    console.error(`  Line ${err.line}: ${err.message} — "${err.text}"`);
  }
}

// contracts is a TestContract[] ready for the runner
console.log(`Compiled ${contracts.length} test contracts`);
```

## Supported Keywords

The compiler recognizes these Gherkin keywords:

| Keyword | Usage |
|---------|-------|
| `Feature:` | Names the feature (informational only, not used in output) |
| `Scenario:` | Starts a new test contract |
| `Scenario Outline:` | Same as `Scenario:` (outline tables not yet supported) |
| `Given` | Defines a precondition step |
| `When` | Defines an action step |
| `Then` | Defines an assertion |
| `And` | Continues the previous keyword (step or assertion) |
| `But` | Same as `And` |
| `@tag` | Tags applied to the next `Scenario:` line |
| `#` | Comment (line is ignored) |

## Supported Step Patterns

Steps are parsed from `Given`, `When`, `And`, and `But` lines.

### `navigate`

Navigate to a URL path.

```gherkin
Given I navigate to "/login"
When I navigate to "/settings"
```

- Regex: `/^(?:I )?navigate to ["'](.+?)["']$/i`
- Quotes: single `'` or double `"` around the URL
- Produces: `{ "type": "navigate", "url": "/login" }`

### `type`

Type text into an input field.

```gherkin
When I type "test@example.com" into email_input
And I type "password123" into password_input
```

- Regex: `/^(?:I )?type ["'](.+?)["'] into (\S+)$/i`
- The value is in quotes, the target is a bare word (logical name)
- Produces: `{ "type": "type", "targetRef": "email_input", "value": "test@example.com" }`

### `click`

Click an element.

```gherkin
When I click login_button
And I click submit_button
```

- Regex: `/^(?:I )?click (\S+)$/i`
- Target is a bare word (logical name)
- Produces: `{ "type": "click", "targetRef": "login_button" }`

### `select`

Select an option from a dropdown.

```gherkin
When I select "United States" in country_dropdown
```

- Regex: `/^(?:I )?select ["'](.+?)["'] in (\S+)$/i`
- Value is in quotes, target is a bare word
- Produces: `{ "type": "select", "targetRef": "country_dropdown", "value": "United States" }`

### `wait` (for element)

Wait for an element to become visible.

```gherkin
When I wait for loading_spinner
```

- Regex: `/^(?:I )?wait for (\S+)$/i`
- Produces: `{ "type": "wait", "targetRef": "loading_spinner" }`

### `wait` (for duration)

Wait for a fixed number of milliseconds.

```gherkin
When I wait 2000ms
When I wait 500
```

- Regex: `/^(?:I )?wait (\d+)(?:ms)?$/i`
- The `ms` suffix is optional
- Produces: `{ "type": "wait", "timeout": 2000 }`

### `request` (direct API call)

Make a direct HTTP request without going through the browser. For API-only flows that have no frontend trigger.

**GET / DELETE (no body):**

```gherkin
When I GET "/api/users/me"
When I DELETE "/api/sessions/current"
```

- Regex: `/^(?:I )?(GET|DELETE)\s+["'](.+?)["']$/i`
- Produces: `{ "type": "request", "method": "GET", "url": "/api/users/me" }`

**POST / PUT / PATCH / etc. (with body):**

```gherkin
When I POST "/api/auth/login" with body '{"email":"a@b.com","password":"pass"}'
When I PUT "/api/users/1" with body '{"name":"Alice"}'
When I PATCH "/api/users/1" with body '{"active":false}'
```

- Regex: `/^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']$/i`
- Produces: `{ "type": "request", "method": "POST", "url": "/api/auth/login", "body": "{\"email\":\"a@b.com\",\"password\":\"pass\"}" }`

**With body and custom headers:**

```gherkin
When I POST "/api/admin/users" with body '{"role":"admin"}' and headers '{"Authorization":"Bearer tok"}'
When I GET "/api/users/me" with body '' and headers '{"Authorization":"Bearer tok"}'
```

- Regex: `/^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']\s+and\s+headers\s+["'](.+?)["']$/i`
- Headers must be valid JSON
- Produces: `{ "type": "request", "method": "POST", "url": "/api/admin/users", "body": "{\"role\":\"admin\"}", "headers": {"Authorization":"Bearer tok"} }`

**How it works:** The request step uses Playwright's API request context to make the HTTP call directly. The response (status, headers, body) is injected into the same `NetworkEntry[]` log that the assertion engine reads. All existing API assertions (`status_code`, `response_body_contains`, `response_body_equals`, `response_header_contains`, `trace_id_present`) work on both browser-observed and direct request traffic.

**When to use:**
- API endpoints with no UI (admin, webhooks, token validation)
- Testing API error responses for edge cases the UI doesn't surface
- Auth flows: register → login → use token → logout → verify revocation

## Supported Assertion Patterns

Assertions are parsed from `Then`, `And`, and `But` lines.

### `visible`

Assert an element is visible.

```gherkin
Then I should see dashboard_container
Then dashboard_container should be visible
```

- Patterns:
  - `/^(?:I )?should see (\S+)$/i`
  - `/^(\S+) (?:should be |is )visible$/i`
- Produces: `{ "type": "visible", "targetRef": "dashboard_container" }`

### `not_visible`

Assert an element is hidden.

```gherkin
Then I should not see error_message
Then error_message should not be visible
```

- Patterns:
  - `/^(?:I )?should not see (\S+)$/i`
  - `/^(\S+) (?:should not be |is not )visible$/i`
- Produces: `{ "type": "not_visible", "targetRef": "error_message" }`

### `text_equals`

Assert an element's text exactly matches a value.

```gherkin
Then welcome_text should have text "Welcome, John"
```

- Regex: `/^(\S+) should have text ["'](.+?)["']$/i`
- Produces: `{ "type": "text_equals", "targetRef": "welcome_text", "value": "Welcome, John" }`

### `text_contains`

Assert an element's text contains a substring.

```gherkin
Then error_message should contain text "Invalid"
Then error_message should contain "Invalid"
```

- Regex: `/^(\S+) should contain (?:text )?["'](.+?)["']$/i`
- The word `text` between `contain` and the value is optional
- Produces: `{ "type": "text_contains", "targetRef": "error_message", "value": "Invalid" }`

### `exists`

Assert an element exists in the DOM.

```gherkin
Then hidden_input should exist
```

- Regex: `/^(\S+) should exist$/i`
- Produces: `{ "type": "exists", "targetRef": "hidden_input" }`

### `url_equals`

Assert the page URL exactly matches.

```gherkin
Then the url should be "/dashboard"
Then the url should equal "/dashboard"
```

- Regex: `/^the url should (?:be|equal) ["'](.+?)["']$/i`
- Produces: `{ "type": "url_equals", "value": "/dashboard" }`

### `url_contains`

Assert the page URL contains a substring.

```gherkin
Then the url should contain "/dashboard"
```

- Regex: `/^the url should contain ["'](.+?)["']$/i`
- Produces: `{ "type": "url_contains", "value": "/dashboard" }`

### `status_code`

Assert the HTTP status code of a network request matching a URL pattern.

```gherkin
Then the API response to "/api/auth/login" should have status 200
```

- Regex: `/^the (?:API )?response to ["'](.+?)["'] should have status (\d+)$/i`
- Matches against the network log (both browser-observed and direct request traffic)
- Produces: `{ "type": "status_code", "url": "/api/auth/login", "value": 200 }`

### `response_body_contains`

Assert the response body contains a substring.

```gherkin
Then the API response to "/api/auth/login" should contain "token"
```

- Regex: `/^the (?:API )?response to ["'](.+?)["'] should contain ["'](.+?)["']$/i`
- Produces: `{ "type": "response_body_contains", "url": "/api/auth/login", "value": "token" }`

### `response_body_equals`

Assert a specific field in the response body matches a value (dot-notation path).

```gherkin
Then the API response to "/api/auth/login" field "user.email" should equal "admin@test.com"
```

- Regex: `/^the (?:API )?response to ["'](.+?)["'] field ["'](.+?)["'] should (?:be|equal) ["'](.+?)["']$/i`
- Produces: `{ "type": "response_body_equals", "url": "/api/auth/login", "path": "user.email", "value": "admin@test.com" }`

### `response_header_contains`

Assert a response header contains a substring. Useful for checking cookies, auth tokens, cache headers.

```gherkin
Then the response header "set-cookie" from "/api/auth/login" should contain "session"
Then the response header "content-type" from "/api/users" should contain "application/json"
```

- Regex: `/^the response header ["'](.+?)["'] from ["'](.+?)["'] should contain ["'](.+?)["']$/i`
- Header name matching is case-insensitive
- Produces: `{ "type": "response_header_contains", "url": "/api/auth/login", "header": "set-cookie", "value": "session" }`

### `trace_id_present`

Assert that requests to a URL pattern include `X-Request-Id` (or legacy `x-trace-id`).

```gherkin
Then requests to "/api/auth/login" should include trace ID
```

- Regex: `/^requests to ["'](.+?)["'] should include trace ID$/i`
- Produces: `{ "type": "trace_id_present", "url": "/api/auth/login" }`

## Tags

Tags are written on the line immediately before a `Scenario:` and start with `@`:

```gherkin
@auth @smoke @critical
Scenario: User can log in
```

Multiple tags are space-separated. The `@` prefix is stripped in the output:

```json
{ "tags": ["auth", "smoke", "critical"] }
```

Tags are scoped to the scenario they precede. Each scenario gets its own set of tags.

## Intent Generation

The scenario name is automatically converted to a `snake_case` intent:

| Scenario Name | Generated Intent |
|---------------|-----------------|
| `Successful login with valid credentials` | `successful_login_with_valid_credentials` |
| `Login fails with invalid credentials` | `login_fails_with_invalid_credentials` |
| `User can reset password` | `user_can_reset_password` |

Rules: lowercase, strip non-alphanumeric (except spaces), replace spaces with `_`.

## Error Handling

The compiler does **not** throw on errors. Instead, it returns any issues in the `errors` array:

```typescript
interface CompilerError {
  line: number;   // Line number in the source file (1-indexed)
  text: string;   // The raw text of the problematic line
  message: string; // What went wrong
}
```

Common errors:
- `"Unrecognized line"` — a line that isn't a keyword, tag, or comment
- `"Could not parse ... into a step or assertion"` — recognized keyword but unrecognized syntax
- `"Scenario has no steps"` — scenario contains only assertions
- `"Scenario has no assertions"` — scenario contains only steps

Scenarios with errors are **skipped** (not included in the output `contracts` array).

## Complete Example

```gherkin
Feature: Shopping Cart

@cart @smoke
Scenario: Add item to cart
  Given I navigate to "/products"
  When I click product_card
  And I click add_to_cart_button
  And I wait for cart_badge
  Then I should see cart_badge
  And cart_badge should have text "1"

@cart @negative
Scenario: Cannot checkout with empty cart
  Given I navigate to "/cart"
  When I click checkout_button
  Then I should see empty_cart_message
  And empty_cart_message should contain "Your cart is empty"
  And I should not see payment_form
```

Compiles to 2 contracts with proper tags, steps, and assertions.

## Dynamic Test Data for Form Filling

Use `{{gen.*}}` placeholders for features that fill forms with dynamic data. These are expanded at compile time by `substitute-qa-env.mjs` to unique, valid values — no hardcoded test data needed.

```gherkin
Feature: Registration — live form submission

@live-api @auth
Scenario: User registers with valid credentials
  Given I navigate to "/register"
  When I wait for register-submit
  And I type "{{gen.username}}" into register-username
  And I type "{{gen.password}}" into register-password
  And I type "{{gen.national_id}}" into register-national-id
  And I click register-role-borrower
  And I click register-submit
  Then I should see login-username
```

Supported generators: `{{gen.username}}`, `{{gen.password}}`, `{{gen.email}}`, `{{gen.national_id}}`, `{{gen.uuid}}`, `{{gen.timestamp}}`, `{{gen.random_int}}`.

**Numbered variants:** For suites with multiple scenarios needing unique data, use `_N` suffix: `{{gen.username_1}}`, `{{gen.username_2}}`. Each numbered variant produces a distinct value. Without a suffix, the base name is cached (same value if used twice in one suite).

See `apps/admin/e2e/README.md` for the full table and programmatic API.

## Complete Example: API-Only Flow

```gherkin
Feature: Auth API

@api @auth
Scenario: Login returns token
  When I POST "/api/auth/login" with body '{"email":"admin@test.com","password":"pass123"}'
  Then the API response to "/api/auth/login" should have status 200
  And the API response to "/api/auth/login" should contain "token"
  And the API response to "/api/auth/login" field "user.email" should equal "admin@test.com"
  And the response header "set-cookie" from "/api/auth/login" should contain "session"

@api @auth @negative
Scenario: Invalid credentials rejected
  When I POST "/api/auth/login" with body '{"email":"wrong@test.com","password":"bad"}'
  Then the API response to "/api/auth/login" should have status 401

@api @auth
Scenario: Protected endpoint rejects unauthenticated request
  When I GET "/api/users/me"
  Then the API response to "/api/users/me" should have status 401

@api @auth
Scenario: Protected endpoint accepts valid token
  When I GET "/api/users/me" with body '' and headers '{"Authorization":"Bearer valid-test-token"}'
  Then the API response to "/api/users/me" should have status 200
```

Compiles to 4 contracts. Direct request steps inject responses into the same network log used by browser-observed assertions.
