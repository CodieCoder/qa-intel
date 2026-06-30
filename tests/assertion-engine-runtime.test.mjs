import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

import { AssertionEngine } from "../dist/modules/assertions/index.js";

import { createRouteHandler, startHttpServer } from "./runtime-test-helpers.mjs";

const ASSERTION_HTML = `<!doctype html>
<html>
  <body>
    <h1>Ready</h1>
    <p id="plain-copy">Plain Copy</p>
    <p id="copy">Balance is 42 credits</p>
    <p id="hidden" hidden>Secret copy</p>
    <button>Save</button>
    <div data-testid="mounted"></div>
  </body>
</html>`;

async function withAssertionPage(fn) {
  const server = await startHttpServer(
    createRouteHandler({
      "/assertions": {
        headers: { "content-type": "text/html" },
        body: ASSERTION_HTML,
      },
    }),
  );
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(`${server.origin}/assertions?mode=ok`);
    return await fn(page, server.origin);
  } finally {
    await browser.close();
    await server.close();
  }
}

describe("AssertionEngine browser assertions", () => {
  it("evaluates positive UI assertions and URL checks in a real page", async () => {
    await withAssertionPage(async (page, origin) => {
      const engine = new AssertionEngine(300);
      const results = await engine.evaluateAll(page, [
        {
          type: "visible",
          locator: { strategy: "role", role: "heading", name: "Ready" },
        },
        {
          type: "not_visible",
          locator: { strategy: "text", text: "Secret copy" },
        },
        {
          type: "exists",
          locator: { strategy: "testid", id: "mounted" },
        },
        {
          type: "text_equals",
          locator: { strategy: "css", selector: "#copy" },
          value: "Balance is 42 credits",
        },
        {
          type: "text_contains",
          locator: { strategy: "css", selector: "#copy" },
          value: "42",
        },
        {
          type: "url_equals",
          value: `${origin}/assertions?mode=ok`,
        },
        {
          type: "url_contains",
          value: "/assertions?mode=ok",
        },
      ]);

      assert.deepEqual(
        results.map((result) => result.status),
        ["passed", "passed", "passed", "passed", "passed", "passed", "passed"],
      );
    });
  });

  it("returns useful failed UI assertion details", async () => {
    await withAssertionPage(async (page) => {
      const engine = new AssertionEngine(300);

      const [wrongText, missing, wrongUrl] = await engine.evaluateAll(page, [
        {
          type: "text_equals",
          locator: { strategy: "css", selector: "#copy" },
          value: "Balance is 99 credits",
        },
        {
          type: "visible",
          locator: { strategy: "role", role: "button", name: "Missing" },
        },
        {
          type: "url_contains",
          value: "/other",
        },
      ]);

      assert.equal(wrongText.status, "failed");
      assert.equal(wrongText.expected, "Balance is 99 credits");
      assert.equal(wrongText.actual, "Balance is 42 credits");
      assert.match(wrongText.reason, /Text mismatch/);

      assert.equal(missing.status, "failed");
      assert.match(missing.reason, /not visible/);

      assert.equal(wrongUrl.status, "failed");
      assert.equal(wrongUrl.expected, "/other");
      assert.match(wrongUrl.actual, /\/assertions\?mode=ok$/);
    });
  });

  it("reports semantic mismatch and nearest visible candidates", async () => {
    await withAssertionPage(async (page) => {
      const engine = new AssertionEngine(300);

      const headingMismatch = await engine.evaluate(page, {
        type: "visible",
        locator: { strategy: "role", role: "heading", name: "Plain Copy" },
      });

      assert.equal(headingMismatch.status, "failed");
      assert.equal(headingMismatch.diagnostics.matchedCount, 0);
      assert.equal(headingMismatch.diagnostics.visibleCount, 0);
      assert.equal(headingMismatch.diagnostics.nearestMatches[0].kind, "text");
      assert.equal(headingMismatch.diagnostics.nearestMatches[0].text, "Plain Copy");
      assert.match(headingMismatch.diagnostics.guidance[0], /not as heading/);

      const buttonTypo = await engine.evaluate(page, {
        type: "visible",
        locator: { strategy: "role", role: "button", name: "Savve" },
      });

      assert.equal(buttonTypo.status, "failed");
      assert.equal(buttonTypo.diagnostics.nearestMatches[0].kind, "button");
      assert.equal(buttonTypo.diagnostics.nearestMatches[0].text, "Save");
      assert.match(buttonTypo.diagnostics.nearestMatches[0].reason, /button candidate/);
    });
  });

  it("reports visible matches for failed not_visible assertions", async () => {
    await withAssertionPage(async (page) => {
      const engine = new AssertionEngine(300);

      const result = await engine.evaluate(page, {
        type: "not_visible",
        locator: { strategy: "role", role: "button", name: "Save" },
      });

      assert.equal(result.status, "failed");
      assert.match(result.reason, /still visible/);
      assert.equal(result.diagnostics.matchedCount, 1);
      assert.equal(result.diagnostics.visibleCount, 1);
      assert.match(result.diagnostics.guidance[0], /expected it to be hidden/);
      assert.doesNotMatch(result.diagnostics.guidance[0], /No visible button matched/);
    });
  });
});

describe("AssertionEngine API/network assertions", () => {
  it("checks status, body, headers, trace IDs, and URL pattern edge cases", async () => {
    const engine = new AssertionEngine(300);
    const networkLog = [
      {
        method: "GET",
        url: "https://service.test/v1/items/abc",
        status: 404,
        requestHeaders: { "x-request-id": "detail-trace" },
        responseHeaders: { "content-type": "application/json" },
        responseBody: { error: "not found" },
      },
      {
        method: "GET",
        url: "https://service.test/v1/items?sort=asc",
        status: 200,
        requestHeaders: { "X-Request-Id": "query-trace" },
        responseHeaders: { "content-type": "application/json" },
        responseBody: { items: ["a", "b"], meta: { count: 2 } },
      },
      {
        method: "GET",
        url: "https://service.test/v1/items/",
        status: 200,
        requestHeaders: { "x-trace-id": "slash-trace" },
        responseHeaders: { "content-type": "application/json" },
        responseBody: { items: ["slash"], meta: { count: 1 } },
      },
      {
        method: "GET",
        url: "https://service.test/v1/profile",
        status: 200,
        requestHeaders: { "X-Request-Id": "profile-trace" },
        responseHeaders: {
          "Content-Type": "application/json",
          "X-Mode": "fast-runtime",
        },
        responseBody: { user: { id: 7, name: "Ada" }, ok: true },
      },
    ];

    const assertions = [
      { type: "status_code", url: "/v1/items", value: 200 },
      { type: "status_code", url: "/v1/items/abc", value: 404 },
      { type: "response_body_contains", url: "/v1/profile", value: '"ok":true' },
      {
        type: "response_body_equals",
        url: "/v1/profile",
        path: "user.name",
        value: "Ada",
      },
      {
        type: "response_header_contains",
        url: "/v1/profile",
        header: "x-mode",
        value: "runtime",
      },
      { type: "trace_id_present", url: "/v1/items" },
      { type: "trace_id_present", url: "/v1/profile" },
    ];

    const results = [];
    for (const assertion of assertions) {
      results.push(await engine.evaluate({}, assertion, networkLog));
    }

    assert.deepEqual(
      results.map((result) => result.status),
      ["passed", "passed", "passed", "passed", "passed", "passed", "passed"],
    );
  });

  it("reports no-match, status mismatch, missing path, and header failures", async () => {
    const engine = new AssertionEngine(300);
    const networkLog = [
      {
        method: "GET",
        url: "https://service.test/v1/profile",
        status: 200,
        requestHeaders: {},
        responseHeaders: { "content-type": "application/json" },
        responseBody: { user: { name: "Ada" } },
      },
    ];

    const noMatch = await engine.evaluate(
      {},
      { type: "status_code", url: "/v1/missing", value: 200 },
      networkLog,
    );
    assert.equal(noMatch.status, "failed");
    assert.match(noMatch.reason, /No network requests matched/);

    const wrongStatus = await engine.evaluate(
      {},
      { type: "status_code", url: "/v1/profile", value: 201 },
      networkLog,
    );
    assert.equal(wrongStatus.status, "failed");
    assert.equal(wrongStatus.expected, "201");
    assert.equal(wrongStatus.actual, "200");

    const missingPath = await engine.evaluate(
      {},
      {
        type: "response_body_equals",
        url: "/v1/profile",
        path: "user.email",
        value: "ada@example.com",
      },
      networkLog,
    );
    assert.equal(missingPath.status, "failed");
    assert.match(missingPath.reason, /Path "user\.email" not found/);

    const missingHeader = await engine.evaluate(
      {},
      {
        type: "response_header_contains",
        url: "/v1/profile",
        header: "x-mode",
        value: "runtime",
      },
      networkLog,
    );
    assert.equal(missingHeader.status, "failed");
    assert.match(missingHeader.reason, /not found/);

    const noTrace = await engine.evaluate(
      {},
      { type: "trace_id_present", url: "/v1/profile" },
      networkLog,
    );
    assert.equal(noTrace.status, "failed");
    assert.match(noTrace.reason, /No X-Request-Id/);
  });
});
