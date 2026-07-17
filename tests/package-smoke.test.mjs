import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { REPO_ROOT, createTempDir } from "./runtime-test-helpers.mjs";

describe("package smoke", () => {
  it("self-imports the public package export map", async () => {
    const api = await import("@qutecoder/qa-intel");

    for (const exportName of [
      "compileGherkin",
      "ActionEngine",
      "AssertionEngine",
      "TestLogger",
      "ResultStore",
      "EngineManager",
      "executeStepTool",
      "executeContractTool",
      "runSuiteTool",
      "resolveUIElementTool",
      "validateUIAssertionTool",
      "resolveAPIContractTool",
      "validateAPIResponseTool",
      "generateFixHintsTool",
      "getStepArtifactsTool",
      "loadAPIContracts",
      "clearAPIContracts",
    ]) {
      assert.equal(typeof api[exportName], "function", `${exportName} should be exported`);
    }

    for (const internalName of [
      "createDefaultRuntimeServices",
      "executeContractWithServices",
      "runSuiteWithServices",
      "CapabilityRegistry",
      "createDefaultCapabilityRegistry",
      "BUILT_IN_CAPABILITIES",
      "EngineSessionRegistry",
      "APIContractRegistry",
    ]) {
      assert.equal(internalName in api, false, `${internalName} should remain internal`);
    }

    assert.equal(typeof api.TestSuiteSchema.safeParse, "function");
    assert.equal(typeof api.LocatorSpecSchema.safeParse, "function");
  });

  it("packs the intended public files without tests or source TypeScript", () => {
    const tmp = createTempDir("qa-pack-");

    try {
      const result = spawnSync(
        "npm",
        ["--cache", tmp.file("npm-cache"), "pack", "--dry-run", "--json"],
        {
          cwd: REPO_ROOT,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        },
      );

      assert.equal(result.status, 0, result.stderr);
      const [pack] = JSON.parse(result.stdout);
      const paths = new Set(pack.files.map((file) => file.path));

      for (const expected of [
        "package.json",
        "CHANGELOG.md",
        "CODE_OF_CONDUCT.md",
        "CONTRIBUTING.md",
        "README.md",
        "SECURITY.md",
        "dist/index.js",
        "dist/index.d.ts",
        "dist/cli.js",
        "docs/cli.md",
        "docs/extensibility.md",
        "docs/testing.md",
        "docs/using-in-real-projects.md",
        "examples/login.feature",
        "examples/test-app.html",
      ]) {
        assert.equal(paths.has(expected), true, `${expected} should be included`);
      }

      assert.equal(paths.has("src/index.ts"), false);
      assert.equal([...paths].some((path) => path.startsWith("tests/")), false);
      assert.equal(pack.name, "@qutecoder/qa-intel");
      assert.equal(pack.entryCount, paths.size);
    } finally {
      tmp.cleanup();
    }
  });
});
