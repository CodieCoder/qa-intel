import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import * as api from "@qutecoder/qa-intel";

import { REPO_ROOT } from "./runtime-test-helpers.mjs";

const fixturePath = (...segments) =>
  join(REPO_ROOT, "tests", "fixtures", ...segments);

const readJsonFixture = (...segments) =>
  JSON.parse(readFileSync(fixturePath(...segments), "utf8"));

const PUBLIC_SCHEMA_EXPORTS = [
  "FailureTypeSchema",
  "ErrorCodeSchema",
  "ToolErrorSchema",
  "StepInputSchema",
  "StepResultSchema",
  "UIAssertionInputSchema",
  "APIAssertionInputSchema",
  "BusinessAssertionInputSchema",
  "LocatorDiagnosticsSchema",
  "UIAssertionResultSchema",
  "APIAssertionResultSchema",
  "AssertionResultSchema",
  "FixHintSchema",
  "FailureSummarySchema",
  "ContractResultSchema",
  "RunResultSchema",
  "SuiteConfigSchema",
  "RunSuiteInputSchema",
  "ExecuteContractInputSchema",
  "ExecuteStepInputSchema",
  "GenerateFixHintsInputSchema",
  "ResolveUIElementInputSchema",
  "ValidateUIAssertionInputSchema",
  "ResolveAPIContractInputSchema",
  "ValidateAPIResponseInputSchema",
  "GetStepArtifactsInputSchema",
  "AriaRoleSchema",
  "RoleLocatorSchema",
  "LabelLocatorSchema",
  "PlaceholderLocatorSchema",
  "TextLocatorSchema",
  "TestIdLocatorSchema",
  "CssLocatorSchema",
  "LocatorSpecSchema",
  "NavigateStepSchema",
  "ClickStepSchema",
  "TypeStepSchema",
  "SelectStepSchema",
  "WaitStepSchema",
  "CheckStepSchema",
  "UncheckStepSchema",
  "ToggleStepSchema",
  "UploadStepSchema",
  "RequestStepSchema",
  "StepSchema",
  "VisibleAssertionSchema",
  "TextEqualsAssertionSchema",
  "ExistsAssertionSchema",
  "TextContainsAssertionSchema",
  "NotVisibleAssertionSchema",
  "UrlEqualsAssertionSchema",
  "UrlContainsAssertionSchema",
  "StatusCodeAssertionSchema",
  "ResponseBodyContainsAssertionSchema",
  "ResponseBodyEqualsAssertionSchema",
  "ResponseHeaderContainsAssertionSchema",
  "TraceIdPresentAssertionSchema",
  "AssertionSchema",
  "TestContractSchema",
  "TestSuiteSchema",
  "DslAssertionResultSchema",
];

describe("public schema contract", () => {
  it("exports every established runtime schema from the package root", () => {
    for (const name of PUBLIC_SCHEMA_EXPORTS) {
      assert.equal(
        typeof api[name]?.safeParse,
        "function",
        `${name} should remain a root schema export`,
      );
    }
  });

  it("preserves strict compiled DSL validation", () => {
    const locator = { strategy: "role", role: "button", name: "Save" };

    assert.equal(api.LocatorSpecSchema.safeParse(locator).success, true);
    assert.equal(
      api.LocatorSpecSchema.safeParse({ ...locator, role: "made-up-role" }).success,
      false,
    );
    assert.equal(api.StepSchema.safeParse({ type: "click", locator }).success, true);
    assert.equal(api.StepSchema.safeParse({ type: "click" }).success, false);
    assert.equal(
      api.AssertionSchema.safeParse({ type: "visible", locator }).success,
      true,
    );
    assert.equal(
      api.AssertionSchema.safeParse({ type: "status_code", url: "/health" }).success,
      false,
    );
  });

  it("preserves the intentionally permissive tool transport schemas", () => {
    assert.equal(
      api.StepInputSchema.safeParse({ type: "click", timeout: -1 }).success,
      true,
      "StepInputSchema currently accepts a partial click and an unconstrained timeout",
    );
    assert.equal(
      api.RunSuiteInputSchema.safeParse({ suite: 42 }).success,
      true,
      "RunSuiteInputSchema.suite currently accepts any value",
    );
    assert.equal(
      api.ExecuteContractInputSchema.safeParse({ traceId: "trace", contract: null }).success,
      true,
      "ExecuteContractInputSchema.contract currently accepts any value",
    );
    assert.equal(
      api.SuiteConfigSchema.safeParse({
        headless: false,
        failFast: true,
        timeoutMs: 123,
        autoHeal: true,
        browserExecutablePath: "/browser",
        browserChannel: "chrome",
      }).success,
      true,
    );
  });

  it("keeps internal and public assertion results as distinct contracts", () => {
    const internalResult = {
      assertion: "heading \"Dashboard\" is visible",
      status: "passed",
    };
    const publicResult = {
      assertionId: "assert-1",
      domain: "ui",
      type: "visible",
      status: "passed",
    };

    assert.equal(api.DslAssertionResultSchema.safeParse(internalResult).success, true);
    assert.equal(api.AssertionResultSchema.safeParse(internalResult).success, false);
    assert.equal(api.AssertionResultSchema.safeParse(publicResult).success, true);
    assert.equal(api.DslAssertionResultSchema.safeParse(publicResult).success, false);
  });

  it("accepts v1 fixtures and preserves representative compilation", () => {
    const suite = readJsonFixture("v1", "suite.json");
    const runResult = readJsonFixture("v1", "run-result.json");
    const feature = readFileSync(fixturePath("v1", "representative.feature"), "utf8");
    const compiled = api.compileGherkin(feature, {
      sourceFile: fixturePath("v1", "representative.feature"),
    });

    assert.equal(api.TestSuiteSchema.safeParse(suite).success, true);
    assert.equal(api.RunResultSchema.safeParse(runResult).success, true);
    assert.deepEqual(compiled.errors, []);
    assert.deepEqual(compiled.warnings, []);
    assert.deepEqual(
      { name: suite.name, baseUrl: suite.baseUrl, contracts: compiled.contracts },
      suite,
    );
  });

  it("compiles the established public TypeScript surface", () => {
    const tsc = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
    const fixture = fixturePath("types", "public-api.ts");

    assert.doesNotThrow(() =>
      execFileSync(
        process.execPath,
        [
          tsc,
          "--noEmit",
          "--strict",
          "--skipLibCheck",
          "--target",
          "ES2022",
          "--module",
          "NodeNext",
          "--moduleResolution",
          "NodeNext",
          fixture,
        ],
        { cwd: REPO_ROOT, encoding: "utf8", stdio: "pipe" },
      ),
    );
  });
});
