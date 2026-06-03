import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ResultStore } from "../dist/modules/store/result-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ─── Test 1: Full roundtrip — save RunResult, read back, verify all tables ──

describe("ResultStore: normalized table roundtrip", () => {
  let store;
  let dbDir;

  before(() => {
    dbDir = mkdtempSync(join(tmpdir(), "qa-store-test-"));
    store = new ResultStore(join(dbDir, "test.db"));
  });

  after(() => {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("saves and reads a full RunResult with all normalized tables", () => {
    const runResult = {
      runId: "run-001",
      traceId: "trace-001",
      status: "failed",
      summary: { totalContracts: 1, passed: 0, failed: 1 },
      contracts: [
        {
          intent: "login_with_valid_credentials",
          status: "failed",
          durationMs: 2500,
          steps: [
            {
              stepId: "trace-001-c0-step-0",
              type: "navigate",
              status: "passed",
              durationMs: 800,
              artifacts: {
                beforeScreenshot: "/abs/path/step-0-before.png",
                afterScreenshot: "/abs/path/step-0-after.png",
              },
            },
            {
              stepId: "trace-001-c0-step-1",
              type: "type",
              status: "passed",
              durationMs: 300,
              targetRef: "login-email",
              selector: "[data-testid=login-email]",
              value: "admin@test.com",
              artifacts: {
                beforeScreenshot: "/abs/path/step-1-before.png",
                afterScreenshot: "/abs/path/step-1-after.png",
              },
            },
            {
              stepId: "trace-001-c0-step-2",
              type: "click",
              status: "failed",
              durationMs: 5000,
              targetRef: "login-submit",
              selector: "[data-testid=login-submit]",
              error: {
                type: "ELEMENT_NOT_FOUND",
                message: "element not found within 5000ms",
                details: { attemptedSelector: "[data-testid=login-submit]", retries: 3 },
              },
              artifacts: {
                beforeScreenshot: "/abs/path/step-2-before.png",
                afterScreenshot: "/abs/path/step-2-after.png",
                domSnapshot: "<html><body>...</body></html>",
              },
            },
          ],
          assertions: [
            {
              assertionId: "trace-001-assert-0",
              domain: "ui",
              type: "visible",
              targetRef: "dashboard-container",
              status: "failed",
              expected: true,
              actual: false,
              diagnostics: {
                selector: "[data-testid=dashboard-container]",
                found: false,
              },
            },
            {
              assertionId: "trace-001-assert-1",
              domain: "api",
              type: "status_code",
              endpointRef: "/api/auth/login",
              status: "passed",
              expected: { status: 200 },
              actual: { status: 200, body: "token-abc" },
            },
          ],
          summary: { passed: 1, failed: 2 },
          failure: {
            layer: "ui",
            rootCause: "element not found within 5000ms",
            causedByStep: "trace-001-c0-step-2",
          },
          failures: [
            {
              intent: "login_with_valid_credentials",
              layer: "ui",
              issue: "element not found within 5000ms",
              location: "step: click (login-submit)",
              fixHints: [
                {
                  type: "frontend",
                  suggestion: 'Add element with data-testid="login-submit"',
                  target: { file: "src/components/LoginForm.tsx", function: "LoginForm" },
                },
                {
                  type: "test",
                  suggestion: "Check that the targetRef matches the actual data-testid",
                },
              ],
            },
          ],
        },
      ],
      failures: [
        {
          intent: "login_with_valid_credentials",
          layer: "ui",
          issue: "element not found within 5000ms",
          location: "step: click (login-submit)",
          fixHints: [
            {
              type: "frontend",
              suggestion: 'Add element with data-testid="login-submit"',
              target: { file: "src/components/LoginForm.tsx", function: "LoginForm" },
            },
            {
              type: "test",
              suggestion: "Check that the targetRef matches the actual data-testid",
            },
          ],
        },
      ],
    };

    store.saveRun(runResult);

    const loaded = store.getRun("run-001");
    assert.ok(loaded);
    assert.equal(loaded.runId, "run-001");
    assert.equal(loaded.status, "failed");
    assert.equal(loaded.summary.totalContracts, 1);

    const c = loaded.contracts[0];
    assert.equal(c.steps.length, 3);

    // Step 1 — step context round-trips
    const s1 = c.steps[1];
    assert.equal(s1.targetRef, "login-email");
    assert.equal(s1.selector, "[data-testid=login-email]");
    assert.equal(s1.value, "admin@test.com");

    // Step 2 — error details from key-value table (no JSON)
    const s2 = c.steps[2];
    assert.ok(s2.error);
    assert.equal(s2.error.type, "ELEMENT_NOT_FOUND");
    assert.equal(s2.error.message, "element not found within 5000ms");
    assert.ok(s2.error.details);
    assert.equal(s2.error.details.attemptedSelector, "[data-testid=login-submit]");
    assert.equal(s2.error.details.retries, 3); // number round-trips via parseScalar
    assert.equal(s2.artifacts.domSnapshot, "<html><body>...</body></html>");

    // Assertion 0 — expected/actual from key-value tables
    const a0 = c.assertions[0];
    assert.equal(a0.status, "failed");
    assert.equal(a0.expected, true); // primitive round-trips via _value key
    assert.equal(a0.actual, false);
    assert.ok(a0.diagnostics);
    assert.equal(a0.diagnostics.selector, "[data-testid=dashboard-container]");
    assert.equal(a0.diagnostics.found, false);

    // Assertion 1 — object expected/actual round-trips via dot-notation flatten
    const a1 = c.assertions[1];
    assert.equal(a1.status, "passed");
    assert.deepEqual(a1.expected, { status: 200 });
    assert.deepEqual(a1.actual, { status: 200, body: "token-abc" });

    // Fix hints — normalized rows
    const f = c.failures[0];
    assert.equal(f.fixHints.length, 2);
    assert.equal(f.fixHints[0].type, "frontend");
    assert.equal(f.fixHints[0].target?.file, "src/components/LoginForm.tsx");

    // getFailedSteps
    const failedSteps = store.getFailedSteps("run-001");
    assert.equal(failedSteps.length, 1);
    assert.equal(failedSteps[0].stepId, "trace-001-c0-step-2");
    assert.equal(failedSteps[0].targetRef, "login-submit");

    console.log("  PASS: Full roundtrip with all normalized tables verified");
  });
});

// ─── Test 2: Network logs with normalized headers + console logs ─────────────

describe("ResultStore: network headers normalized + console logs", () => {
  let store;
  let dbDir;

  before(() => {
    dbDir = mkdtempSync(join(tmpdir(), "qa-store-test-"));
    store = new ResultStore(join(dbDir, "test.db"));
  });

  after(() => {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("persists headers in child table and queries network/console logs", () => {
    const runResult = {
      runId: "run-002",
      traceId: "trace-002",
      status: "passed",
      summary: { totalContracts: 1, passed: 1, failed: 0 },
      contracts: [
        {
          intent: "api_health_check",
          status: "passed",
          durationMs: 500,
          steps: [
            {
              stepId: "trace-002-c0-step-0",
              type: "request",
              status: "passed",
              durationMs: 200,
              artifacts: {},
            },
            {
              stepId: "trace-002-c0-step-1",
              type: "navigate",
              status: "passed",
              durationMs: 300,
              artifacts: {},
            },
          ],
          assertions: [
            {
              assertionId: "trace-002-assert-0",
              domain: "api",
              type: "status_code",
              endpointRef: "/api/health",
              status: "passed",
              expected: { status: 200 },
              actual: { status: 200 },
            },
          ],
          summary: { passed: 1, failed: 0 },
        },
      ],
      failures: [],
    };

    const networkLogs = new Map();
    networkLogs.set(0, [
      {
        method: "GET",
        url: "http://localhost:3002/api/health",
        status: 200,
        requestHeaders: { "X-Request-Id": "trace-002", "Accept": "application/json" },
        responseHeaders: { "content-type": "application/json", "x-request-id": "trace-002" },
        requestBody: undefined,
        responseBody: { status: "ok", uptime: 12345 },
        duration: 45,
      },
      {
        method: "POST",
        url: "http://localhost:3002/api/auth/login",
        status: 200,
        requestHeaders: { "content-type": "application/json" },
        responseHeaders: { "content-type": "application/json", "set-cookie": "session=abc123" },
        requestBody: { email: "admin@test.com", password: "pass123" },
        responseBody: { token: "jwt-token-here", user: { id: 1, email: "admin@test.com" } },
        duration: 120,
      },
    ]);

    const consoleLogs = new Map();
    consoleLogs.set("trace-002-c0-step-0", [
      { level: "log", message: "Health check initiated", sourceUrl: "http://localhost:3002/app.js", lineNumber: 42 },
      { level: "warn", message: "Deprecation: use /api/v2/health" },
    ]);
    consoleLogs.set("trace-002-c0-step-1", [
      { level: "error", message: "Failed to load resource: net::ERR_FAILED" },
      { level: "pageerror", message: "Uncaught TypeError: Cannot read properties of undefined" },
    ]);

    store.saveRun(runResult, { networkLogs, consoleLogs });

    // ── Network logs ────────────────────────────────────────────────
    const netLogs = store.getNetworkLogs("run-002", 0);
    assert.equal(netLogs.length, 2);

    // GET /api/health — headers from normalized table
    assert.equal(netLogs[0].method, "GET");
    assert.equal(netLogs[0].status, 200);
    assert.ok(netLogs[0].requestHeaders);
    assert.equal(netLogs[0].requestHeaders["X-Request-Id"], "trace-002");
    assert.equal(netLogs[0].requestHeaders["Accept"], "application/json");
    assert.ok(netLogs[0].responseHeaders);
    assert.equal(netLogs[0].responseHeaders["content-type"], "application/json");
    assert.equal(netLogs[0].responseHeaders["x-request-id"], "trace-002");
    // Body still works (JSON TEXT)
    assert.deepEqual(netLogs[0].responseBody, { status: "ok", uptime: 12345 });

    // POST /api/auth/login — headers + bodies
    assert.equal(netLogs[1].method, "POST");
    assert.equal(netLogs[1].responseHeaders["set-cookie"], "session=abc123");
    assert.deepEqual(netLogs[1].requestBody, { email: "admin@test.com", password: "pass123" });
    assert.equal(netLogs[1].responseBody.token, "jwt-token-here");

    // getRunNetworkLogs
    const allNet = store.getRunNetworkLogs("run-002");
    assert.equal(allNet.get(0).length, 2);

    // ── Console logs ────────────────────────────────────────────────
    const step0Logs = store.getConsoleLogs("run-002", "trace-002-c0-step-0");
    assert.equal(step0Logs.length, 2);
    assert.equal(step0Logs[0].level, "log");
    assert.equal(step0Logs[0].message, "Health check initiated");
    assert.equal(step0Logs[0].sourceUrl, "http://localhost:3002/app.js");
    assert.equal(step0Logs[0].lineNumber, 42);

    const step1Logs = store.getConsoleLogs("run-002", "trace-002-c0-step-1");
    assert.equal(step1Logs.length, 2);
    assert.equal(step1Logs[1].level, "pageerror");

    const allLogs = store.getRunConsoleLogs("run-002");
    assert.equal(allLogs.length, 4);

    console.log("  PASS: Network headers normalized + console logs verified");
  });
});

// ─── Test 3: Schema versioning — auto-recreate on version mismatch ──────────

describe("ResultStore: schema versioning", () => {
  let dbDir;

  before(() => {
    dbDir = mkdtempSync(join(tmpdir(), "qa-store-test-"));
  });

  after(() => {
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("recreates the DB when schema version changes", () => {
    const dbPath = join(dbDir, "versioned.db");

    // Create store, save a run
    const store1 = new ResultStore(dbPath);
    assert.equal(store1.getSchemaVersion(), 2);

    store1.saveRun({
      runId: "run-old",
      traceId: "trace-old",
      status: "passed",
      summary: { totalContracts: 1, passed: 1, failed: 0 },
      contracts: [{
        intent: "old_test",
        status: "passed",
        durationMs: 100,
        steps: [{ stepId: "s0", type: "navigate", status: "passed", durationMs: 50, artifacts: {} }],
        assertions: [],
        summary: { passed: 1, failed: 0 },
      }],
      failures: [],
    });

    assert.ok(store1.getRun("run-old"));
    store1.close();

    // Manually corrupt the version to simulate an older schema
    const Database = require("better-sqlite3");
    const rawDb = new Database(dbPath);
    rawDb.prepare("UPDATE schema_version SET version = 1").run();
    rawDb.close();

    // Re-open — should detect version mismatch and recreate
    const store2 = new ResultStore(dbPath);
    assert.equal(store2.getSchemaVersion(), 2);

    // Old data should be gone (tables were dropped and recreated)
    const oldRun = store2.getRun("run-old");
    assert.equal(oldRun, null, "Old run should not exist after schema recreation");

    // Should work normally for new data
    store2.saveRun({
      runId: "run-new",
      traceId: "trace-new",
      status: "passed",
      summary: { totalContracts: 1, passed: 1, failed: 0 },
      contracts: [{
        intent: "new_test",
        status: "passed",
        durationMs: 100,
        steps: [{ stepId: "s0", type: "navigate", status: "passed", durationMs: 50, artifacts: {} }],
        assertions: [],
        summary: { passed: 1, failed: 0 },
      }],
      failures: [],
    });

    assert.ok(store2.getRun("run-new"));
    store2.close();

    console.log("  PASS: Schema versioning auto-recreate verified");
  });
});

// ─── Test 4: Retention policy — prune old runs ──────────────────────────────

describe("ResultStore: retention policy", () => {
  let store;
  let dbDir;

  before(() => {
    dbDir = mkdtempSync(join(tmpdir(), "qa-store-test-"));
    // maxRuns = 3 for testing
    store = new ResultStore(join(dbDir, "retention.db"), { maxRuns: 3 });
  });

  after(() => {
    store.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("prunes runs beyond maxRuns on each saveRun", () => {
    const makeRun = (id, idx) => ({
      runId: `run-${id}`,
      traceId: `trace-${id}`,
      status: "passed",
      summary: { totalContracts: 1, passed: 1, failed: 0 },
      contracts: [{
        intent: `test_${id}`,
        status: "passed",
        durationMs: 100,
        steps: [{ stepId: `s-${id}-0`, type: "navigate", status: "passed", durationMs: 50, artifacts: {} }],
        assertions: [],
        summary: { passed: 1, failed: 0 },
      }],
      failures: [],
    });

    // Save 5 runs (maxRuns = 3, so 2 should be pruned)
    for (let i = 1; i <= 5; i++) {
      store.saveRun(makeRun(i, i));
    }

    const runs = store.listRuns(100);
    assert.equal(runs.length, 3, "Should retain only 3 runs");

    // The oldest (run-1, run-2) should be pruned; newest (run-3, run-4, run-5) kept
    const runIds = runs.map(r => r.runId);
    assert.ok(!runIds.includes("run-1"), "run-1 should be pruned");
    assert.ok(!runIds.includes("run-2"), "run-2 should be pruned");
    assert.ok(runIds.includes("run-3"), "run-3 should be retained");
    assert.ok(runIds.includes("run-4"), "run-4 should be retained");
    assert.ok(runIds.includes("run-5"), "run-5 should be retained");

    // Verify cascade: child data for pruned runs should be gone
    assert.equal(store.getRun("run-1"), null);
    assert.equal(store.getRun("run-2"), null);
    assert.ok(store.getRun("run-5"));

    console.log("  PASS: Retention policy prune verified");
  });
});
