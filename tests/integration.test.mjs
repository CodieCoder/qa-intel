/**
 * Integration test: compile → run → query DB → verify
 *
 * This test exercises the full pipeline:
 * 1. Compiles a minimal Gherkin feature to a suite
 * 2. Runs the suite against a live server
 * 3. Queries the SQLite DB for persisted results
 * 4. Verifies all 13 tables contain expected data
 *
 * Requires: the admin app running on localhost:3002
 * Skip condition: if server is unreachable, test is skipped (not failed)
 *
 * Grammar coverage (per plan §14.1):
 *   - Bare-grammar scenario: `When I click login-submit` → step.kind === undefined
 *     and step.targetRef === "login-submit" (raw, unchanged).
 *   - Declarative-grammar scenario: `When I click the button login-submit` →
 *     step.kind === "button" and step.targetRef === "login-submit" (raw, NOT
 *     concatenated — per §6.2 of the migration plan).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { ResultStore } from "../dist/modules/store/result-store.js";
import { compileGherkin } from "../dist/modules/dsl/index.js";
import { buildRegistryFromEntries } from "../dist/modules/registry/index.js";

const BASE_URL = "http://localhost:3002";
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

function serverIsReachable() {
  try {
    execSync(`curl -s -o /dev/null -w "%{http_code}" ${BASE_URL}`, {
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

describe("Integration: compile → run → query DB", () => {
  let tmpDir;
  let dbPath;
  let store;
  let skipped = false;

  before(() => {
    if (!serverIsReachable()) {
      skipped = true;
      return;
    }

    tmpDir = mkdtempSync(join(tmpdir(), "qa-integration-"));
    dbPath = join(tmpDir, "results.db");

    // Write a minimal 2-scenario Gherkin feature
    const feature = `
Feature: Integration Test — login form

@smoke
Scenario: Home page shows login form
  Given I navigate to "/"
  Then I should see login-username
  And I should see login-submit

@smoke
Scenario: Login form rejects empty submit
  Given I navigate to "/"
  When I click login-submit
  Then I should see login-username
`;
    writeFileSync(join(tmpDir, "test.feature"), feature);

    // Compile
    const compileOut = execSync(
      `bash .agents/skills/qa-testing/compile.sh ${join(tmpDir, "test.feature")} --base-url ${BASE_URL} --out-dir ${tmpDir}`,
      { cwd: REPO_ROOT, timeout: 30000, encoding: "utf-8" },
    );
    const compileResult = JSON.parse(compileOut);
    assert.ok(
      compileResult.ok,
      `Compile failed: ${JSON.stringify(compileResult)}`,
    );

    // Run with DB persistence
    const runOut = execSync(
      `node packages/qa-agent/dist/cli.js ${join(tmpDir, "suite.json")} ${join(tmpDir, "contracts.json")} --base-url ${BASE_URL} --results-db ${dbPath}`,
      { cwd: REPO_ROOT, timeout: 60000, encoding: "utf-8" },
    );
    const runResult = JSON.parse(runOut);
    assert.ok(runResult.ok, `Run failed: ${JSON.stringify(runResult)}`);

    store = new ResultStore(dbPath);
  });

  after(() => {
    if (store) store.close();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it(
    "persists a full run with all tables populated",
    { skip: skipped ? "Server not reachable" : false },
    () => {
      // ── runs table ──────────────────────────────────────────────
      const latest = store.getLatestRun();
      assert.ok(latest, "Should have a run in the DB");
      assert.equal(latest.status, "passed");
      assert.equal(latest.summary.totalContracts, 2);
      assert.equal(latest.summary.passed, 2);

      // ── contracts table ─────────────────────────────────────────
      assert.equal(latest.contracts.length, 2);
      assert.equal(latest.contracts[0].intent, "home_page_shows_login_form");
      assert.equal(latest.contracts[0].status, "passed");

      // ── steps table + step context ──────────────────────────────
      const c1 = latest.contracts[1]; // "login form rejects empty submit"
      assert.ok(c1.steps.length >= 2);
      // The click step should have targetRef and selector
      const clickStep = c1.steps.find((s) => s.type === "click");
      assert.ok(clickStep, "Should have a click step");
      assert.equal(clickStep.targetRef, "login-submit");
      assert.equal(clickStep.selector, "[data-testid=login-submit]");

      // ── assertions table + diagnostics ──────────────────────────
      const c0 = latest.contracts[0];
      assert.ok(c0.assertions.length >= 2);
      const visibleAssertion = c0.assertions.find(
        (a) => a.targetRef === "login-username",
      );
      assert.ok(visibleAssertion);
      assert.equal(visibleAssertion.status, "passed");
      assert.ok(visibleAssertion.diagnostics?.selector);

      // ── network_logs + network_log_headers ───────────────────────
      const netLogs = store.getNetworkLogs(latest.runId, 0);
      assert.ok(netLogs.length > 0, "Should have network logs for contract 0");
      // At minimum, there should be a GET to the base URL
      const getRoot = netLogs.find(
        (n) => n.method === "GET" && n.url.includes(BASE_URL),
      );
      assert.ok(getRoot, "Should have a GET to the base URL");
      // Headers should be populated (individual rows in network_log_headers)
      assert.ok(getRoot.responseHeaders, "Should have response headers");
      assert.ok(Object.keys(getRoot.responseHeaders).length > 0);

      // ── console_logs ────────────────────────────────────────────
      const allConsoleLogs = store.getRunConsoleLogs(latest.runId);
      // Next.js dev server typically emits HMR connected + React DevTools messages
      assert.ok(
        allConsoleLogs.length > 0,
        "Should have at least one console log",
      );

      // ── screenshots ─────────────────────────────────────────────
      const screenshots = store.getStepScreenshots(
        latest.runId,
        c0.steps[0].stepId,
      );
      assert.ok(screenshots, "Should have screenshots");
      // At least one of before/after should exist
      assert.ok(
        screenshots.beforeScreenshot || screenshots.afterScreenshot,
        "Should have at least one screenshot path",
      );

      // ── schema version ──────────────────────────────────────────
      assert.equal(store.getSchemaVersion(), 2);

      // ── listRuns ────────────────────────────────────────────────
      const runs = store.listRuns(10);
      assert.equal(runs.length, 1);
      assert.equal(runs[0].status, "passed");

      console.log(
        "  PASS: Full integration pipeline verified (compile → run → DB query)",
      );
    },
  );
});

// ─── Grammar shape — in-process compile (no server needed) ────────────────
//
// Plan §14.1. These tests drive the compiler directly (not the CLI) so
// they run without a live server. We stub the registry with just the two
// testids referenced in the feature.
describe("Integration: grammar shape (bare vs declarative)", () => {
  const stubRegistry = buildRegistryFromEntries([
    {
      testid: "login-submit",
      isGlob: false,
      sourceFile: "/stub/LoginForm.tsx",
      line: 1,
      column: 1,
    },
    {
      testid: "login-username",
      isGlob: false,
      sourceFile: "/stub/LoginForm.tsx",
      line: 2,
      column: 1,
    },
  ]);

  it("bare-grammar produces raw targetRef and undefined kind", () => {
    const gherkin = `
Feature: Bare grammar
Scenario: Click a button
  Given I navigate to "/"
  When I click login-submit
  Then I should see login-username
`;
    const { contracts, errors } = compileGherkin(gherkin, {
      registry: stubRegistry,
    });
    assert.equal(
      errors.length,
      0,
      `Unexpected errors: ${JSON.stringify(errors)}`,
    );
    assert.equal(contracts.length, 1);
    const clickStep = contracts[0].steps.find((s) => s.type === "click");
    assert.ok(clickStep, "Expected a click step");
    assert.equal(clickStep.targetRef, "login-submit");
    assert.equal(clickStep.kind, undefined);

    const visibleAssertion = contracts[0].assertions.find(
      (a) => a.type === "visible",
    );
    assert.ok(visibleAssertion);
    assert.equal(visibleAssertion.targetRef, "login-username");
    assert.equal(visibleAssertion.kind, undefined);
  });

  it("declarative grammar produces raw targetRef and populated kind", () => {
    const gherkin = `
Feature: Declarative grammar
Scenario: Click the button
  Given I navigate to "/"
  When I click the button login-submit
  Then I should see the input login-username
`;
    const { contracts, errors, warnings } = compileGherkin(gherkin, {
      registry: stubRegistry,
    });
    assert.equal(
      errors.length,
      0,
      `Unexpected errors: ${JSON.stringify(errors)}`,
    );
    assert.equal(
      warnings.length,
      0,
      `Unexpected warnings: ${JSON.stringify(warnings)}`,
    );
    assert.equal(contracts.length, 1);
    const clickStep = contracts[0].steps.find((s) => s.type === "click");
    assert.ok(clickStep, "Expected a click step");
    // Critical: targetRef is raw testid, NOT concatenated with kind (§6.2).
    assert.equal(clickStep.targetRef, "login-submit");
    assert.equal(clickStep.kind, "button");

    const visibleAssertion = contracts[0].assertions.find(
      (a) => a.type === "visible",
    );
    assert.ok(visibleAssertion);
    assert.equal(visibleAssertion.targetRef, "login-username");
    assert.equal(visibleAssertion.kind, "input");
  });
});
