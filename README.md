# QA Agent

A Gherkin-first QA runner that turns acceptance-style `.feature` files into deterministic Playwright checks. Write flows in user-visible language, compile them to `suite.json`, run them, and get JSON results with screenshots, network logs, console logs, SQLite persistence, and fix hints.

## How It Works

```text
Gherkin feature
  -> strict compiler
  -> suite.json with structured locators
  -> Playwright execution
  -> JSON output + screenshots + optional SQLite history
```

The core idea is semantic-first targeting:

```gherkin
When I type "maac@example.com" into the field "Email"
And I click the button "Log in"
Then I should see the heading "Dashboard"
```

When a UI has no stable semantic target, use an explicit escape hatch:

```gherkin
When I click testid:login-submit
When I click css:[data-state='ready']
```

## Usage

Compile a feature file:

```bash
qa-runner compile examples/login.feature --base-url http://localhost:3002
```

Run a compiled suite:

```bash
qa-runner run .qa-results/compile/suite.json --base-url http://localhost:3002
```

Compile and run in one command:

```bash
qa-runner examples/login.feature --base-url http://localhost:3002
```

Useful flags:

| Flag | Description |
|------|-------------|
| `--base-url <url>` | Base URL for relative navigation and API requests |
| `--headed` | Show the browser |
| `--fail-fast` | Stop after the first failing contract |
| `--artifact-dir <dir>` | Screenshot/artifact output directory |
| `--results-db <path>` | SQLite results database path |
| `--auto-heal` | Enable experimental LLM locator healing |

## Gherkin Syntax

UI steps:

```gherkin
Given I navigate to "/login"
When I click the button "Log in"
When I type "secret" into the field "Password"
When I select "Admin" in the field "Role"
When I wait for the heading "Dashboard"
```

UI assertions:

```gherkin
Then I should see the heading "Dashboard"
Then I should not see the alert "Invalid credentials"
Then the text "Welcome back" should exist
Then the heading "Dashboard" should contain text "Dash"
```

API steps and assertions:

```gherkin
When I POST "/api/auth/login" with body '{"email":"a@b.com","password":"secret"}'
Then the API response to "/api/auth/login" should have status 200
Then the API response to "/api/auth/login" field "user.email" should equal "a@b.com"
```

## Locator Model

Compiled suites use structured locators:

```ts
type LocatorSpec =
  | { strategy: "role"; role: string; name: string }
  | { strategy: "label"; name: string }
  | { strategy: "placeholder"; text: string }
  | { strategy: "text"; text: string }
  | { strategy: "testid"; id: string }
  | { strategy: "css"; selector: string };
```

The runtime resolves those through Playwright:

| Strategy | Playwright call |
|----------|-----------------|
| `role` | `page.getByRole(role, { name })` |
| `label` | `page.getByLabel(name)` |
| `placeholder` | `page.getByPlaceholder(text)` |
| `text` | `page.getByText(text)` |
| `testid` | `page.getByTestId(id)` |
| `css` | `page.locator(selector)` |

## Output

All CLI output is JSON. A passing run looks like:

```json
{
  "ok": true,
  "data": {
    "status": "passed",
    "summary": {
      "totalContracts": 1,
      "passed": 1,
      "failed": 0
    }
  }
}
```

Failures include step/assertion context, screenshot paths, and fix hints. Results can also be persisted to `.qa-results/results.db`.

## Auto-Healing

Auto-healing is experimental and disabled by default. Enable it with `--auto-heal` and configure an `OPENAI_API_KEY`. The healer receives the failed structured locator, accessibility tree, screenshot, and error message, then returns a validated `LocatorSpec`. If healing fails or returns invalid output, the original deterministic failure is preserved.

## Development

```bash
yarn install
yarn build
yarn typecheck
yarn test
```
