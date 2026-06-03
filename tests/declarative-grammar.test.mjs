/**
 * Declarative-grammar compiler tests (plan §14.2).
 *
 * One test per step/assertion form in
 * `.agents/skills/qa-testing/references/gherkin-step-syntax.md`. For each
 * form we feed a one-scenario Gherkin snippet and assert the compiled
 * contract shape: the emitted `type`, `targetRef` (raw, not concatenated
 * with kind per §6.2), any `value`, and the `kind` metadata.
 *
 * Additional cases:
 *   - Recommended-kind step → empty warnings array.
 *   - Unrecognised-kind step → one `unknown-element-kind` warning with
 *     correct line number.
 *   - Multi-word kind (e.g. `file-input upload-doc`) → kind parsed as
 *     `file-input`, testid as `upload-doc`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileGherkin } from "../dist/modules/dsl/index.js";
import { buildRegistryFromEntries } from "../dist/modules/registry/index.js";

// Shared testid-rich registry — we stub enough entries for every form.
const REGISTRY = buildRegistryFromEntries(
  [
    "login-submit",
    "register-email",
    "loan-type",
    "terms-accepted",
    "marketing-opt-in",
    "dark-mode-toggle",
    "document-upload",
    "upload-doc",
    "borrower-amendment-list-page",
    "create-amendment-productId-error",
    "borrower-amendment-detail-heading",
    "amendments-table",
    "notification-success",
    "create-amendment-form",
    "loading-spinner",
  ].map((testid) => ({
    testid,
    isGlob: false,
    sourceFile: "/stub/Component.tsx",
    line: 1,
    column: 1,
  })),
);

function compile(gherkin) {
  return compileGherkin(gherkin, { registry: REGISTRY });
}

// ─── Per-form tests (14 forms, grouped by category) ────────────────────────

describe("Declarative grammar — Interaction steps (7 forms)", () => {
  it("click the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then I should see the button login-submit
`;
    const { contracts, errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(warnings.length, 0);
    const step = contracts[0].steps.find((s) => s.type === "click");
    assert.deepEqual(
      { type: step.type, targetRef: step.targetRef, kind: step.kind },
      { type: "click", targetRef: "login-submit", kind: "button" },
    );
  });

  it('type "{value}" into the {kind} {testid}', () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I type "user@example.com" into the input register-email
  Then I should see the input register-email
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "type");
    assert.equal(step.type, "type");
    assert.equal(step.targetRef, "register-email");
    assert.equal(step.value, "user@example.com");
    assert.equal(step.kind, "input");
  });

  it('select "{option}" in the {kind} {testid}', () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I select "personal" in the select loan-type
  Then I should see the select loan-type
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "select");
    assert.equal(step.type, "select");
    assert.equal(step.targetRef, "loan-type");
    assert.equal(step.value, "personal");
    assert.equal(step.kind, "select");
  });

  it("check the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I check the checkbox terms-accepted
  Then I should see the checkbox terms-accepted
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "check");
    assert.equal(step.targetRef, "terms-accepted");
    assert.equal(step.kind, "checkbox");
  });

  it("uncheck the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I uncheck the checkbox marketing-opt-in
  Then I should see the checkbox marketing-opt-in
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "uncheck");
    assert.equal(step.targetRef, "marketing-opt-in");
    assert.equal(step.kind, "checkbox");
  });

  it("toggle the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I toggle the toggle dark-mode-toggle
  Then I should see the toggle dark-mode-toggle
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "toggle");
    assert.equal(step.targetRef, "dark-mode-toggle");
    assert.equal(step.kind, "toggle");
  });

  it('upload "{path}" into the {kind} {testid}', () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I upload "/tmp/test.pdf" into the file-input document-upload
  Then I should see the file-input document-upload
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "upload");
    assert.equal(step.targetRef, "document-upload");
    assert.equal(step.value, "/tmp/test.pdf");
    assert.equal(step.kind, "file-input");
  });
});

describe("Declarative grammar — Wait (1 form with {kind})", () => {
  it("wait for the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I wait for the spinner loading-spinner
  Then I should see the spinner loading-spinner
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const step = contracts[0].steps.find((s) => s.type === "wait");
    assert.equal(step.targetRef, "loading-spinner");
    assert.equal(step.kind, "spinner");
  });
});

describe("Declarative grammar — UI assertions (6 forms)", () => {
  it("should see the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then I should see the page borrower-amendment-list-page
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const a = contracts[0].assertions.find((x) => x.type === "visible");
    assert.equal(a.targetRef, "borrower-amendment-list-page");
    assert.equal(a.kind, "page");
  });

  it("should not see the {kind} {testid}", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then I should not see the error create-amendment-productId-error
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const a = contracts[0].assertions.find((x) => x.type === "not_visible");
    assert.equal(a.targetRef, "create-amendment-productId-error");
    assert.equal(a.kind, "error");
  });

  it("the {kind} {testid} should exist", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then the table amendments-table should exist
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const a = contracts[0].assertions.find((x) => x.type === "exists");
    assert.equal(a.targetRef, "amendments-table");
    assert.equal(a.kind, "table");
  });

  it('the {kind} {testid} should have text "{...}"', () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then the heading borrower-amendment-detail-heading should have text "Amendment #1"
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const a = contracts[0].assertions.find((x) => x.type === "text_equals");
    assert.equal(a.targetRef, "borrower-amendment-detail-heading");
    assert.equal(a.value, "Amendment #1");
    assert.equal(a.kind, "heading");
  });

  it('the {kind} {testid} should contain text "{...}"', () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then the toast notification-success should contain text "Amendment submitted"
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const a = contracts[0].assertions.find((x) => x.type === "text_contains");
    assert.equal(a.targetRef, "notification-success");
    assert.equal(a.value, "Amendment submitted");
    assert.equal(a.kind, "toast");
  });

  it("the {kind} {testid} should not be visible", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then the form create-amendment-form should not be visible
`;
    const { contracts, errors } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    const a = contracts[0].assertions.find((x) => x.type === "not_visible");
    assert.equal(a.targetRef, "create-amendment-form");
    assert.equal(a.kind, "form");
  });
});

// ─── Additional cases per plan §14.2 ───────────────────────────────────────

describe("Declarative grammar — kind metadata semantics", () => {
  it("recommended kind compiles clean with empty warnings[]", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the button login-submit
  Then I should see the button login-submit
`;
    const { errors, warnings } = compile(g);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });

  it("unrecognised kind produces one unknown-element-kind warning with correct line", () => {
    // Line 1 is the leading blank, then Feature line at 2, Scenario at 3,
    // Given at 4, When at 5, Then at 6. The problematic step is on line 5.
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the widget login-submit
  Then I should see the button login-submit
`;
    const { errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(warnings.length, 1);
    const w = warnings[0];
    assert.equal(w.kind, "unknown-element-kind");
    assert.equal(w.line, 5);
    // The `text` field echoes the original step line (trimmed).
    assert.match(w.text, /When I click the widget login-submit/);
    // Message names the offending kind.
    assert.match(w.message, /"widget"/);
  });

  it("check/uncheck/toggle/upload steps emit one unimplemented-step-type warning each", () => {
    // Each of these step types is parseable (schema + grammar complete)
    // but not yet wired into action-engine.ts. The compiler surfaces a
    // warning per occurrence so suite authors aren't surprised at
    // runtime. Line numbers are 1-indexed with a leading blank at line 1.
    const g = `
Feature: X
Scenario: All four new step types
  Given I navigate to "/"
  When I check the checkbox terms-accepted
  And I uncheck the checkbox marketing-opt-in
  And I toggle the toggle dark-mode-toggle
  And I upload "/tmp/test.pdf" into the file-input document-upload
  Then I should see the checkbox terms-accepted
`;
    const { errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));

    const unimplemented = warnings.filter(
      (w) => w.kind === "unimplemented-step-type",
    );
    assert.equal(
      unimplemented.length,
      4,
      `Expected one warning per step (check/uncheck/toggle/upload), got ${unimplemented.length}: ${JSON.stringify(unimplemented, null, 2)}`,
    );
    // Every warning mentions the step type it came from.
    for (const stepType of ["check", "uncheck", "toggle", "upload"]) {
      assert.ok(
        unimplemented.some((w) => w.message.includes(`"${stepType}"`)),
        `Expected a warning for step type "${stepType}"`,
      );
    }
  });

  it("check step compiles with unimplemented-step-type warning", () => {
    const g = `
Feature: X
Scenario: Checkbox only
  Given I navigate to "/"
  When I check the checkbox terms-accepted
  Then I should see the checkbox terms-accepted
`;
    const { contracts, errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(contracts.length, 1);
    assert.ok(
      warnings.some((w) => w.kind === "unimplemented-step-type"),
      `Expected at least one unimplemented-step-type warning, got ${JSON.stringify(warnings, null, 2)}`,
    );
  });

  it("multi-word kind — `file-input upload-doc` parses kind as `file-input`", () => {
    const g = `
Feature: X
Scenario: Y
  Given I navigate to "/"
  When I click the file-input upload-doc
  Then I should see the file-input upload-doc
`;
    const { contracts, errors, warnings } = compile(g);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    // file-input is in the recommended vocabulary, so no warning.
    assert.equal(warnings.length, 0);
    const step = contracts[0].steps.find((s) => s.type === "click");
    assert.equal(step.kind, "file-input");
    assert.equal(step.targetRef, "upload-doc");
  });
});
