# QA Agent: AI Test Generation Guidelines

This document provides guidelines and a pre-formatted LLM prompt you can use to generate Gherkin tests for your application using large language models.

## Guidelines for Generating Tests with AI

The QA Agent framework separates **test logic** from **UI selectors** via the contract map. Tests reference logical names (`targetRef`) rather than CSS selectors, so LLMs can write specifications without perfect DOM visibility.

When asking an AI to write your tests, keep these principles in mind:

1. **Provide Context**: The AI needs to understand the *purpose* of the page. Providing HTML snippets, component files, or a list of `data-testid` attributes will yield accurate `contracts.json`.
2. **Use kebab-case Names**: Target names in Gherkin use `kebab-case` (e.g., `login-button`, `email-input`). These map 1:1 to `data-testid` attributes.
3. **Use All Step Types**: The framework supports 6 step types (`navigate`, `click`, `type`, `select`, `wait`, `request`) and 12 assertion types. Use the full range.
4. **Assert Everything**: Every scenario should include assertions. The framework validates both UI state and API responses.

---

## The Generation Prompt

Copy the prompt block below and replace the placeholders `[...]` with your application's specifics.

<details>
<summary>Click here to view and copy the prompt</summary>

```text
You are an expert SDET and QA Engineer. I am using a custom AI-driven QA testing framework that separates test logic from UI selectors via a contract map.

I need you to generate two things for a new feature:
1. A **Gherkin `.feature` file** defining the test scenarios.
2. A **`contracts.json`** file mapping the logical names used in the Gherkin to actual CSS selectors.

### Framework Rules:

1. **Target Resolution**: Tests reference abstract logical names using kebab-case (e.g., `login-button`, `email-input`), not raw CSS selectors.

2. **Supported Action Steps** (use these exact forms):
   - `Given I navigate to "<url>"`
   - `When I click <target-name>`
   - `When I type "<value>" into <target-name>`
   - `When I select "<value>" in <target-name>`
   - `When I wait for <target-name>`
   - `When I wait <milliseconds>ms`
   - `When I GET "<url>"`
   - `When I POST "<url>" with body '<json>'`
   - `When I PUT "<url>" with body '<json>'`
   - `When I PATCH "<url>" with body '<json>'`
   - `When I DELETE "<url>"`

3. **Supported Assertion Steps** (use these exact forms):
   - `Then I should see <target-name>`
   - `Then I should not see <target-name>`
   - `Then <target-name> should exist`
   - `Then <target-name> should have text "<value>"`
   - `Then <target-name> should contain text "<value>"`
   - `Then the url should equal "<value>"`
   - `Then the url should contain "<value>"`
   - `Then the API response to "<url>" should have status <code>`
   - `Then the API response to "<url>" should contain "<value>"`
   - `Then the API response to "<url>" field "<path>" should equal "<value>"`
   - `Then the response header "<header>" from "<url>" should contain "<value>"`
   - `Then requests to "<url>" should include trace ID`

### The Feature to Test:
- **App/Feature Name**: [INSERT FEATURE NAME]
- **Base URL**: [INSERT BASE URL, e.g., http://localhost:3000]
- **Key Flows to Test**:
  1. [e.g., Successful registration with valid data]
  2. [e.g., Error message shown when email is already in use]
- **DOM/UI Context (Optional but recommended)**:
  [INSERT RELEVANT HTML SNIPPETS, REACT COMPONENTS, OR A LIST OF DATA-TESTIDS]

### Output Requirements:

Generate the following 2 files:

1. **[Feature Name].feature**:
   - Use standard Gherkin syntax with ONLY the supported steps above.
   - Use kebab-case for target names (e.g., `login-button`, `email-input`).
   - Do not wrap logical target names in quotes.
   - Tag scenarios with relevant labels (e.g., `@auth`, `@api`, `@smoke`).

2. **contracts.json**:
   - A JSON object mapping every logical name to a CSS selector (prefer `[data-testid=...]`).
   - Example: `{ "login-button": { "selector": "[data-testid=login-button]", "description": "Login submit button" } }`
```
</details>
