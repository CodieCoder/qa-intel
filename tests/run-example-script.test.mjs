import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { REPO_ROOT, createTempDir } from "./runtime-test-helpers.mjs";

function runExampleScript(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/run-example.mjs", ...args], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

describe("run:example script", () => {
  it("starts the bundled example app and returns JSON stdout", async () => {
    const tmp = createTempDir("qa-run-example-");

    try {
      const result = await runExampleScript([
        "--artifact-dir",
        tmp.file("artifacts"),
        "--results-db",
        tmp.file("results.db"),
      ]);

      assert.equal(result.signal, null);
      assert.equal(result.status, 0, result.stderr);

      const json = JSON.parse(result.stdout);
      assert.equal(json.ok, true);
      assert.equal(json.data.status, "passed");
      assert.deepEqual(json.data.summary, {
        totalContracts: 2,
        passed: 2,
        failed: 0,
      });
    } finally {
      tmp.cleanup();
    }
  });
});
