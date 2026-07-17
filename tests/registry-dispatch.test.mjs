import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AssertionEngine } from "../dist/modules/assertions/index.js";
import { CapabilityRegistry } from "../dist/modules/capabilities/index.js";
import { ActionEngine } from "../dist/modules/engine/action-engine.js";
import { TestLogger } from "../dist/modules/logger/index.js";

describe("built-in registry execution dispatch", () => {
  it("routes a browser action and a pure network assertion through registered handlers", async () => {
    const capabilityIds = [];
    const originalExecute = CapabilityRegistry.prototype.execute;
    CapabilityRegistry.prototype.execute = function (id, ...args) {
      capabilityIds.push(id);
      return originalExecute.call(this, id, ...args);
    };

    try {
      const logger = new TestLogger({ stdout: false, collect: true });
      const actionEngine = new ActionEngine(logger, { retries: 0 });
      actionEngine.page = {
        async screenshot() {
          return Buffer.from("screenshot");
        },
        async goto() {},
      };

      const action = await actionEngine.execute({
        type: "navigate",
        url: "https://example.test",
      });
      assert.equal(action.result, "success");

      const assertionEngine = new AssertionEngine();
      const assertion = await assertionEngine.evaluate(
        {},
        { type: "status_code", url: "/health", value: 200 },
        [{ method: "GET", url: "https://example.test/health", status: 200 }],
      );
      assert.equal(assertion.status, "passed");
    } finally {
      CapabilityRegistry.prototype.execute = originalExecute;
    }

    assert.deepEqual(capabilityIds, ["step.navigate", "assertion.status_code"]);
  });
});
