import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ActionEngine } from "../dist/modules/engine/action-engine.js";
import { EngineSessionRegistry } from "../dist/modules/engine/tools/engine-manager.js";
import { APIContractRegistry } from "../dist/modules/engine/tools/resolveAPIContract.js";
import {
  EngineManager,
  clearAPIContracts,
  loadAPIContracts,
  resolveAPIContractTool,
} from "@qutecoder/qa-intel";
import { TestLogger } from "../dist/modules/logger/index.js";

describe("public stateful compatibility facades", () => {
  it("reuses and closes one EngineManager session per trace ID", async () => {
    const originalLaunch = ActionEngine.prototype.launch;
    const originalClose = ActionEngine.prototype.close;
    let launches = 0;
    let closes = 0;
    ActionEngine.prototype.launch = async function () {
      launches += 1;
    };
    ActionEngine.prototype.close = async function () {
      closes += 1;
    };

    const traceId = "state-isolation-engine";
    try {
      const logger = new TestLogger({ stdout: false, collect: true });
      const first = await EngineManager.getOrCreate(traceId, logger);
      const second = await EngineManager.getOrCreate(traceId, logger);

      assert.equal(first, second);
      assert.equal(EngineManager.get(traceId), first);
      assert.equal(launches, 1);

      await EngineManager.close(traceId);
      assert.equal(EngineManager.get(traceId), undefined);
      assert.equal(closes, 1);
    } finally {
      await EngineManager.close(traceId);
      ActionEngine.prototype.launch = originalLaunch;
      ActionEngine.prototype.close = originalClose;
    }
  });

  it("loads, resolves, and clears API contracts through public functions", async () => {
    clearAPIContracts();
    try {
      loadAPIContracts({
        health: {
          method: "GET",
          path: "/health",
          responseSchema: { ok: "boolean" },
        },
      });

      const loaded = await resolveAPIContractTool({ endpointRef: "health" });
      assert.deepEqual(loaded, {
        ok: true,
        data: {
          method: "GET",
          path: "/health",
          requestSchema: undefined,
          responseSchema: { ok: "boolean" },
        },
      });
    } finally {
      clearAPIContracts();
    }

    const cleared = await resolveAPIContractTool({ endpointRef: "health" });
    assert.equal(cleared.ok, false);
    assert.equal(cleared.error.code, "NOT_FOUND");
  });
});

describe("isolated internal state services", () => {
  it("does not share engine sessions between registry instances", async () => {
    const events = [];
    const createEngine = (name) => () => ({
      name,
      async launch() {
        events.push(`${name}:launch`);
      },
      async close() {
        events.push(`${name}:close`);
      },
    });
    const first = new EngineSessionRegistry(createEngine("first"));
    const second = new EngineSessionRegistry(createEngine("second"));
    const logger = new TestLogger({ stdout: false, collect: true });

    const firstEngine = await first.getOrCreate("trace", logger);
    assert.equal(first.get("trace"), firstEngine);
    assert.equal(second.get("trace"), undefined);

    const secondEngine = await second.getOrCreate("trace", logger);
    assert.notEqual(firstEngine, secondEngine);
    await first.close("trace");
    assert.equal(first.get("trace"), undefined);
    assert.equal(second.get("trace"), secondEngine);
    assert.deepEqual(events, ["first:launch", "second:launch", "first:close"]);
  });

  it("retains a session when close fails so cleanup can be retried", async () => {
    let closeAttempts = 0;
    const engine = {
      async launch() {},
      async close() {
        closeAttempts += 1;
        if (closeAttempts === 1) throw new Error("close failed");
      },
    };
    const registry = new EngineSessionRegistry(() => engine);
    const logger = new TestLogger({ stdout: false, collect: true });

    await registry.getOrCreate("trace", logger);
    await assert.rejects(registry.close("trace"), /close failed/);
    assert.equal(registry.get("trace"), engine);

    await registry.close("trace");
    assert.equal(registry.get("trace"), undefined);
    assert.equal(closeAttempts, 2);
  });

  it("does not share API contracts between registry instances", async () => {
    const first = new APIContractRegistry();
    const second = new APIContractRegistry();
    first.load({ health: { method: "GET", path: "/health" } });

    const loaded = await first.resolve({ endpointRef: "health" });
    const isolated = await second.resolve({ endpointRef: "health" });

    assert.equal(loaded.ok, true);
    assert.equal(isolated.ok, false);
    assert.equal(isolated.error.code, "NOT_FOUND");
  });
});
