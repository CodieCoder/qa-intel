# DSL Reference

`suite.json` is the compiled runtime format. Users should usually author `.feature` files and let the compiler produce this JSON. The format is intentionally structured so agents and tools can validate, exchange, and re-run contracts without parsing natural-language test logs.

## Suite Shape

```json
{
  "name": "login",
  "baseUrl": "http://localhost:3002",
  "contracts": [
    {
      "intent": "successful_login",
      "description": "Successful login",
      "steps": [
        { "type": "navigate", "url": "/login" },
        {
          "type": "type",
          "value": "maac@example.com",
          "locator": { "strategy": "label", "name": "Email" }
        },
        {
          "type": "click",
          "locator": { "strategy": "role", "role": "button", "name": "Log in" }
        }
      ],
      "assertions": [
        {
          "type": "visible",
          "locator": { "strategy": "role", "role": "heading", "name": "Dashboard" }
        }
      ]
    }
  ]
}
```

## LocatorSpec

```ts
type LocatorSpec =
  | { strategy: "role"; role: string; name: string }
  | { strategy: "label"; name: string }
  | { strategy: "placeholder"; text: string }
  | { strategy: "text"; text: string }
  | { strategy: "testid"; id: string }
  | { strategy: "css"; selector: string };
```

Resolution:

| Strategy | Playwright call |
|----------|-----------------|
| `role` | `page.getByRole(role, { name })` |
| `label` | `page.getByLabel(name, { exact: true })` |
| `placeholder` | `page.getByPlaceholder(text)` |
| `text` | `page.getByText(text)` |
| `testid` | `page.getByTestId(id)` |
| `css` | `page.locator(selector)` |

## Steps

| Type | Required fields |
|------|-----------------|
| `navigate` | `url` |
| `click` | `locator` |
| `type` | `locator`, `value` |
| `select` | `locator`, `value` |
| `wait` | `timeout` or `locator` |
| `check` | `locator` |
| `uncheck` | `locator` |
| `toggle` | `locator` |
| `upload` | `locator`, `value` |
| `request` | `method`, `url`; optional `body`, `headers` |

## Assertions

| Type | Required fields |
|------|-----------------|
| `visible` | `locator` |
| `not_visible` | `locator` |
| `exists` | `locator` |
| `text_equals` | `locator`, `value` |
| `text_contains` | `locator`, `value` |
| `url_equals` | `value` |
| `url_contains` | `value` |
| `status_code` | `url`, `value` |
| `response_body_contains` | `url`, `value` |
| `response_body_equals` | `url`, `path`, `value` |
| `response_header_contains` | `url`, `header`, `value` |
| `trace_id_present` | `url` |

## Gherkin Examples

```gherkin
When I click the button "Log in"
When I type "maac@example.com" into the field "Email"
Then I should see the heading "Dashboard"
Then the text "Welcome back" should exist
Then requests to "/api/session" should include trace ID
When I click testid:login-submit
When I click css:[data-state='ready']
```

Old raw targets such as `When I click login-submit` are not valid in v1. Use semantic wording or an explicit `testid:` fallback.
