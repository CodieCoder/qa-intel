import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createContractResult,
  createRunResult,
  mapAssertionEvaluation,
  mapStepEvent,
} from "../dist/modules/results/mappers.js";
import {
  ContractResultSchema,
  RunResultSchema,
} from "../dist/modules/results/schema.js";

describe("canonical result mappers", () => {
  it("maps an action event and artifact references without changing fields", () => {
    const result = mapStepEvent({
      stepId: "trace-step-0",
      event: {
        timestamp: 1,
        type: "click",
        targetRef: "button \"Save\"",
        value: "value",
        result: "failed",
        duration: 42,
        selector: "button \"Save\"",
        network: [],
        error: "Element not found",
        errorDetails: { locatorDiagnostics: { matchedCount: 0 } },
      },
      errorType: "ELEMENT_NOT_FOUND",
      beforeScreenshot: "/artifacts/before.png",
      afterScreenshot: "/artifacts/after.png",
      domSnapshot: "<html></html>",
    });

    assert.deepEqual(result, {
      stepId: "trace-step-0",
      type: "click",
      status: "failed",
      durationMs: 42,
      error: {
        type: "ELEMENT_NOT_FOUND",
        message: "Element not found",
        details: { locatorDiagnostics: { matchedCount: 0 } },
      },
      targetRef: "button \"Save\"",
      selector: "button \"Save\"",
      value: "value",
      artifacts: {
        beforeScreenshot: "/artifacts/before.png",
        afterScreenshot: "/artifacts/after.png",
        domSnapshot: "<html></html>",
      },
    });
  });

  it("maps UI assertion evaluations with locator diagnostics", () => {
    const result = mapAssertionEvaluation({
      assertionId: "trace-assert-0",
      assertion: {
        type: "visible",
        locator: { strategy: "role", role: "heading", name: "Dashboard" },
      },
      evaluation: {
        assertion: "heading \"Dashboard\" is visible",
        status: "failed",
        expected: "visible",
        actual: "hidden",
        diagnostics: { matchedCount: 1, visibleCount: 0 },
      },
    });

    assert.deepEqual(result, {
      assertionId: "trace-assert-0",
      domain: "ui",
      type: "visible",
      targetRef: "heading \"Dashboard\"",
      status: "failed",
      expected: "visible",
      actual: "hidden",
      diagnostics: {
        matchedCount: 1,
        visibleCount: 0,
        selector: "heading \"Dashboard\"",
        found: true,
      },
    });
  });

  it("maps API assertion evaluations with current expected and actual encoding", () => {
    const result = mapAssertionEvaluation({
      assertionId: "trace-assert-1",
      assertion: { type: "status_code", url: "/api/session", value: 200 },
      evaluation: {
        assertion: "status code",
        status: "failed",
        expected: "200",
        actual: "500",
      },
    });

    assert.deepEqual(result, {
      assertionId: "trace-assert-1",
      domain: "api",
      type: "status_code",
      endpointRef: "/api/session",
      status: "failed",
      expected: { status: 200 },
      actual: { status: 500, body: "500" },
    });
  });

  it("constructs schema-valid contract and run results", () => {
    const contract = createContractResult({
      intent: "mapping_contract",
      status: "passed",
      durationMs: 10,
      steps: [],
      assertions: [],
      summary: { passed: 0, failed: 0 },
    });
    const run = createRunResult({
      runId: "run",
      traceId: "trace",
      status: "passed",
      summary: { totalContracts: 1, passed: 1, failed: 0 },
      contracts: [contract],
      failures: [],
    });

    assert.equal(ContractResultSchema.safeParse(contract).success, true);
    assert.equal(RunResultSchema.safeParse(run).success, true);
    assert.deepEqual(run.contracts, [contract]);
  });
});
