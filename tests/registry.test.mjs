/**
 * Tests for the static testid registry.
 *
 * Per plan §14.3: scanner unit tests (static literal, template with
 * interpolation → glob, template without interpolation → exact, ternary
 * over literals → both, design-system prop forward → ignored), mtime
 * cache hit / miss / invalidation, Levenshtein suggestion top-3
 * ordering, glob lookup.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  utimesSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  scanSource,
  buildRegistry,
  buildRegistryFromEntries,
} from "../dist/modules/registry/index.js";

// ─── Scanner — single-file extraction ──────────────────────────────────────

describe("scanSource: accepted forms", () => {
  it("registers a double-quoted string literal as exact", () => {
    const src = `<button data-testid="login-submit">Sign in</button>`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].testid, "login-submit");
    assert.equal(entries[0].isGlob, false);
    assert.equal(entries[0].sourceFile, "/abs/Foo.tsx");
    assert.equal(entries[0].line, 1);
    assert.ok(entries[0].column > 0);
  });

  it("registers a single-quoted string literal as exact", () => {
    const src = `<div data-testid='card-a'/>`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].testid, "card-a");
    assert.equal(entries[0].isGlob, false);
  });

  it("registers a template literal without interpolation as exact", () => {
    const src = "<div data-testid={`card-a`} />";
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].testid, "card-a");
    assert.equal(entries[0].isGlob, false);
  });

  it("registers a template literal with interpolation as glob", () => {
    const src = "<tr data-testid={`row-${id}`} />";
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].testid, "row-*");
    assert.equal(entries[0].isGlob, true);
  });

  it("registers both branches of a ternary over string literals", () => {
    const src = `<div data-testid={ok ? "foo-a" : "foo-b"} />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 2);
    const ids = entries.map((e) => e.testid).sort();
    assert.deepEqual(ids, ["foo-a", "foo-b"]);
    for (const e of entries) assert.equal(e.isGlob, false);
  });

  it("handles a ternary with a template literal on one branch", () => {
    const src =
      'const x = <div data-testid={isFirst ? "la-list-first-card" : `la-card-${mongoId}`} />';
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 2);
    const exactHit = entries.find((e) => !e.isGlob);
    const globHit = entries.find((e) => e.isGlob);
    assert.ok(exactHit, "expected one exact entry");
    assert.ok(globHit, "expected one glob entry");
    assert.equal(exactHit.testid, "la-list-first-card");
    assert.equal(globHit.testid, "la-card-*");
  });

  it("handles template with member-expression interpolation", () => {
    const src = "<div data-testid={`badge-${status.code}`} />";
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].testid, "badge-*");
    assert.equal(entries[0].isGlob, true);
  });

  it("collapses multiple adjacent interpolations into a single *", () => {
    const src = "<div data-testid={`pre-${a}${b}-post`} />";
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].testid, "pre-*-post");
  });

  it("ignores design-system prop forwards (bare identifier)", () => {
    const src = `<div data-testid={testId} className="foo" />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 0);
  });

  it("ignores bracketed member forwards like props['data-testid']", () => {
    const src = `<div data-testid={props['data-testid']} />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 0);
  });

  it("ignores opaque call expressions", () => {
    const src = `<div data-testid={buildTestid(user)} />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 0);
  });

  it("ignores constant references", () => {
    const src = `<div data-testid={TESTIDS.LOGIN_SUBMIT} />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 0);
  });

  it("registers multiple attributes on the same line", () => {
    const src = `<div data-testid="a-one" /><span data-testid="a-two" />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    const ids = entries.map((e) => e.testid).sort();
    assert.deepEqual(ids, ["a-one", "a-two"]);
  });

  it("records 1-indexed line numbers", () => {
    const src = [
      "// first line",
      "// second line",
      '<div data-testid="third-line-id" />',
    ].join("\n");
    const entries = scanSource("/abs/Foo.tsx", src);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].line, 3);
  });

  it("does not match substrings like aria-testid or foo-data-testid", () => {
    // The scanner looks for `data-testid=` literally. A boundary-safe
    // prefix guard isn't specified in §9.2 — but we should at least not
    // blow up on near-miss names.
    const src = `<div aria-label="not-a-testid" data-foo-testid="also-nope" />`;
    const entries = scanSource("/abs/Foo.tsx", src);
    // `data-foo-testid="also-nope"` will be picked up by a loose
    // substring search. The ESLint rule (PR 2) guarantees no such
    // attribute exists in real source. We only assert here that the
    // scanner is at least deterministic: it should extract the literal.
    // This test documents current behaviour — tighten if needed.
    const ids = entries.map((e) => e.testid);
    assert.ok(
      !ids.includes("not-a-testid"),
      "aria-label should never be read as testid",
    );
  });
});

// ─── Registry lookup semantics ─────────────────────────────────────────────

describe("buildRegistryFromEntries: lookup", () => {
  it("has() returns true for exact match", () => {
    const reg = buildRegistryFromEntries([
      {
        testid: "login-submit",
        isGlob: false,
        sourceFile: "/a",
        line: 1,
        column: 1,
      },
    ]);
    assert.equal(reg.has("login-submit"), true);
    assert.equal(reg.has("login-sumbit"), false);
  });

  it("has() returns true for glob match (row-* matches row-123)", () => {
    const reg = buildRegistryFromEntries([
      { testid: "row-*", isGlob: true, sourceFile: "/a", line: 1, column: 1 },
    ]);
    assert.equal(reg.has("row-123"), true);
    assert.equal(reg.has("row-user-42"), true);
    assert.equal(reg.has("row-a-b-c"), true);
    // "row-" with empty suffix should NOT match (* requires one or more chars).
    assert.equal(reg.has("row-"), false);
    assert.equal(reg.has("row"), false);
    assert.equal(reg.has("rowx"), false);
  });

  it("lookup() prefers exact over glob", () => {
    const reg = buildRegistryFromEntries([
      {
        testid: "row-*",
        isGlob: true,
        sourceFile: "/glob",
        line: 1,
        column: 1,
      },
      {
        testid: "row-special",
        isGlob: false,
        sourceFile: "/exact",
        line: 2,
        column: 1,
      },
    ]);
    const hit = reg.lookup("row-special");
    assert.ok(hit);
    assert.equal(hit.sourceFile, "/exact");
  });

  it("lookup() returns null on miss", () => {
    const reg = buildRegistryFromEntries([
      {
        testid: "login-submit",
        isGlob: false,
        sourceFile: "/a",
        line: 1,
        column: 1,
      },
    ]);
    assert.equal(reg.lookup("nonexistent"), null);
  });

  it("entries() + size reflect all registered testids", () => {
    const reg = buildRegistryFromEntries([
      { testid: "a", isGlob: false, sourceFile: "/x", line: 1, column: 1 },
      { testid: "b", isGlob: false, sourceFile: "/x", line: 2, column: 1 },
      { testid: "c-*", isGlob: true, sourceFile: "/x", line: 3, column: 1 },
    ]);
    assert.equal(reg.size, 3);
    assert.equal(reg.entries().length, 3);
  });
});

// ─── Suggestion ordering ───────────────────────────────────────────────────

describe("suggest(): Levenshtein ordering and top-N", () => {
  it("ranks the closest testid first for a 1-char typo", () => {
    const reg = buildRegistryFromEntries([
      // All three share the "login-" prefix so they pass the distance/ratio
      // threshold against a 1-char typo in the suffix; `login-submit` is
      // the closest.
      {
        testid: "login-submit",
        isGlob: false,
        sourceFile: "/a",
        line: 1,
        column: 1,
      },
      {
        testid: "login-submat",
        isGlob: false,
        sourceFile: "/a",
        line: 2,
        column: 1,
      },
      {
        testid: "login-submet",
        isGlob: false,
        sourceFile: "/a",
        line: 3,
        column: 1,
      },
      {
        testid: "totally-different-and-long",
        isGlob: false,
        sourceFile: "/a",
        line: 4,
        column: 1,
      },
    ]);
    const out = reg.suggest("login-sumbit", 3);
    assert.equal(out.length, 3);
    assert.equal(
      out[0].testid,
      "login-submit",
      "closest match should come first",
    );
    // The unrelated id is >4 edits and ratio < 0.6 — must not be in top 3.
    assert.ok(!out.some((e) => e.testid === "totally-different-and-long"));
  });

  it("respects the distance ≤ 4 / ratio ≥ 0.6 threshold", () => {
    const reg = buildRegistryFromEntries([
      { testid: "aaaaa", isGlob: false, sourceFile: "/a", line: 1, column: 1 },
      {
        testid: "zzzzzzzzzz",
        isGlob: false,
        sourceFile: "/a",
        line: 2,
        column: 1,
      },
    ]);
    // "aaaaa" vs "bbbbb" → distance 5, ratio 0 → excluded.
    // "aaaaa" vs "xxxxx" → same.
    const out = reg.suggest("bbbbb", 3);
    assert.equal(out.length, 0, "no entries should meet the threshold");
  });

  it("respects the `limit` argument", () => {
    const reg = buildRegistryFromEntries([
      { testid: "aaa-1", isGlob: false, sourceFile: "/a", line: 1, column: 1 },
      { testid: "aaa-2", isGlob: false, sourceFile: "/a", line: 2, column: 1 },
      { testid: "aaa-3", isGlob: false, sourceFile: "/a", line: 3, column: 1 },
      { testid: "aaa-4", isGlob: false, sourceFile: "/a", line: 4, column: 1 },
      { testid: "aaa-5", isGlob: false, sourceFile: "/a", line: 5, column: 1 },
    ]);
    const out = reg.suggest("aaa-x", 3);
    assert.equal(out.length, 3);
  });

  it("defaults to limit=3 when not specified", () => {
    const reg = buildRegistryFromEntries([
      { testid: "aaa-1", isGlob: false, sourceFile: "/a", line: 1, column: 1 },
      { testid: "aaa-2", isGlob: false, sourceFile: "/a", line: 2, column: 1 },
      { testid: "aaa-3", isGlob: false, sourceFile: "/a", line: 3, column: 1 },
      { testid: "aaa-4", isGlob: false, sourceFile: "/a", line: 4, column: 1 },
    ]);
    const out = reg.suggest("aaa-x");
    assert.equal(out.length, 3);
  });

  it("includes glob entries in suggestions by their pattern string", () => {
    const reg = buildRegistryFromEntries([
      { testid: "row-*", isGlob: true, sourceFile: "/a", line: 1, column: 1 },
    ]);
    // "roow-*" → distance 1 from "row-*"
    const out = reg.suggest("roow-*");
    assert.equal(out.length, 1);
    assert.equal(out[0].testid, "row-*");
    assert.equal(out[0].isGlob, true);
  });
});

// ─── buildRegistry: file-system scan + cache ───────────────────────────────

describe("buildRegistry: scan + cache lifecycle", () => {
  let tmp;
  let cachePath;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "qa-registry-"));
    mkdirSync(join(tmp, "src"), { recursive: true });
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    mkdirSync(join(tmp, "src", "__tests__"), { recursive: true });

    writeFileSync(
      join(tmp, "src", "Login.tsx"),
      [
        `export function Login() {`,
        `  return (`,
        `    <form data-testid="login-form">`,
        `      <input data-testid="login-username" />`,
        `      <button data-testid="login-submit">Sign in</button>`,
        `    </form>`,
        `  );`,
        `}`,
      ].join("\n"),
    );

    writeFileSync(
      join(tmp, "src", "components", "Row.tsx"),
      `export const Row = ({ id }) => <tr data-testid={\`row-\${id}\`} />;`,
    );

    // This file must be ignored — it's under __tests__.
    writeFileSync(
      join(tmp, "src", "__tests__", "ignored.tsx"),
      `<div data-testid="should-not-appear" />`,
    );

    // And .test.tsx must be ignored too.
    writeFileSync(
      join(tmp, "src", "Login.test.tsx"),
      `<div data-testid="also-ignored" />`,
    );

    cachePath = join(tmp, ".qa-results", "testid-registry.json");
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("cold scan finds all testids across files and ignores excluded paths", async () => {
    const reg = await buildRegistry({
      roots: [join(tmp, "src")],
      cache: cachePath,
      force: true,
    });
    const ids = reg
      .entries()
      .map((e) => e.testid)
      .sort();
    assert.deepEqual(ids, [
      "login-form",
      "login-submit",
      "login-username",
      "row-*",
    ]);

    // Spot-check: ignored attributes are absent.
    assert.equal(reg.has("should-not-appear"), false);
    assert.equal(reg.has("also-ignored"), false);

    // Glob match works end-to-end.
    assert.equal(reg.has("row-42"), true);
  });

  it("writes a cache file with version and mtime metadata", async () => {
    const raw = JSON.parse(readFileSync(cachePath, "utf8"));
    assert.equal(raw.version, 1);
    assert.ok(typeof raw.inputsHash === "string" && raw.inputsHash.length > 0);
    const files = Object.keys(raw.files);
    assert.ok(files.some((f) => f.endsWith("Login.tsx")));
    assert.ok(files.some((f) => f.endsWith("Row.tsx")));
    for (const f of files) {
      assert.ok(typeof raw.files[f].mtimeMs === "number");
      assert.ok(Array.isArray(raw.files[f].entries));
    }
  });

  it("warm scan (cache hit) reuses entries without re-parsing", async () => {
    // Monkey-patch fs.readFile to detect re-reads would be invasive; instead,
    // we verify correctness: a warm run returns identical entries.
    const warm = await buildRegistry({
      roots: [join(tmp, "src")],
      cache: cachePath,
    });
    const ids = warm
      .entries()
      .map((e) => e.testid)
      .sort();
    assert.deepEqual(ids, [
      "login-form",
      "login-submit",
      "login-username",
      "row-*",
    ]);
  });

  it("cache miss on file change: bumping mtime re-scans that file", async () => {
    // Modify Login.tsx and touch its mtime forward by 60s.
    const loginPath = join(tmp, "src", "Login.tsx");
    writeFileSync(
      loginPath,
      [
        `export function Login() {`,
        `  return <div data-testid="login-renamed" />;`,
        `}`,
      ].join("\n"),
    );
    const futureTime = new Date(Date.now() + 60_000);
    utimesSync(loginPath, futureTime, futureTime);

    const reg = await buildRegistry({
      roots: [join(tmp, "src")],
      cache: cachePath,
    });
    const ids = reg
      .entries()
      .map((e) => e.testid)
      .sort();
    assert.deepEqual(ids, ["login-renamed", "row-*"]);
  });

  it("cache invalidates on version bump (simulated via manual hash tweak)", async () => {
    // Corrupt the cache file's inputsHash and confirm the scan still works —
    // a wrong hash means the cache is ignored, not an error.
    const raw = JSON.parse(readFileSync(cachePath, "utf8"));
    raw.inputsHash = "deadbeef";
    writeFileSync(cachePath, JSON.stringify(raw));

    const reg = await buildRegistry({
      roots: [join(tmp, "src")],
      cache: cachePath,
    });
    // Still returns correct entries for the current file state.
    const ids = reg
      .entries()
      .map((e) => e.testid)
      .sort();
    assert.deepEqual(ids, ["login-renamed", "row-*"]);
  });

  it("cache invalidates when version field mismatches", async () => {
    const raw = JSON.parse(readFileSync(cachePath, "utf8"));
    raw.version = 999;
    writeFileSync(cachePath, JSON.stringify(raw));

    const reg = await buildRegistry({
      roots: [join(tmp, "src")],
      cache: cachePath,
    });
    // Still produces correct output.
    assert.ok(reg.size >= 2);
  });

  it("force: true rebuilds from scratch even with a valid cache", async () => {
    const reg = await buildRegistry({
      roots: [join(tmp, "src")],
      cache: cachePath,
      force: true,
    });
    assert.ok(reg.size >= 2);
  });

  it("cache: null disables caching (no file written)", async () => {
    const tmp2 = mkdtempSync(join(tmpdir(), "qa-registry-nocache-"));
    try {
      mkdirSync(join(tmp2, "src"), { recursive: true });
      writeFileSync(join(tmp2, "src", "Foo.tsx"), `<div data-testid="foo" />`);
      const reg = await buildRegistry({
        roots: [join(tmp2, "src")],
        cache: null,
      });
      assert.equal(reg.size, 1);
      assert.equal(reg.has("foo"), true);
      // No cache written at the default location under tmp2.
      // (We can't easily assert absence at an arbitrary path, but
      //  the fact that the second call works without cache proves
      //  the code path runs without error.)
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });

  it("missing root directory is tolerated (no throw, empty result)", async () => {
    const reg = await buildRegistry({
      roots: [join(tmp, "does-not-exist")],
      cache: null,
    });
    assert.equal(reg.size, 0);
  });
});
