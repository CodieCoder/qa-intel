# Gherkin-First Semantic QA Runner V1

## Summary

qa-agent now treats Gherkin as the primary authoring format and `suite.json` as the compiled runtime format. UI targets are semantic by default and compile into structured locators consumed by both actions and assertions.

Core decisions:

- Gherkin remains strict and parseable, not free-form English.
- `contracts.json` is removed.
- Raw targets such as `When I click login-submit` are invalid.
- Explicit fallbacks use `testid:<id>` and `css:<selector>`.
- Auto-healing is experimental and disabled unless `--auto-heal` is passed.

## Runtime Locator Model

```ts
type LocatorSpec =
  | { strategy: "role"; role: string; name: string }
  | { strategy: "label"; name: string }
  | { strategy: "placeholder"; text: string }
  | { strategy: "text"; text: string }
  | { strategy: "testid"; id: string }
  | { strategy: "css"; selector: string };
```

Resolution is centralized:

- `role` -> `page.getByRole(role, { name })`
- `label` -> `page.getByLabel(name)`
- `placeholder` -> `page.getByPlaceholder(text)`
- `text` -> `page.getByText(text)`
- `testid` -> `page.getByTestId(id)`
- `css` -> `page.locator(selector)`

## Gherkin Examples

```gherkin
When I click the button "Log in"
When I type "maac@example.com" into the field "Email"
Then I should see the heading "Dashboard"
When I click testid:login-submit
When I click css:[data-state='ready']
```

## CLI

```bash
qa-runner compile <feature-file> [flags]
qa-runner run <suite.json> [flags]
qa-runner <feature-file> [flags]
```

`contracts.json` is no longer generated or accepted.

## Verification Targets

- Compiler emits exact `LocatorSpec` objects.
- Old raw targets fail with migration guidance.
- Actions and assertions share the locator resolver.
- CLI compile writes only `suite.json`.
- CLI rejects old extra `contracts.json` positional arguments.
- Auto-healing returns validated `LocatorSpec` objects.
