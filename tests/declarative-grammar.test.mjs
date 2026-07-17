import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileGherkin, safeParseTestSuite } from "../dist/modules/dsl/index.js";

function compile(gherkin) {
  return compileGherkin(gherkin);
}

describe("Gherkin compiler — semantic locators", () => {
  it("characterizes every supported built-in step and assertion form", () => {
    const g = `
Feature: Complete grammar
@smoke @complete
Scenario: Every built-in
  Given I navigate to "/start"
  When I click the button "Save"
  And I type "Ada" into the field "Name"
  And I select "Admin" in the field "Role"
  And I wait for the heading "Ready"
  And I wait 250ms
  And I check the checkbox "Terms"
  And I uncheck the checkbox "Terms"
  And I toggle the toggle "Notifications"
  And I upload "/tmp/avatar.png" into the file-input "Avatar"
  And I GET "/api/health"
  And I POST "/api/users" with body "{}"
  And I PUT "/api/users/1" with body "{}" and headers '{"X-Trace":"trace"}'
  Then the url should be "https://example.test/dashboard"
  And the url should contain "/dashboard"
  And the API response to "/api/health" should have status 200
  And the API response to "/api/users" should contain "Ada"
  And the API response to "/api/users" field "user.name" should equal "Ada"
  And the response header "content-type" from "/api/users" should contain "json"
  And requests to "/api/users" should include trace ID
  And I should see the heading "Dashboard"
  And I should not see the alert "Failure"
  And the alert "Warning" should not be visible
  And the heading "Dashboard" should have text "Dashboard"
  And the text "Greeting" should contain text "Hello"
  And the text "Ready" should exist
`;
    const { contracts, errors, warnings } = compile(g);

    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
    assert.equal(contracts.length, 1);
    assert.deepEqual(contracts[0].tags, ["smoke", "complete"]);
    assert.deepEqual(contracts[0].steps, [
      { type: "navigate", url: "/start" },
      { type: "click", locator: { strategy: "role", role: "button", name: "Save" } },
      { type: "type", locator: { strategy: "label", name: "Name" }, value: "Ada" },
      { type: "select", locator: { strategy: "label", name: "Role" }, value: "Admin" },
      { type: "wait", locator: { strategy: "role", role: "heading", name: "Ready" } },
      { type: "wait", timeout: 250 },
      { type: "check", locator: { strategy: "role", role: "checkbox", name: "Terms" } },
      { type: "uncheck", locator: { strategy: "role", role: "checkbox", name: "Terms" } },
      { type: "toggle", locator: { strategy: "role", role: "switch", name: "Notifications" } },
      { type: "upload", locator: { strategy: "label", name: "Avatar" }, value: "/tmp/avatar.png" },
      { type: "request", method: "GET", url: "/api/health" },
      { type: "request", method: "POST", url: "/api/users", body: "{}" },
      {
        type: "request",
        method: "PUT",
        url: "/api/users/1",
        body: "{}",
        headers: { "X-Trace": "trace" },
      },
    ]);
    assert.deepEqual(contracts[0].assertions.map((assertion) => assertion.type), [
      "url_equals",
      "url_contains",
      "status_code",
      "response_body_contains",
      "response_body_equals",
      "response_header_contains",
      "trace_id_present",
      "visible",
      "not_visible",
      "not_visible",
      "text_equals",
      "text_contains",
      "exists",
    ]);
  });

  it("compiles role, label, and text locators", () => {
    const g = `
Feature: Login
Scenario: Successful login
  Given I navigate to "/login"
  When I type "maac@example.com" into the field "Email"
  And I click the button "Log in"
  Then I should see the heading "Dashboard"
`;
    const { contracts, errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(warnings.length, 0, JSON.stringify(warnings));

    const [typeStep, clickStep] = contracts[0].steps.filter((s) => s.type !== "navigate");
    assert.deepEqual(typeStep.locator, { strategy: "label", name: "Email" });
    assert.equal(typeStep.value, "maac@example.com");
    assert.deepEqual(clickStep.locator, {
      strategy: "role",
      role: "button",
      name: "Log in",
    });

    assert.deepEqual(contracts[0].assertions[0].locator, {
      strategy: "role",
      role: "heading",
      name: "Dashboard",
    });
  });

  it("compiles explicit testid and css escape hatches", () => {
    const g = `
Feature: Escape hatches
Scenario: Uses explicit fallbacks
  Given I navigate to "/"
  When I click testid:login-submit
  Then css:[data-state='ready'] should exist
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.deepEqual(contracts[0].steps[1].locator, {
      strategy: "testid",
      id: "login-submit",
    });
    assert.deepEqual(contracts[0].assertions[0].locator, {
      strategy: "css",
      selector: "[data-state='ready']",
    });
  });

  it("compiles bare quoted targets as visible text locators", () => {
    const g = `
Feature: Text
Scenario: Click visible copy
  Given I navigate to "/"
  When I click "Start now"
  Then I should see "Welcome"
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.deepEqual(contracts[0].steps[1].locator, {
      strategy: "text",
      text: "Start now",
    });
    assert.deepEqual(contracts[0].assertions[0].locator, {
      strategy: "text",
      text: "Welcome",
    });
  });

  it("keeps URL and API assertions out of generic text parsing", () => {
    const g = `
Feature: Non UI
Scenario: URL and API assertions
  Given I navigate to "/dashboard"
  When I GET "/api/session"
  Then the url should contain "/dashboard"
  And the API response to "/api/session" should contain "active"
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.deepEqual(contracts[0].assertions.map((a) => a.type), [
      "url_contains",
      "response_body_contains",
    ]);
  });

  it("rejects old raw testid targets with migration guidance", () => {
    const g = `
Feature: Legacy
Scenario: Old raw target
  Given I navigate to "/"
  When I click login-submit
  Then I should see dashboard
`;
    const { contracts, errors } = compile(g);
    assert.equal(contracts.length, 0);
    assert.ok(errors.length >= 2);
    assert.match(errors[0].message, /Legacy raw target "login-submit"/);
    assert.match(errors[0].message, /testid:login-submit/);
  });

  it("warns for unknown semantic kinds while still compiling as text", () => {
    const g = `
Feature: Unknown kind
Scenario: Nonstandard kind
  Given I navigate to "/"
  When I click the widget "Revenue card"
  Then I should see the widget "Revenue card"
`;
    const { contracts, errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(contracts.length, 1);
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0].kind, "unknown-element-kind");
    assert.deepEqual(contracts[0].steps[1].locator, {
      strategy: "text",
      text: "Revenue card",
    });
  });

  it("reports an incomplete final scenario instead of dropping it", () => {
    const g = `
Feature: Mixed
Scenario: Complete
  Given I navigate to "/"
  Then I should see "Ready"
Scenario: Missing assertion
  Given I navigate to "/settings"
`;
    const { contracts, errors } = compile(g);
    assert.equal(contracts.length, 1);
    assert.equal(errors.length, 1, JSON.stringify(errors));
    assert.equal(errors[0].line, 6);
    assert.equal(errors[0].text, "Scenario: Missing assertion");
    assert.equal(errors[0].message, "Scenario has no assertions");
  });

  it("rejects steps before the first scenario", () => {
    const g = `
Feature: Orphan step
Given I navigate to "/"
Scenario: Real scenario
  Given I navigate to "/"
  Then I should see "Ready"
`;
    const { contracts, errors } = compile(g);
    assert.equal(contracts.length, 1);
    assert.equal(errors.length, 1, JSON.stringify(errors));
    assert.equal(errors[0].line, 3);
    assert.match(errors[0].message, /before any Scenario/);
  });

  it("rejects malformed request headers instead of dropping them", () => {
    const g = `
Feature: API
Scenario: Bad headers
  When I POST "/api/session" with body "{}" and headers '{"X-Trace": 123}'
  Then the API response to "/api/session" should have status 200
`;
    const { contracts, errors } = compile(g);
    assert.equal(contracts.length, 0);
    assert.equal(errors.length, 1, JSON.stringify(errors));
    assert.match(errors[0].message, /Could not parse/);
  });

  it("validates role locators against Playwright ARIA roles", () => {
    const valid = safeParseTestSuite({
      name: "valid",
      contracts: [
        {
          intent: "valid",
          steps: [
            { type: "navigate", url: "/" },
            {
              type: "click",
              locator: { strategy: "role", role: "button", name: "Save" },
            },
          ],
          assertions: [
            {
              type: "visible",
              locator: { strategy: "role", role: "heading", name: "Done" },
            },
          ],
        },
      ],
    });
    assert.equal(valid.success, true);

    const invalid = safeParseTestSuite({
      name: "invalid",
      contracts: [
        {
          intent: "invalid",
          steps: [
            {
              type: "click",
              locator: { strategy: "role", role: "not-a-role", name: "Save" },
            },
          ],
          assertions: [
            {
              type: "visible",
              locator: { strategy: "text", text: "Done" },
            },
          ],
        },
      ],
    });
    assert.equal(invalid.success, false);
  });
});
