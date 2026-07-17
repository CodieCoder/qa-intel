import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveBrowserSelection } from "../dist/modules/engine/browser-selection.js";

describe("browser selection precedence", () => {
  it("falls back to bundled Playwright Chromium by default", () => {
    const selection = resolveBrowserSelection({}, {});

    assert.equal(selection.kind, "bundled");
    assert.equal(selection.source, "default");
    assert.deepEqual(selection.launchOptions, {});
  });

  it("prefers explicit executable path over every other source", () => {
    const selection = resolveBrowserSelection(
      {
        browserExecutablePath: "/explicit/chrome",
        browserChannel: "chrome",
      },
      {
        QA_INTEL_BROWSER_EXECUTABLE_PATH: "/env/chrome",
        QA_INTEL_BROWSER_CHANNEL: "msedge",
      },
    );

    assert.equal(selection.kind, "executablePath");
    assert.equal(selection.source, "config");
    assert.equal(selection.executablePath, "/explicit/chrome");
    assert.deepEqual(selection.launchOptions, { executablePath: "/explicit/chrome" });
  });

  it("prefers explicit channel over environment executable path", () => {
    const selection = resolveBrowserSelection(
      { browserChannel: "chrome" },
      {
        QA_INTEL_BROWSER_EXECUTABLE_PATH: "/env/chrome",
        QA_INTEL_BROWSER_CHANNEL: "msedge",
      },
    );

    assert.equal(selection.kind, "channel");
    assert.equal(selection.source, "config");
    assert.equal(selection.channel, "chrome");
    assert.deepEqual(selection.launchOptions, { channel: "chrome" });
  });

  it("prefers environment executable path over environment channel", () => {
    const selection = resolveBrowserSelection(
      {},
      {
        QA_INTEL_BROWSER_EXECUTABLE_PATH: "/env/chrome",
        QA_INTEL_BROWSER_CHANNEL: "chrome",
      },
    );

    assert.equal(selection.kind, "executablePath");
    assert.equal(selection.source, "env");
    assert.equal(selection.executablePath, "/env/chrome");
  });

  it("uses environment channel when no executable path is configured", () => {
    const selection = resolveBrowserSelection(
      {},
      {
        QA_INTEL_BROWSER_CHANNEL: "chrome",
      },
    );

    assert.equal(selection.kind, "channel");
    assert.equal(selection.source, "env");
    assert.equal(selection.channel, "chrome");
  });
});
