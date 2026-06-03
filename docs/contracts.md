# UI Contract Map

The UI contract map is a central registry that maps **logical target names** to **CSS selectors**. Every test contract references elements by their logical name (e.g. `login_button`), and the contract map resolves them to actual selectors (e.g. `[data-testid=login-btn]`).

**Module:** `src/modules/contracts/`

## Why

- **No raw selectors in tests** — test contracts remain readable and stable
- **Single source of truth** — when a selector changes, update one place
- **`data-testid` enforcement** — prevents brittle selectors tied to styling or structure
- **Decouples tests from implementation** — the same logical name works across redesigns

## File Format

A contract map is a JSON object where keys are logical target names and values describe the selector:

```json
{
  "login_button": {
    "selector": "[data-testid=login-btn]",
    "description": "Submit button on login form",
    "isTestId": true
  },
  "email_input": {
    "selector": "[data-testid=email-input]",
    "description": "Email input field on login page",
    "isTestId": true
  },
  "dashboard_container": {
    "selector": "[data-testid=dashboard]",
    "description": "Main dashboard container after login",
    "isTestId": true
  }
}
```

### Entry Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `selector` | `string` | Yes | — | CSS selector string. Must be non-empty. |
| `description` | `string` | No | — | Human-readable description of the element. |
| `isTestId` | `boolean` | No | `true` | Whether to enforce `data-testid` in the selector. |

### `data-testid` Enforcement

When `isTestId` is `true` (the default), the `register()` method validates that the selector string contains `data-testid`. This prevents accidentally using fragile selectors like `.btn-primary` or `#login-form > button`.

To register a selector that does not use `data-testid`, explicitly set `isTestId: false`:

```json
{
  "legacy_widget": {
    "selector": "#old-widget .container",
    "description": "Legacy widget that predates data-testid convention",
    "isTestId": false
  }
}
```

## Programmatic Usage

### Loading from JSON file

```js
import { UIContractMap } from "@repo/qa-agent";
import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync("contracts.json", "utf-8"));
const contractMap = UIContractMap.fromJSON(raw);
```

### Creating in code

```js
import { UIContractMap } from "@repo/qa-agent";

const contractMap = new UIContractMap({
  login_button: {
    selector: "[data-testid=login-btn]",
    isTestId: true,
  },
  email_input: {
    selector: "[data-testid=email-input]",
    isTestId: true,
  },
});
```

### Registering targets at runtime

```js
contractMap.register("new_button", {
  selector: "[data-testid=new-btn]",
  description: "Newly added button",
  isTestId: true,
});
```

### Resolving a target

```js
const selector = contractMap.resolve("login_button");
// Returns: "[data-testid=login-btn]"

contractMap.resolve("unknown_target");
// Throws: Error('Unknown target: "unknown_target"...')
```

### Checking if a target exists

```js
contractMap.has("login_button");  // true
contractMap.has("nonexistent");   // false
```

### Listing all targets

```js
contractMap.targets();
// ["login_button", "email_input", "dashboard_container"]
```

### Getting the full entry

```js
const entry = contractMap.getEntry("login_button");
// { selector: "[data-testid=login-btn]", description: "Submit button...", isTestId: true }
```

### Merging contract maps

Useful when different teams own different parts of the UI:

```js
const authContracts = UIContractMap.fromJSON(authContractsJSON);
const dashContracts = UIContractMap.fromJSON(dashContractsJSON);

authContracts.merge(dashContracts);
// authContracts now contains all targets from both maps
```

### Exporting to JSON

```js
const json = contractMap.toJSON();
// Returns a plain object suitable for JSON.stringify()
```

### Size

```js
contractMap.size;  // 6
```

## API Reference

### `UIContractMap`

| Method | Signature | Description |
|--------|-----------|-------------|
| `constructor` | `(initial?: ContractMap)` | Create with optional initial map |
| `static fromJSON` | `(data: unknown): UIContractMap` | Parse and validate JSON input |
| `register` | `(target: string, entry: SelectorEntry): void` | Add a target. Throws if `isTestId` is true and selector lacks `data-testid`. |
| `resolve` | `(target: string): string` | Get CSS selector. Throws if target unknown. |
| `has` | `(target: string): boolean` | Check target exists |
| `targets` | `(): string[]` | List all target names |
| `getEntry` | `(target: string): SelectorEntry \| undefined` | Get full entry |
| `toJSON` | `(): ContractMap` | Export as plain object |
| `merge` | `(other: UIContractMap): void` | Merge another map (overwrites on conflict) |
| `size` | `number` (getter) | Number of registered targets |

### Types

```typescript
type SelectorEntry = {
  selector: string;
  description?: string;
  isTestId: boolean;  // defaults to true
};

type ContractMap = Record<string, SelectorEntry>;
```

## Naming Convention (Required)

**The Gherkin target name must match the `data-testid` value exactly.**

This is the foundational convention that makes automatic generation reliable. When you write Gherkin:

```gherkin
When I click login-btn
Then I should see dashboard-container
```

Your app must have:

```html
<button data-testid="login-btn">Log In</button>
<div data-testid="dashboard-container">...</div>
```

And the generated `contracts.json` will be:

```json
{
  "login-btn": { "selector": "[data-testid=login-btn]" },
  "dashboard-container": { "selector": "[data-testid=dashboard-container]" }
}
```

This 1:1 mapping means:
- `suite.json` is 100% generated from Gherkin — no manual edits needed
- `contracts.json` is 100% generated from the target names — no manual edits needed
- The only requirement is that the app uses `data-testid` attributes matching the Gherkin names

### Generating both files from Gherkin

```bash
qa-runner compile my-app.feature --base-url http://localhost:3000
```

This outputs ready-to-use `suite.json` and `contracts.json`. If your app follows the naming convention, you can run immediately:

```bash
qa-runner suite.json contracts.json
```

Or compile and run in one step:

```bash
qa-runner my-app.feature contracts.json
```

## Best Practices

1. **Use `data-testid` everywhere** — it decouples tests from visual styling
2. **Match Gherkin target names to `data-testid` values** — enables fully automatic file generation
3. **Use `kebab-case` for `data-testid` values** — consistent with the workspace's established HTML attribute naming convention
4. **Keep one contract map per app/domain** — merge them at runtime if needed
5. **Add descriptions** — they appear in error messages and help debugging
6. **Version your contract map** — treat it as a contract between frontend and QA
