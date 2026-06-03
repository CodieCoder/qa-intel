import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { compileGherkin } from "../dist/modules/dsl/index.js";
import { runSuiteTool } from "../dist/modules/engine/index.js";
import { RunSuiteInputSchema } from "../dist/modules/types/index.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const CLI = join(REPO_ROOT, "dist", "cli.js");

describe("Integration: Gherkin-first semantic compiler", () => {
  it("compiles strict Gherkin into structured suite contracts", () => {
    const gherkin = `
Feature: Login
Scenario: Click the login button
  Given I navigate to "/"
  When I click the button "Log in"
  Then I should see the heading "Dashboard"
`;
    const { contracts, errors, warnings } = compileGherkin(gherkin);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert.equal(warnings.length, 0, JSON.stringify(warnings));
    assert.equal(contracts.length, 1);

    assert.deepEqual(contracts[0].steps[1], {
      type: "click",
      locator: { strategy: "role", role: "button", name: "Log in" },
    });
    assert.deepEqual(contracts[0].assertions[0], {
      type: "visible",
      locator: { strategy: "role", role: "heading", name: "Dashboard" },
    });
  });
});

describe("CLI: suite.json only", () => {
  it("compile writes suite.json and no contracts.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      const featurePath = join(tmpDir, "login.feature");
      writeFileSync(
        featurePath,
        `
Feature: Login
Scenario: Compile only
  Given I navigate to "/"
  When I click the button "Log in"
  Then I should see the text "Welcome"
`,
      );

      const out = execFileSync(
        "node",
        [CLI, "compile", featurePath, "--base-url", "http://localhost:3002", "--out-dir", tmpDir],
        { cwd: REPO_ROOT, encoding: "utf-8" },
      );
      const result = JSON.parse(out);
      assert.equal(result.ok, true, out);
      assert.equal(existsSync(join(tmpDir, "suite.json")), true);
      assert.equal(existsSync(join(tmpDir, "contracts.json")), false);

      const suite = JSON.parse(readFileSync(join(tmpDir, "suite.json"), "utf-8"));
      assert.deepEqual(suite.contracts[0].steps[1].locator, {
        strategy: "role",
        role: "button",
        name: "Log in",
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("run rejects an old contracts.json positional argument", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "qa-cli-"));
    try {
      const suitePath = join(tmpDir, "suite.json");
      const contractsPath = join(tmpDir, "contracts.json");
      writeFileSync(
        suitePath,
        JSON.stringify({
          name: "x",
          baseUrl: "http://localhost:3002",
          contracts: [
            {
              intent: "x",
              steps: [{ type: "navigate", url: "/" }],
              assertions: [
                {
                  type: "visible",
                  locator: { strategy: "text", text: "Welcome" },
                },
              ],
            },
          ],
        }),
      );
      writeFileSync(contractsPath, "{}");

      assert.throws(
        () => execFileSync("node", [CLI, "run", suitePath, contractsPath], {
          cwd: REPO_ROOT,
          encoding: "utf-8",
          stdio: "pipe",
        }),
        (err) => {
          const parsed = JSON.parse(err.stdout);
          assert.equal(parsed.ok, false);
          assert.match(parsed.error, /contracts\.json is no longer used/);
          return true;
        },
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("runSuite input validation", () => {
  it("allows callers to rely on suite.baseUrl", () => {
    const parsed = RunSuiteInputSchema.safeParse({
      suite: {
        name: "x",
        baseUrl: "http://localhost:3002",
        contracts: [
          {
            intent: "x",
            steps: [{ type: "navigate", url: "/" }],
            assertions: [
              {
                type: "visible",
                locator: { strategy: "text", text: "Welcome" },
              },
            ],
          },
        ],
      },
    });

    assert.equal(parsed.success, true);
  });

  it("rejects relative step URLs when no baseUrl is available", async () => {
    const result = await runSuiteTool({
      suite: {
        name: "x",
        contracts: [
          {
            intent: "x",
            steps: [{ type: "navigate", url: "/" }],
            assertions: [
              {
                type: "visible",
                locator: { strategy: "text", text: "Welcome" },
              },
            ],
          },
        ],
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "INVALID_INPUT");
    assert.match(result.error.message, /baseUrl is required/);
  });
});
