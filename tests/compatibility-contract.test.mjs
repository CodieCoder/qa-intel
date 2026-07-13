import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  RunResultSchema,
  compileGherkin,
  safeParseTestSuite,
} from "@qutecoder/qa-intel";

import { REPO_ROOT } from "./runtime-test-helpers.mjs";

const fixturePath = (...segments) =>
  join(REPO_ROOT, "tests", "fixtures", "v1", ...segments);

const readTextFixture = (name) => readFileSync(fixturePath(name), "utf8");
const readJsonFixture = (name) => JSON.parse(readTextFixture(name));

describe("v1 compatibility contract", () => {
  it("keeps representative Gherkin compilation stable", () => {
    const expectedSuite = readJsonFixture("suite.json");
    const compiled = compileGherkin(readTextFixture("representative.feature"), {
      sourceFile: fixturePath("representative.feature"),
    });

    assert.deepEqual(compiled.errors, []);
    assert.deepEqual(compiled.warnings, []);
    assert.deepEqual(
      {
        name: expectedSuite.name,
        baseUrl: expectedSuite.baseUrl,
        contracts: compiled.contracts,
      },
      expectedSuite,
    );
  });

  it("continues accepting an unversioned v1 suite", () => {
    const parsed = safeParseTestSuite(readJsonFixture("suite.json"));

    assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error.message);
  });

  it("continues accepting the current v1 run-result shape", () => {
    const parsed = RunResultSchema.safeParse(readJsonFixture("run-result.json"));

    assert.equal(parsed.success, true, parsed.success ? undefined : parsed.error.message);
  });
});
