import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createDefaultRuntimeServices,
} from "../dist/modules/engine/runtime-services.js";
import {
  executeContractWithServices,
} from "../dist/modules/engine/tools/executeContract.js";
import {
  runSuiteWithServices,
} from "../dist/modules/engine/tools/runSuite.js";

function createFakePage() {
  return {
    async waitForLoadState() {},
    async content() {
      return "<html></html>";
    },
    async screenshot() {
      return Buffer.from("final");
    },
  };
}

function createFakeActionEngine(events, page = createFakePage()) {
  return {
    async launch() {
      events.push("engine:launch");
    },
    async executeAll(steps) {
      events.push("engine:execute");
      return steps.map((step) => ({
        timestamp: 1,
        type: step.type,
        targetRef: step.type === "navigate" ? step.url : undefined,
        result: "success",
        duration: 3,
        network: [],
      }));
    },
    flushConsoleLogsForStep(stepId) {
      events.push(`engine:flush:${stepId}`);
      return [];
    },
    getPage() {
      return page;
    },
    getConsoleLogsByStep() {
      return new Map();
    },
    async close() {
      events.push("engine:close");
    },
  };
}

function createFakeServices(overrides = {}) {
  const events = [];
  const ids = ["run-id", "trace-id"];
  const times = [100, 125];

  const services = {
    ...createDefaultRuntimeServices(),
    createId: () => ids.shift() ?? "extra-id",
    now: () => times.shift() ?? 125,
    createActionEngine: () => createFakeActionEngine(events),
    createAssertionEngine: () => ({
      async evaluateAll(_page, assertions) {
        events.push("assertions:evaluate");
        return assertions.map((assertion) => ({
          assertion: assertion.type,
          status: "passed",
        }));
      },
    }),
    createArtifactStorage: () => ({
      async saveArtifact(traceId, filename) {
        events.push(`artifact:${filename}`);
        return `/artifacts/${traceId}/${filename}`;
      },
      async getArtifact() {
        return null;
      },
      async close() {
        events.push("artifact:close");
      },
    }),
    ...overrides,
  };

  return { events, services };
}

const suite = {
  name: "injected-runtime",
  contracts: [
    {
      intent: "uses_injected_services",
      steps: [{ type: "navigate", url: "https://example.test" }],
      assertions: [{ type: "url_contains", value: "example.test" }],
    },
  ],
};

describe("injected runtime services", () => {
  it("provides every production default as an internal factory", () => {
    const services = createDefaultRuntimeServices();

    for (const name of [
      "createId",
      "now",
      "createLogger",
      "createActionEngine",
      "createAssertionEngine",
      "createArtifactStorage",
      "createResultStore",
    ]) {
      assert.equal(typeof services[name], "function", `${name} should be a function`);
    }
  });

  it("runs browserless orchestration with deterministic injected services", async () => {
    const { events, services } = createFakeServices();
    const result = await runSuiteWithServices({ suite }, services);

    assert.equal(result.ok, true);
    assert.equal(result.data.runId, "run-id");
    assert.equal(result.data.traceId, "trace-id");
    assert.equal(result.data.contracts[0].durationMs, 25);
    assert.equal(result.data.status, "passed");
    assert.deepEqual(events, [
      "engine:launch",
      "engine:execute",
      "engine:flush:trace-id-c0-step-0",
      "assertions:evaluate",
      "artifact:final.png",
      "engine:close",
      "artifact:close",
    ]);
  });

  it("closes an injected engine after launch failure", async () => {
    const events = [];
    const { services } = createFakeServices({
      createActionEngine: () => ({
        async launch() {
          events.push("launch");
          throw new Error("launch failed");
        },
        async executeAll() {
          return [];
        },
        flushConsoleLogsForStep() {
          return [];
        },
        getPage() {
          return createFakePage();
        },
        getConsoleLogsByStep() {
          return new Map();
        },
        async close() {
          events.push("close");
        },
      }),
    });

    const result = await executeContractWithServices(
      {
        traceId: "trace",
        contract: suite.contracts[0],
      },
      services,
    );

    assert.equal(result.ok, false);
    assert.match(result.error.message, /launch failed/);
    assert.deepEqual(events, ["launch", "close"]);
  });

  it("closes acquired services when a setup factory fails", async () => {
    const { events, services } = createFakeServices({
      createAssertionEngine() {
        throw new Error("assertion factory failed");
      },
    });

    const result = await executeContractWithServices(
      {
        traceId: "trace",
        contract: suite.contracts[0],
      },
      services,
    );

    assert.equal(result.ok, false);
    assert.match(result.error.message, /assertion factory failed/);
    assert.deepEqual(events, ["engine:close", "artifact:close"]);
  });

  it("keeps persistence failure non-fatal and closes the store", async () => {
    let storeClosed = false;
    let stderr = "";
    const originalWrite = process.stderr.write;
    const { services } = createFakeServices({
      createResultStore: () => ({
        saveRun() {
          throw new Error("database unavailable");
        },
        close() {
          storeClosed = true;
        },
      }),
    });

    process.stderr.write = ((chunk) => {
      stderr += String(chunk);
      return true;
    });

    try {
      const result = await runSuiteWithServices(
        { suite, resultsDb: "/tmp/results.db" },
        services,
      );

      assert.equal(result.ok, true);
      assert.equal(result.data.status, "passed");
    } finally {
      process.stderr.write = originalWrite;
    }

    assert.equal(storeClosed, true);
    assert.match(stderr, /failed to persist results to DB: database unavailable/);
  });
});
