import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ELEMENT_KINDS,
  RECOMMENDED_KINDS,
  ELEMENT_KIND_CATEGORIES,
  isRecommendedKind,
  suggestKinds,
  kindsByCategory,
} from "../dist/modules/dsl/element-kinds.js";

const VALID_CATEGORIES = new Set([
  "layout",
  "navigation",
  "forms",
  "actions",
  "data",
  "feedback",
  "media",
]);

describe("element-kinds: vocabulary shape", () => {
  it("RECOMMENDED_KINDS matches the documented vocabulary size", () => {
    assert.equal(RECOMMENDED_KINDS.size, 44);
    assert.equal(ELEMENT_KINDS.length, 44);
  });

  it("every entry has a valid category and a non-empty description", () => {
    for (const def of ELEMENT_KINDS) {
      assert.ok(
        VALID_CATEGORIES.has(def.category),
        `Invalid category "${def.category}" for kind "${def.kind}"`,
      );
      assert.ok(
        typeof def.description === "string" && def.description.length > 0,
        `Empty or non-string description for kind "${def.kind}"`,
      );
      assert.ok(
        typeof def.kind === "string" && def.kind.length > 0,
        `Empty or non-string kind`,
      );
    }
  });

  it("every kind is unique (kebab-case token)", () => {
    const seen = new Set();
    for (const def of ELEMENT_KINDS) {
      assert.ok(!seen.has(def.kind), `Duplicate kind: ${def.kind}`);
      seen.add(def.kind);
      assert.match(
        def.kind,
        /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
        `Kind "${def.kind}" is not kebab-case`,
      );
    }
  });
});

describe("element-kinds: isRecommendedKind", () => {
  it("returns true for a known kind", () => {
    assert.equal(isRecommendedKind("button"), true);
    assert.equal(isRecommendedKind("form"), true);
    assert.equal(isRecommendedKind("file-input"), true);
  });

  it("returns false for an unknown kind", () => {
    assert.equal(isRecommendedKind("widget"), false);
    assert.equal(isRecommendedKind(""), false);
    assert.equal(isRecommendedKind("BUTTON"), false); // case-sensitive
  });
});

describe("element-kinds: suggestKinds", () => {
  it("top suggestion for 'buton' is 'button'", () => {
    const results = suggestKinds("buton");
    assert.ok(results.length > 0, "expected at least one suggestion");
    assert.equal(results[0].kind, "button");
  });

  it("returns fewer than `limit` when threshold rejects all candidates", () => {
    // Input that shares no characters with any recommended kind and is long
    // enough that distance > 4 AND ratio < 0.6 for every candidate.
    // Distance to any kind k = max(input.length, k.length) because no chars
    // overlap. With input length 20, distance ≥ 20 > 4 and ratio = 0 < 0.6.
    const results = suggestKinds("xxxxxxxxxxxxxxxxxxxx", 5);
    assert.ok(
      results.length < 5,
      `expected fewer than 5 suggestions for far-off input, got ${results.length}: ${JSON.stringify(results.map((r) => r.kind))}`,
    );
  });

  it("respects the `limit` parameter", () => {
    const one = suggestKinds("buton", 1);
    assert.equal(one.length, 1);
    assert.equal(one[0].kind, "button");
  });

  it("returns the exact match first when input is a known kind", () => {
    const results = suggestKinds("button", 3);
    assert.ok(results.length > 0);
    assert.equal(results[0].kind, "button");
  });

  it("returns empty array when limit is 0", () => {
    const results = suggestKinds("button", 0);
    assert.equal(results.length, 0);
  });
});

describe("element-kinds: kindsByCategory", () => {
  it("returns exactly 7 keys", () => {
    const grouped = kindsByCategory();
    const keys = Object.keys(grouped);
    assert.equal(keys.length, 7);
    for (const cat of ELEMENT_KIND_CATEGORIES) {
      assert.ok(cat in grouped, `missing category: ${cat}`);
    }
  });

  it("every kind appears in exactly one category", () => {
    const grouped = kindsByCategory();
    const seenKinds = new Map(); // kind -> category
    for (const [cat, defs] of Object.entries(grouped)) {
      for (const def of defs) {
        assert.ok(
          !seenKinds.has(def.kind),
          `kind "${def.kind}" appears in both "${seenKinds.get(def.kind)}" and "${cat}"`,
        );
        seenKinds.set(def.kind, cat);
      }
    }
    assert.equal(
      seenKinds.size,
      ELEMENT_KINDS.length,
      "not every kind from ELEMENT_KINDS appears in kindsByCategory()",
    );
  });

  it("each grouped entry has the matching category field", () => {
    const grouped = kindsByCategory();
    for (const [cat, defs] of Object.entries(grouped)) {
      for (const def of defs) {
        assert.equal(
          def.category,
          cat,
          `kind "${def.kind}" in bucket "${cat}" has category "${def.category}"`,
        );
      }
    }
  });
});
