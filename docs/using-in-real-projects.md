# Using QA Agent In Real Projects

QA Agent is normally installed as a development dependency. Teams use it in local development, pull-request checks, staging validation, and agent workflows. It is not usually bundled into the production application.

```bash
npm install -D @qutecoder/qa-intel
```

## Typical App Setup

Add feature files beside the application tests:

```text
tests/
  features/
    login.feature
    checkout.feature
    onboarding.feature
```

Run a feature against a local app:

```bash
npx qa-runner tests/features/login.feature --base-url http://localhost:3000
```

Or add package scripts:

```json
{
  "scripts": {
    "qa:login": "qa-runner tests/features/login.feature --base-url http://localhost:3000",
    "qa:smoke": "qa-runner tests/features/smoke.feature --base-url $STAGING_URL"
  }
}
```

## What Developers Write

Developers write user intent in strict Gherkin:

```gherkin
Feature: Login

Scenario: User signs in
  Given I navigate to "/login"
  When I type "dev@example.com" into the field "Email"
  And I type "correct horse battery staple" into the field "Password"
  And I click the button "Sign in"
  Then I should see the heading "Dashboard"
```

The compiler turns that into a structured `suite.json` with semantic locators. The runtime executes it through Playwright and returns JSON evidence.

## CI Usage

A CI job should start or point at an application URL, then run the QA feature set:

```bash
npm ci
npm run build
npx qa-runner tests/features/smoke.feature \
  --base-url "$STAGING_URL" \
  --results-db .qa-results/results.db \
  --artifact-dir .qa-results/artifacts
```

Store `.qa-results/` as a CI artifact when debugging failures. Do not commit it.

## Agent Workflow

QA Agent is designed so coding agents can validate work without scraping terminal prose:

1. An agent creates or updates a `.feature` file for the intended behavior.
2. `qa-runner` compiles and runs it.
3. The agent reads JSON output, screenshots, network logs, console logs, and failure hints.
4. A second agent can query SQLite history through `ResultStore`.
5. The fixing agent changes the app and reruns the same feature as proof.

Programmatic access:

```ts
import { ResultStore, runSuiteTool } from "@qutecoder/qa-intel";

const result = await runSuiteTool({
  suitePath: "tests/features/login.feature",
  baseUrl: "http://localhost:3000",
});

const store = new ResultStore(".qa-results/results.db");
const latest = store.getLatestRun();
store.close();
```

## When It Ships With A Product

Most apps should keep QA Agent in `devDependencies`.

Ship it as a production dependency only if the product itself runs QA automation for users, such as a hosted testing platform, an internal validation dashboard, or an agent product that exposes QA Agent workflows at runtime.

## Practical Tips

- Prefer semantic targets: `button`, `field`, `heading`, `link`, `alert`.
- Use `testid:` only when accessible labels are not stable enough.
- Keep feature files small enough that a failure points at one user journey.
- Use seeded test users and fixtures.
- Avoid real credentials and private production data.
- Persist SQLite results in CI when agents need to compare failures over time.

