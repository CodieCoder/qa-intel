import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import {
  CapabilityRegistry,
  createDefaultCapabilityRegistry,
} from "../dist/modules/capabilities/index.js";

function definition(overrides = {}) {
  return {
    id: "step.example",
    kind: "step",
    discriminator: "example",
    inputSchema: z.object({ type: z.literal("example"), value: z.string() }),
    parser: {
      precedence: 10,
      collisionKeys: ["when:example"],
    },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: ["screenshot"],
    dependencies: [],
    async execute({ input }) {
      return { value: input.value };
    },
    ...overrides,
  };
}

describe("strict internal capability registry", () => {
  it("orders parser metadata deterministically and exposes immutable views", () => {
    const registry = new CapabilityRegistry([
      definition({
        id: "step.second",
        discriminator: "second",
        parser: { precedence: 20, collisionKeys: ["when:second"] },
      }),
      definition(),
    ]);

    const parsers = registry.parsers("step");
    assert.deepEqual(parsers.map((entry) => entry.id), ["step.example", "step.second"]);
    assert.equal(Object.isFrozen(parsers), true);
    assert.equal(Object.isFrozen(registry.list()), true);
    assert.throws(() => parsers.push(definition()), TypeError);
  });

  it("rejects duplicate identifiers, discriminators, precedence, and collision keys", () => {
    assert.throws(
      () => new CapabilityRegistry([definition(), definition()]),
      /Duplicate capability identifier: step\.example/,
    );
    assert.throws(
      () => new CapabilityRegistry([
        definition(),
        definition({ id: "step.other" }),
      ]),
      /Duplicate step discriminator: example/,
    );
    assert.throws(
      () => new CapabilityRegistry([
        definition(),
        definition({
          id: "step.other",
          discriminator: "other",
          parser: { precedence: 10, collisionKeys: ["when:other"] },
        }),
      ]),
      /Duplicate step parser precedence: 10/,
    );
    assert.throws(
      () => new CapabilityRegistry([
        definition(),
        definition({
          id: "step.other",
          discriminator: "other",
          parser: { precedence: 20, collisionKeys: ["when:example"] },
        }),
      ]),
      /Parser collision key "when:example"/,
    );
  });

  it("validates inputs and required dependencies before executing", async () => {
    let calls = 0;
    const registry = new CapabilityRegistry([
      definition({
        dependencies: [
          { key: "page" },
          { key: "autoHealer", optional: true },
        ],
        async execute({ input, dependencies }) {
          calls += 1;
          return { input, page: dependencies.page };
        },
      }),
    ]);

    const invalid = await registry.execute(
      "step.example",
      { type: "example" },
      {},
      { page: "page" },
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.failure.type, "invalid_input");

    const missing = await registry.execute(
      "step.example",
      { type: "example", value: "ok" },
      {},
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.failure.type, "missing_dependency");

    const passed = await registry.execute(
      "step.example",
      { type: "example", value: "ok" },
      {},
      { page: "page", undeclared: "hidden" },
    );
    assert.equal(passed.ok, true);
    assert.deepEqual(passed.data, {
      input: { type: "example", value: "ok" },
      page: "page",
    });
    assert.equal(calls, 1);
  });

  it("contains handler failures within structured capability results", async () => {
    const registry = new CapabilityRegistry([
      definition({
        failureLayer: "api",
        async execute() {
          throw new Error("adapter failed");
        },
      }),
    ]);

    const result = await registry.execute(
      "step.example",
      { type: "example", value: "ok" },
      {},
    );

    assert.deepEqual(result, {
      ok: false,
      failure: {
        capabilityId: "step.example",
        layer: "api",
        type: "execution",
        message: "adapter failed",
      },
    });
  });

  it("builds the complete immutable built-in registry", () => {
    const registry = createDefaultCapabilityRegistry();
    const steps = registry.list("step");
    const assertions = registry.list("assertion");

    assert.deepEqual(
      steps.map((entry) => entry.discriminator),
      [
        "navigate",
        "click",
        "type",
        "select",
        "wait",
        "check",
        "uncheck",
        "toggle",
        "upload",
        "request",
      ],
    );
    assert.deepEqual(
      assertions.map((entry) => entry.discriminator),
      [
        "url_equals",
        "url_contains",
        "status_code",
        "response_body_contains",
        "response_body_equals",
        "response_header_contains",
        "trace_id_present",
        "visible",
        "not_visible",
        "text_equals",
        "text_contains",
        "exists",
      ],
    );
    assert.equal(steps.length, 10);
    assert.equal(assertions.length, 12);
    assert.equal("register" in registry, false);
  });
});
