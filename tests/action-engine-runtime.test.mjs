import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ActionEngine } from "../dist/modules/engine/action-engine.js";
import { TestLogger } from "../dist/modules/logger/index.js";

import {
  assertBase64Png,
  createRouteHandler,
  createTempDir,
  startHttpServer,
  writeTempFile,
} from "./runtime-test-helpers.mjs";

const RUNTIME_HTML = `<!doctype html>
<html>
  <head>
    <title>Runtime Fixture</title>
    <style>
      body { font-family: sans-serif; margin: 24px; }
      label, button { display: block; margin: 12px 0; }
      #hidden-message { display: none; }
    </style>
  </head>
  <body>
    <h1>Runtime fixture</h1>
    <label for="email">Email</label>
    <input id="email" type="email" />

    <label for="country">Country</label>
    <select id="country">
      <option value="">Choose</option>
      <option value="ng">Nigeria</option>
      <option value="us">United States</option>
    </select>

    <label for="export-format">Export format</label>
    <select id="export-format">
      <option value="">Choose</option>
      <option value="pdf-v2">Portable Document Format</option>
      <option value="csv-v2">Comma-separated values</option>
    </select>

    <label for="collision-choice">Collision choice</label>
    <select id="collision-choice">
      <option value="uuid-label-match">Collision</option>
      <option value="Collision">Different label</option>
    </select>

    <label><input id="terms" type="checkbox" /> Accept terms</label>
    <button id="toggle-button" data-on="false">Enable setting</button>

    <label for="upload">Upload resume</label>
    <input id="upload" aria-label="Upload resume" type="file" />
    <output id="file-name"></output>

    <button id="api-button">Load API</button>
    <button id="error-button">Trigger page error</button>
    <p id="hidden-message">Not visible</p>

    <script>
      console.log("runtime:ready");
      fetch("/static/app.js");
      const image = new Image();
      image.src = "/images/logo.png";

      document.getElementById("upload").addEventListener("change", (event) => {
        document.getElementById("file-name").textContent =
          event.target.files[0]?.name ?? "";
      });

      document.getElementById("toggle-button").addEventListener("click", (event) => {
        event.currentTarget.dataset.on = "true";
        event.currentTarget.textContent = "Setting enabled";
      });

      document.getElementById("api-button").addEventListener("click", async () => {
        console.info("runtime:api:start");
        const response = await fetch("/api/page-data");
        const data = await response.json();
        document.body.dataset.apiMessage = data.message;
        console.warn("runtime:api:done");
      });

      document.getElementById("error-button").addEventListener("click", () => {
        setTimeout(() => {
          throw new Error("runtime page exploded");
        }, 0);
      });
    </script>
  </body>
</html>`;

function runtimeRoutes() {
  return {
    "/runtime": {
      headers: { "content-type": "text/html; charset=utf-8" },
      body: RUNTIME_HTML,
    },
    "/failure": {
      headers: { "content-type": "text/html" },
      body: "<!doctype html><h1>Failure fixture</h1>",
    },
    "/delayed-select": {
      headers: { "content-type": "text/html; charset=utf-8" },
      body: `<!doctype html>
        <label for="delivery-method">Delivery method</label>
        <select id="delivery-method"><option value="">Loading methods</option></select>
        <script>
          setTimeout(() => {
            const option = document.createElement("option");
            option.value = "email";
            option.textContent = "Email";
            document.getElementById("delivery-method").append(option);
          }, 200);
        </script>`,
    },
    "/heal": {
      headers: { "content-type": "text/html" },
      body: `<!doctype html><button onclick="window.healedClicked = true">Correct Button</button>`,
    },
    "GET /static/app.js": {
      headers: { "content-type": "application/javascript" },
      body: "window.staticLoaded = true;",
    },
    "GET /images/logo.png": {
      headers: { "content-type": "image/png" },
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64",
      ),
    },
    "GET /api/page-data": {
      headers: { "content-type": "application/json", "x-runtime": "page" },
      body: JSON.stringify({ message: "ok", source: "page-fetch" }),
    },
    "POST /api/request": (request) => ({
      headers: { "content-type": "application/json", "x-runtime": "api" },
      body: JSON.stringify({
        ok: true,
        method: request.method,
        body: JSON.parse(request.body),
      }),
    }),
  };
}

function makeEngine(origin, overrides = {}) {
  const logger = new TestLogger({ stdout: false, collect: true, level: "debug" });
  const engine = new ActionEngine(logger, {
    baseUrl: origin,
    headless: true,
    retries: 0,
    retryDelay: 0,
    timeout: 2_000,
    ...overrides,
  });
  return { engine, logger };
}

describe("ActionEngine browser runtime", () => {
  it("executes browser actions, captures diagnostics, and filters noisy assets", async () => {
    const tmp = createTempDir("qa-action-");
    const uploadPath = writeTempFile(tmp, "resume.txt", "hello from upload");
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine, logger } = makeEngine(server.origin);

    try {
      await engine.launch();

      const steps = [
        { type: "navigate", url: "/runtime" },
        {
          type: "type",
          locator: { strategy: "label", name: "Email" },
          value: "maac@example.com",
        },
        {
          type: "select",
          locator: { strategy: "label", name: "Country" },
          value: "ng",
        },
        { type: "check", locator: { strategy: "label", name: "Accept terms" } },
        { type: "uncheck", locator: { strategy: "label", name: "Accept terms" } },
        {
          type: "toggle",
          locator: { strategy: "role", role: "button", name: "Enable setting" },
        },
        {
          type: "upload",
          locator: { strategy: "label", name: "Upload resume" },
          value: uploadPath,
        },
        {
          type: "click",
          locator: { strategy: "role", role: "button", name: "Load API" },
        },
        {
          type: "request",
          method: "POST",
          url: "/api/request",
          headers: { "x-custom": "runtime-test" },
          body: JSON.stringify({ hello: "world" }),
        },
        {
          type: "click",
          locator: { strategy: "role", role: "button", name: "Trigger page error" },
        },
      ];

      const logsByStep = new Map();
      for (let i = 0; i < steps.length; i++) {
        const event = await engine.execute(steps[i]);

        if (i === 7) {
          await engine
            .getPage()
            .waitForFunction(() => document.body.dataset.apiMessage === "ok");
        }
        if (i === 9) {
          await engine.getPage().waitForTimeout(50);
        }

        const logs = engine.flushConsoleLogsForStep(`step-${i}`);
        logsByStep.set(i, logs);

        assert.equal(event.result, "success", `${steps[i].type} should pass`);
        assertBase64Png(event.screenshotBefore, `${steps[i].type} before screenshot`);
        assertBase64Png(event.screenshot, `${steps[i].type} after screenshot`);
      }

      const state = await engine.getPage().evaluate(() => ({
        email: document.getElementById("email").value,
        country: document.getElementById("country").value,
        termsChecked: document.getElementById("terms").checked,
        toggleOn: document.getElementById("toggle-button").dataset.on,
        fileName: document.getElementById("file-name").textContent,
        apiMessage: document.body.dataset.apiMessage,
      }));

      assert.deepEqual(state, {
        email: "maac@example.com",
        country: "ng",
        termsChecked: false,
        toggleOn: "true",
        fileName: "resume.txt",
        apiMessage: "ok",
      });

      assert.ok(
        logsByStep.get(0).some((entry) => entry.message === "runtime:ready"),
        "navigate step should collect page console logs",
      );
      assert.ok(
        logsByStep.get(7).some((entry) => entry.level === "warn" && entry.message === "runtime:api:done"),
        "click step should collect async console logs",
      );
      assert.ok(
        logsByStep.get(9).some((entry) => entry.level === "pageerror" && entry.message.includes("runtime page exploded")),
        "click step should collect page errors",
      );

      const networkLog = logger.getNetworkLog();
      assert.ok(networkLog.some((entry) => entry.url.endsWith("/runtime") && entry.status === 200));
      assert.ok(networkLog.some((entry) => entry.url.endsWith("/api/page-data") && entry.responseBody.message === "ok"));
      assert.ok(
        networkLog.some(
          (entry) =>
            entry.url.endsWith("/api/request") &&
            entry.method === "POST" &&
            entry.requestHeaders["X-Request-Id"] === logger.getTraceId() &&
            entry.requestBody.hello === "world" &&
            entry.responseBody.ok === true,
        ),
      );
      assert.equal(
        networkLog.some((entry) => entry.url.includes("/static/app.js") || entry.url.includes("/images/logo.png")),
        false,
        "static assets should be filtered from network logs",
      );
    } finally {
      await engine.close();
      await server.close();
      tmp.cleanup();
    }
  });

  it("captures failure screenshots and skips remaining steps after the first failure", async () => {
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine } = makeEngine(server.origin, { timeout: 300 });

    try {
      await engine.launch();
      const results = await engine.executeAll([
        { type: "navigate", url: "/failure" },
        {
          type: "click",
          locator: { strategy: "role", role: "button", name: "Missing button" },
        },
        {
          type: "type",
          locator: { strategy: "label", name: "Email" },
          value: "should-not-run@example.com",
        },
      ]);

      assert.deepEqual(
        results.map((result) => result.result),
        ["success", "failed", "skipped"],
      );
      assert.match(results[1].error, /Missing button|Timeout|locator/i);
      assert.equal(results[1].errorDetails.locatorDiagnostics.matchedCount, 0);
      assert.ok(Array.isArray(results[1].errorDetails.locatorDiagnostics.nearestMatches));
      assertBase64Png(results[1].screenshotBefore);
      assertBase64Png(results[1].screenshot);
      assert.equal(results[2].duration, 0);
      assert.equal(results[2].network.length, 0);
    } finally {
      await engine.close();
      await server.close();
    }
  });

  it("selects native options by existing value and visible label, including env placeholders", async () => {
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine } = makeEngine(server.origin);
    process.env.QA_INTEL_TEST_FORMAT_LABEL = "Comma-separated values";

    try {
      await engine.launch();
      await engine.execute({ type: "navigate", url: "/runtime" });

      const byValue = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Country" },
        value: "ng",
      });
      const byLabel = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Export format" },
        value: "Portable Document Format",
      });
      const byPlaceholderLabel = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Export format" },
        value: "{{QA_INTEL_TEST_FORMAT_LABEL}}",
        match: "label",
      });

      assert.equal(byValue.result, "success");
      assert.equal(byLabel.result, "success");
      assert.equal(byPlaceholderLabel.result, "success");
      assert.deepEqual(
        await engine.getPage().evaluate(() => ({
          country: document.getElementById("country").value,
          exportFormat: document.getElementById("export-format").value,
        })),
        {
          country: "ng",
          exportFormat: "csv-v2",
        },
      );
    } finally {
      delete process.env.QA_INTEL_TEST_FORMAT_LABEL;
      await engine.close();
      await server.close();
    }
  });

  it("waits up to the action timeout for asynchronously loaded native options", async () => {
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine } = makeEngine(server.origin, { timeout: 1_000 });

    try {
      await engine.launch();
      await engine.execute({ type: "navigate", url: "/delayed-select" });

      const result = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Delivery method" },
        value: "email",
      });

      assert.equal(result.result, "success", result.error);
      assert.equal(
        await engine.getPage().locator("#delivery-method").inputValue(),
        "email",
      );
    } finally {
      await engine.close();
      await server.close();
    }
  });

  it("fails missing and ambiguous options with structured selection diagnostics", async () => {
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine } = makeEngine(server.origin, { timeout: 250 });

    try {
      await engine.launch();
      await engine.execute({ type: "navigate", url: "/runtime" });

      const missing = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Export format" },
        value: "Rich Text Format",
      });
      const ambiguous = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Collision choice" },
        value: "Collision",
      });

      assert.equal(missing.result, "failed");
      assert.match(missing.error, /Rich Text Format.*auto.*not found/i);
      assert.deepEqual(missing.errorDetails.selection, {
        requested: "Rich Text Format",
        match: "auto",
        reason: "option_not_found",
        matches: [],
        availableOptions: [
          { index: 0, value: "", label: "Choose" },
          { index: 1, value: "pdf-v2", label: "Portable Document Format" },
          { index: 2, value: "csv-v2", label: "Comma-separated values" },
        ],
      });

      assert.equal(ambiguous.result, "failed");
      assert.match(ambiguous.error, /Collision.*auto.*ambiguous/i);
      assert.deepEqual(ambiguous.errorDetails.selection.matches, [
        {
          index: 0,
          value: "uuid-label-match",
          label: "Collision",
          matchedBy: ["label"],
        },
        {
          index: 1,
          value: "Collision",
          label: "Different label",
          matchedBy: ["value"],
        },
      ]);
      assert.equal(ambiguous.errorDetails.selection.reason, "option_ambiguous");
    } finally {
      await engine.close();
      await server.close();
    }
  });

  it("uses explicit label or value matching to resolve label/value collisions", async () => {
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine } = makeEngine(server.origin);

    try {
      await engine.launch();
      await engine.execute({ type: "navigate", url: "/runtime" });

      const byLabel = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Collision choice" },
        value: "Collision",
        match: "label",
      });
      assert.equal(byLabel.result, "success");
      assert.equal(
        await engine.getPage().evaluate(() => document.getElementById("collision-choice").selectedIndex),
        0,
      );

      const byValue = await engine.execute({
        type: "select",
        locator: { strategy: "label", name: "Collision choice" },
        value: "Collision",
        match: "value",
      });
      assert.equal(byValue.result, "success");
      assert.equal(
        await engine.getPage().evaluate(() => document.getElementById("collision-choice").selectedIndex),
        1,
      );
    } finally {
      await engine.close();
      await server.close();
    }
  });

  it("uses a JS-only fake auto healer without changing the production API", async () => {
    const server = await startHttpServer(createRouteHandler(runtimeRoutes()));
    const { engine, logger } = makeEngine(server.origin, {
      autoHeal: true,
      timeout: 300,
    });
    let healingContext;

    try {
      await engine.launch();
      await engine.execute({ type: "navigate", url: "/heal" });
      engine.flushConsoleLogsForStep("navigate");

      engine.autoHealer = {
        async heal(context) {
          healingContext = context;
          return {
            locator: { strategy: "role", role: "button", name: "Correct Button" },
            reasoning: "The accessible tree contains the intended button.",
          };
        },
      };

      const event = await engine.execute({
        type: "click",
        locator: { strategy: "role", role: "button", name: "Missing Button" },
      });

      assert.equal(event.result, "success");
      assert.equal(event.selector, 'button "Correct Button"');
      assert.equal(healingContext.stepType, "click");
      assert.deepEqual(healingContext.locator, {
        strategy: "role",
        role: "button",
        name: "Missing Button",
      });
      assertBase64Png(healingContext.screenshotBase64);
      assert.equal(await engine.getPage().evaluate(() => window.healedClicked), true);
      assert.ok(
        logger.getLogs().some((entry) => entry.level === "warn" && entry.message.includes("Self-healed locator")),
      );
    } finally {
      await engine.close();
      await server.close();
    }
  });
});
