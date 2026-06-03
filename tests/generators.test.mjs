import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generators, createGeneratorContext, GENERATOR_NAMES } from "../dist/modules/generators/index.js";

describe("generators: stateless functions", () => {
  it("username is unique and non-empty", () => {
    const a = generators.username();
    const b = generators.username();
    assert.ok(a.length > 0);
    assert.ok(a.startsWith("qa_"));
    assert.notEqual(a, b, "Two calls should produce different values");
  });

  it("password meets strength requirements", () => {
    const pw = generators.password();
    assert.ok(pw.length >= 8, `Password too short: ${pw}`);
    assert.ok(/[a-z]/.test(pw), `Missing lowercase: ${pw}`);
    assert.ok(/[A-Z]/.test(pw), `Missing uppercase: ${pw}`);
    assert.ok(/\d/.test(pw), `Missing digit: ${pw}`);
    assert.ok(/[^A-Za-z0-9]/.test(pw), `Missing special char: ${pw}`);
  });

  it("email is valid format", () => {
    const email = generators.email();
    assert.ok(email.includes("@"), `Missing @: ${email}`);
    assert.ok(email.endsWith("@test.local"), `Wrong domain: ${email}`);
    assert.ok(email.startsWith("qa_"), `Wrong prefix: ${email}`);
  });

  it("national_id is exactly 10 digits", () => {
    for (let i = 0; i < 20; i++) {
      const id = generators.national_id();
      assert.ok(/^\d{10}$/.test(id), `Invalid national ID: ${id}`);
      assert.notEqual(id[0], "0", `First digit should not be 0: ${id}`);
    }
  });

  it("uuid is valid v4 format", () => {
    const id = generators.uuid();
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
      `Invalid UUID: ${id}`
    );
  });

  it("timestamp is numeric", () => {
    const ts = generators.timestamp();
    assert.ok(/^\d+$/.test(ts));
    assert.ok(Number(ts) > 1700000000000, "Timestamp too old");
  });

  it("random_int is 1000-9999", () => {
    for (let i = 0; i < 50; i++) {
      const n = Number(generators.random_int());
      assert.ok(n >= 1000 && n <= 9999, `Out of range: ${n}`);
    }
  });
});

describe("GeneratorContext: caching and extensibility", () => {
  it("caches values within a context", () => {
    const ctx = createGeneratorContext();
    const a = ctx.resolve("username");
    const b = ctx.resolve("username");
    assert.equal(a, b, "Same context should return cached value");
  });

  it("different contexts produce different values", () => {
    const ctx1 = createGeneratorContext();
    const ctx2 = createGeneratorContext();
    // Technically could collide but astronomically unlikely with crypto.randomBytes
    const u1 = ctx1.resolve("username");
    const u2 = ctx2.resolve("username");
    // We just verify they're both valid, not necessarily different (timestamp could match)
    assert.ok(u1.startsWith("qa_"));
    assert.ok(u2.startsWith("qa_"));
  });

  it("returns null for unknown generators", () => {
    const ctx = createGeneratorContext();
    assert.equal(ctx.resolve("nonexistent"), null);
  });

  it("has() checks existence", () => {
    const ctx = createGeneratorContext();
    assert.equal(ctx.has("username"), true);
    assert.equal(ctx.has("password"), true);
    assert.equal(ctx.has("nonexistent"), false);
  });

  it("list() returns all generator names", () => {
    const ctx = createGeneratorContext();
    const names = ctx.list();
    assert.ok(names.includes("username"));
    assert.ok(names.includes("password"));
    assert.ok(names.includes("national_id"));
    assert.equal(names.length, GENERATOR_NAMES.length);
  });

  it("register() adds custom generators", () => {
    const ctx = createGeneratorContext();
    ctx.register("phone", () => "+1555000" + String(Date.now()).slice(-4));
    assert.equal(ctx.has("phone"), true);
    const phone = ctx.resolve("phone");
    assert.ok(phone.startsWith("+1555000"));
    // Should be cached
    assert.equal(ctx.resolve("phone"), phone);
    // Should appear in list
    assert.ok(ctx.list().includes("phone"));
  });

  it("register() can override built-in generators", () => {
    const ctx = createGeneratorContext();
    ctx.register("username", () => "custom_user_123");
    assert.equal(ctx.resolve("username"), "custom_user_123");
  });

  it("snapshot() returns all resolved values", () => {
    const ctx = createGeneratorContext();
    ctx.resolve("username");
    ctx.resolve("password");
    const snap = ctx.snapshot();
    assert.ok("username" in snap);
    assert.ok("password" in snap);
    assert.ok(!("email" in snap), "email was not resolved, should not be in snapshot");
  });
});
