# Gherkin Reference

Gherkin is the recommended authoring format. The grammar is strict and compiles to structured `LocatorSpec` objects.

## UI Flow

```gherkin
Feature: Login

Scenario: Successful login
  Given I navigate to "/login"
  When I type "maac@example.com" into the field "Email"
  And I type "secret" into the field "Password"
  And I click the button "Log in"
  Then I should see the heading "Dashboard"
  And the url should contain "/dashboard"
```

## Locator Phrases

| Gherkin target | LocatorSpec |
|----------------|-------------|
| `the button "Log in"` | `{ "strategy": "role", "role": "button", "name": "Log in" }` |
| `the heading "Dashboard"` | `{ "strategy": "role", "role": "heading", "name": "Dashboard" }` |
| `the field "Email"` | `{ "strategy": "label", "name": "Email" }` |
| `the placeholder "Search"` | `{ "strategy": "placeholder", "text": "Search" }` |
| `"Welcome"` | `{ "strategy": "text", "text": "Welcome" }` |
| `testid:login-submit` | `{ "strategy": "testid", "id": "login-submit" }` |
| `css:[data-state='ready']` | `{ "strategy": "css", "selector": "[data-state='ready']" }` |

## Steps

```gherkin
Given I navigate to "/path"
When I click the button "Save"
When I type "hello" into the field "Name"
When I select "Admin" in the field "Role"
When I wait for the heading "Dashboard"
When I wait 500ms
When I check the checkbox "Terms"
When I uncheck the checkbox "Marketing"
When I toggle the toggle "Dark mode"
When I upload "/tmp/file.pdf" into the field "Document"
```

## Assertions

```gherkin
Then I should see the heading "Dashboard"
Then I should not see the alert "Invalid credentials"
Then the text "Welcome back" should exist
Then the heading "Dashboard" should have text "Dashboard"
Then the alert "Invalid credentials" should contain text "Invalid"
Then the url should contain "/dashboard"
```

## API

```gherkin
When I GET "/api/users"
When I POST "/api/users" with body '{"email":"a@b.com"}'
When I POST "/api/users" with body '{"email":"a@b.com"}' and headers '{"Authorization":"Bearer token"}'
Then the API response to "/api/users" should have status 200
Then the API response to "/api/users" should contain "a@b.com"
Then the API response to "/api/users" field "user.email" should equal "a@b.com"
Then the response header "content-type" from "/api/users" should contain "application/json"
```

## Migration Note

Raw targets are intentionally invalid:

```gherkin
When I click login-submit
```

Use semantic wording:

```gherkin
When I click the button "Log in"
```

Or an explicit fallback:

```gherkin
When I click testid:login-submit
```
