/**
 * End-to-end compiler + registry integration (plan §14.4).
 *
 * Builds a fixture "project source" tree under a tmp dir, scans it with
 * buildRegistry(), and compiles feature-file snippets that reference:
 *   (a) real testids           → clean compile
 *   (b) typo'd testids         → compile error with top-3 suggestions
 *   (c) hallucinated testids   → compile error
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { compileGherkin } from "../dist/modules/dsl/index.js";
import { buildRegistry } from "../dist/modules/registry/index.js";

// ─── Fixture tree ─────────────────────────────────────────────────────────

let TMP_ROOT;
let REGISTRY;

before(async () => {
  TMP_ROOT = mkdtempSync(join(tmpdir(), "qa-registry-fixture-"));
  const src = join(TMP_ROOT, "src");
  mkdirSync(src, { recursive: true });

  // Fixture component A: login form.
  writeFileSync(
    join(src, "LoginForm.tsx"),
    `export function LoginForm() {
  return (
    <form>
      <input data-testid="login-username" />
      <input data-testid="login-password" />
      <a data-testid="login-forgot" href="/forgot">Forgot?</a>
      <button data-testid="login-submit">Sign in</button>
    </form>
  );
}
`,
    "utf-8",
  );

  // Fixture component B: register form (adds more testids for suggestion variety).
  writeFileSync(
    join(src, "RegisterForm.tsx"),
    `export function RegisterForm() {
  return (
    <form>
      <input data-testid="register-email" />
      <input data-testid="register-password" />
      <button data-testid="register-submit">Register</button>
    </form>
  );
}
`,
    "utf-8",
  );

  REGISTRY = await buildRegistry({
    roots: [src],
    cache: null, // no cache needed for tests
  });
});

after(() => {
  if (TMP_ROOT) rmSync(TMP_ROOT, { recursive: true, force: true });
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Compiler + registry — clean compile for real testids", () => {
  it("bare-grammar feature with all-real testids compiles clean", () => {
    const g = `
Feature: Login
Scenario: See login form
  Given I navigate to "/"
  When I click login-submit
  Then I should see login-username
  And I should see login-password
`;
    const { contracts, errors, warnings } = compileGherkin(g, {
      registry: REGISTRY,
      sourceFile: "/fixtures/login.feature",
    });
    assert.equal(
      errors.length,
      0,
      `Unexpected errors: ${JSON.stringify(errors, null, 2)}`,
    );
    assert.equal(warnings.length, 0);
    assert.equal(contracts.length, 1);
  });

  it("declarative-grammar feature with all-real testids compiles clean", () => {
    const g = `
Feature: Register
Scenario: Register a new user
  Given I navigate to "/register"
  When I type "user@example.com" into the input register-email
  And I click the button register-submit
  Then I should see the input register-email
`;
    const { contracts, errors, warnings } = compileGherkin(g, {
      registry: REGISTRY,
      sourceFile: "/fixtures/register.feature",
    });
    assert.equal(
      errors.length,
      0,
      `Unexpected errors: ${JSON.stringify(errors, null, 2)}`,
    );
    assert.equal(warnings.length, 0);
    assert.equal(contracts.length, 1);
  });
});

describe("Compiler + registry — typo produces compile error with top-3 suggestions", () => {
  it("typo'd testid in a click step surfaces an error with suggestions", () => {
    const g = `Feature: Login
Scenario: Typo
  Given I navigate to "/"
  When I click the button login-sumbit
  Then I should see the input login-username
`;
    const { errors } = compileGherkin(g, {
      registry: REGISTRY,
      sourceFile: "/fixtures/login.feature",
    });
    assert.ok(errors.length >= 1, "Expected at least one compile error");

    // Find the error for the typo.
    const typoError = errors.find((e) => e.message.includes("login-sumbit"));
    assert.ok(
      typoError,
      `Expected an error naming 'login-sumbit': ${JSON.stringify(errors)}`,
    );

    // Source-locator format per §6.3.
    assert.match(typoError.message, /not found in component source/);
    assert.match(typoError.message, /at \/fixtures\/login\.feature:4/);
    assert.match(
      typoError.message,
      /Step: "When I click the button login-sumbit"/,
    );
    assert.match(typoError.message, /Did you mean:/);

    // The primary candidate `login-submit` must appear (distance 1 typo).
    assert.match(typoError.message, /login-submit/);

    // The error message lists up to 3 suggestions. With the fixture's
    // "login-*" testids, at least login-submit + at most two others
    // should appear.
    const bulletCount = (typoError.message.match(/^\s*-\s/gm) ?? []).length;
    assert.ok(
      bulletCount >= 1 && bulletCount <= 3,
      `Expected 1-3 suggestion bullets, got ${bulletCount}`,
    );
  });
});

describe("Compiler + registry — hallucinated testid produces compile error", () => {
  it("a totally made-up testid produces an error (possibly with no suggestions)", () => {
    const g = `Feature: Hallucination
Scenario: Made-up
  Given I navigate to "/"
  When I click the button zzzzz-nonexistent-xyzzy
  Then I should see the input login-username
`;
    const { errors } = compileGherkin(g, {
      registry: REGISTRY,
      sourceFile: "/fixtures/bad.feature",
    });
    assert.ok(errors.length >= 1, "Expected at least one compile error");
    const hallucinationError = errors.find((e) =>
      e.message.includes("zzzzz-nonexistent-xyzzy"),
    );
    assert.ok(
      hallucinationError,
      "Expected error naming the hallucinated testid",
    );
    assert.match(hallucinationError.message, /not found in component source/);
  });
});

describe("Compiler + registry — intermixed And-step-and-assertion line mapping", () => {
  it("error points at the correct source line when a typo appears on an `And` step following a `Then` assertion", () => {
    // Line layout (1-indexed):
    //   1: Feature: Intermixed
    //   2: Scenario: Mixed
    //   3:   Given I navigate to "/"
    //   4:   When I click the button login-submit
    //   5:   Then I should see the input login-username
    //   6:   And I click the button login-nxet          ← typo on line 6
    //   7:   Then the url should equal "/next"
    //
    // A cursor-based scheme that consumed stepLines in source order while
    // draining steps-first-then-assertions from the contract would
    // misattribute the typo to line 7 (the next "step-shaped" line in
    // source order). With per-item line metadata, we expect the error
    // to name line 6 exactly.
    const g = `Feature: Intermixed
Scenario: Mixed
  Given I navigate to "/"
  When I click the button login-submit
  Then I should see the input login-username
  And I click the button login-nxet
  Then the url should equal "/next"
`;
    const { errors } = compileGherkin(g, {
      registry: REGISTRY,
      sourceFile: "/fixtures/intermixed.feature",
    });
    const typoError = errors.find((e) => e.message.includes("login-nxet"));
    assert.ok(
      typoError,
      `Expected an error naming 'login-nxet': ${JSON.stringify(errors, null, 2)}`,
    );
    // The line field MUST point at the `And` line (6), not the
    // following `Then` (7) or any earlier step.
    assert.equal(
      typoError.line,
      6,
      `Expected error.line === 6 (the And line), got ${typoError.line}`,
    );
    // The step text echoed in the message must be the `And` line, not
    // the `Then` line. The raw text from the parser is `trim()`-ed but
    // preserves the keyword.
    assert.match(
      typoError.message,
      /Step: "And I click the button login-nxet"/,
    );
    // And the per-file locator must match the same line.
    assert.match(typoError.message, /intermixed\.feature:6/);
  });
});
