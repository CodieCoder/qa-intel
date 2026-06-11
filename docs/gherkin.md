# Gherkin Reference

Gherkin is the recommended authoring format. The grammar is strict and compiles to structured `LocatorSpec` objects for deterministic agent-to-agent validation.

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

## Element-Kind Vocabulary

<!-- BEGIN: element-kinds (auto-generated from src/modules/dsl/element-kinds.ts) -->

### Layout

| Kind        | Description                    |
| ----------- | ------------------------------ |
| `page`      | Top-level page root container  |
| `section`   | A major section within a page  |
| `panel`     | A contained panel or card body |
| `card`      | A card component               |
| `sidebar`   | Sidebar navigation landmark    |
| `header`    | Page or section header         |
| `footer`    | Page or section footer         |
| `container` | Generic container/wrapper      |

### Navigation

| Kind         | Description               |
| ------------ | ------------------------- |
| `link`       | Anchor / navigation link  |
| `tab`        | Tab panel trigger         |
| `breadcrumb` | Breadcrumb navigation bar |
| `menu`       | Dropdown or context menu  |
| `menu-item`  | Item within a menu        |

### Forms

| Kind          | Description                                    |
| ------------- | ---------------------------------------------- |
| `field`       | A form control addressed by visible label      |
| `form`        | `<form>` element or form container             |
| `input`       | Text, number, date, textarea, or similar input |
| `select`      | Dropdown / combobox select                     |
| `checkbox`    | Checkbox input                                 |
| `radio`       | Radio button input                             |
| `toggle`      | Toggle / switch control                        |
| `file-input`  | File upload input                              |
| `placeholder` | Input addressed by placeholder text            |

### Actions

| Kind          | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `button`      | `<button>` element                                               |
| `submit`      | Form submit button (when emphasis on submit semantics is needed) |
| `icon-button` | Icon-only button                                                 |

### Data

| Kind      | Description                             |
| --------- | --------------------------------------- |
| `table`   | Data table                              |
| `row`     | Table row or list item row              |
| `cell`    | Table cell                              |
| `list`    | List container                          |
| `heading` | `<h1>`–`<h6>` or prominent heading text |
| `text`    | Visible text content                    |
| `label`   | Descriptive label                       |
| `badge`   | Status badge or tag                     |
| `value`   | Rendered data value (read-only)         |

### Feedback

| Kind       | Description                   |
| ---------- | ----------------------------- |
| `toast`    | Toast / snackbar notification |
| `dialog`   | Modal dialog                  |
| `alert`    | Inline alert / banner         |
| `error`    | Validation error message      |
| `spinner`  | Loading spinner               |
| `skeleton` | Skeleton loading placeholder  |
| `empty`    | Empty-state indicator         |

### Media

| Kind     | Description   |
| -------- | ------------- |
| `image`  | Image element |
| `icon`   | Icon element  |
| `avatar` | User avatar   |

<!-- END: element-kinds -->

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
Then requests to "/api/users" should include trace ID
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
