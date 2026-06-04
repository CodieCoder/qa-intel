import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ResultStore } from "../dist/modules/store/index.js";

import {
  REPO_ROOT,
  assertPngFile,
  createRouteHandler,
  createTempDir,
  runJsonCli,
  startHttpServer,
  writeTempFile,
} from "./runtime-test-helpers.mjs";

function startExampleAppServer() {
  const html = readFileSync(join(REPO_ROOT, "examples", "test-app.html"), "utf-8");
  return startHttpServer(
    createRouteHandler(
      {
        "/app": {
          headers: { "content-type": "text/html" },
          body: html,
        },
      },
      { rewriteTo: "/app" },
    ),
  );
}

describe("CLI run runtime", () => {
  it("compiles and runs examples/login.feature with JSON output, artifacts, and SQLite persistence", async () => {
    const tmp = createTempDir("qa-cli-runtime-");
    const server = await startExampleAppServer();

    try {
      const compile = await runJsonCli([
        "compile",
        join(REPO_ROOT, "examples", "login.feature"),
        "--base-url",
        server.origin,
        "--out-dir",
        tmp.file("compiled"),
      ]);

      assert.equal(compile.status, 0, compile.stderr);
      assert.equal(compile.json.ok, true);
      assert.equal(compile.json.stats.contracts, 2);
      assert.match(compile.json.suite, /suite\.json$/);

      const artifactDir = tmp.file("artifacts");
      const resultsDb = tmp.file("results.db");
      const run = await runJsonCli([
        "run",
        compile.json.suite,
        "--artifact-dir",
        artifactDir,
        "--results-db",
        resultsDb,
      ]);

      assert.equal(run.status, 0, `${run.stderr}\n${JSON.stringify(run.json, null, 2)}`);
      assert.equal(run.json.ok, true);
      assert.equal(run.json.data.status, "passed");
      assert.deepEqual(run.json.data.summary, {
        totalContracts: 2,
        passed: 2,
        failed: 0,
      });
      assert.deepEqual(
        run.json.data.contracts.map((contract) => contract.status),
        ["passed", "passed"],
      );
      assert.ok(run.json.data.runId);
      assert.ok(run.json.data.traceId);

      const artifactPaths = run.json.data.contracts.flatMap((contract) =>
        contract.steps.flatMap((step) =>
          [
            step.artifacts?.beforeScreenshot,
            step.artifacts?.afterScreenshot,
          ].filter(Boolean),
        ),
      );
      assert.ok(artifactPaths.length >= 4, "step screenshots should be written");
      for (const artifactPath of artifactPaths.slice(0, 4)) {
        assertPngFile(artifactPath);
      }

      const store = new ResultStore(resultsDb);
      try {
        const latest = store.getLatestRun();
        assert.ok(latest);
        assert.equal(latest.runId, run.json.data.runId);
        assert.equal(latest.status, "passed");
        assert.equal(latest.summary.totalContracts, 2);
        assert.equal(latest.contracts[1].assertions.at(-1).type, "not_visible");
      } finally {
        store.close();
      }
    } finally {
      await server.close();
      tmp.cleanup();
    }
  });

  it("returns exit code 1 with a failed run result for runtime assertion failures", async () => {
    const tmp = createTempDir("qa-cli-runtime-fail-");
    const server = await startExampleAppServer();

    try {
      const suitePath = writeTempFile(
        tmp,
        "suite.json",
        JSON.stringify(
          {
            name: "failing runtime suite",
            baseUrl: server.origin,
            contracts: [
              {
                intent: "url_mismatch",
                steps: [{ type: "navigate", url: "/login" }],
                assertions: [
                  {
                    type: "url_equals",
                    value: `${server.origin}/not-login`,
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
      );

      const run = await runJsonCli([
        "run",
        suitePath,
        "--artifact-dir",
        tmp.file("artifacts"),
        "--results-db",
        tmp.file("results.db"),
      ]);

      assert.equal(run.status, 1, run.stderr);
      assert.equal(run.json.ok, true);
      assert.equal(run.json.data.status, "failed");
      assert.deepEqual(run.json.data.summary, {
        totalContracts: 1,
        passed: 0,
        failed: 1,
      });
      assert.equal(run.json.data.contracts[0].status, "failed");
      assert.equal(run.json.data.contracts[0].assertions[0].status, "failed");
      assert.equal(run.json.data.failures[0].layer, "ui");
      assert.match(run.json.data.failures[0].issue, /url_equals assertion failed/);
    } finally {
      await server.close();
      tmp.cleanup();
    }
  });
});
