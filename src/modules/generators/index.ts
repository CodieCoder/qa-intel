/**
 * Test data generators for Gherkin `{{gen.*}}` placeholders.
 *
 * Each generator produces valid, unique test data that satisfies common form
 * validation rules (Zod schemas, HTML5 constraints, etc.). Values are generated
 * via `crypto` for uniqueness and security.
 *
 * ## Usage
 *
 * ### As a compile-time generator set
 * ```ts
 * import { createGeneratorContext } from "@codie/qa-intel";
 *
 * const ctx = createGeneratorContext();
 * const username = ctx.resolve("username"); // "qa_1776113402750_a1b2c3"
 * const password = ctx.resolve("password"); // "Qa4f8e2b1c!1"
 * ctx.resolve("username"); // same value — cached per context
 * ```
 *
 * ### Register custom generators
 * ```ts
 * const ctx = createGeneratorContext();
 * ctx.register("phone", () => `+1${Date.now().toString().slice(-10)}`);
 * ctx.resolve("phone"); // "+11776113402"
 * ```
 *
 * ### Standalone (no context)
 * ```ts
 * import { generators } from "@codie/qa-intel";
 * generators.username(); // new value each call
 * generators.password(); // new value each call
 * ```
 */

import { randomBytes, randomUUID } from "node:crypto";

// ─── Generator Functions ─────────────────────────────────────────────────────
// Each function returns a fresh value on every call.
// For cached (once-per-compile) behavior, use GeneratorContext.

/** All built-in generator functions. Stateless — each call produces a new value. */
export const generators = {
  /**
   * Unique username: `qa_<timestamp>_<hex>`
   * Meets: non-empty, ASCII-safe, unique across runs.
   */
  username(): string {
    return `qa_${Date.now()}_${randomBytes(3).toString("hex")}`;
  },

  /**
   * Valid password: `Qa<8-hex-chars>!1`
   * Meets: ≥8 chars, uppercase (`Q`), lowercase (`a`), digit (`1`), special char (`!`).
   * Compatible with: Zod `.min(8).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).regex(/[^A-Za-z0-9]/)`
   */
  password(): string {
    const base = randomBytes(4).toString("hex"); // 8 hex chars (a-f, 0-9)
    return `Qa${base}!1`;
  },

  /**
   * Unique email: `qa_<timestamp>_<hex>@test.local`
   * Meets: valid email format, unique, non-empty.
   */
  email(): string {
    return `qa_${Date.now()}_${randomBytes(3).toString("hex")}@test.local`;
  },

  /**
   * Valid 10-digit national ID: `<digit1-9><9-random-digits>`
   * Meets: Zod `.regex(/^\d{10}$/)`
   */
  national_id(): string {
    // Use crypto for consistency (not Math.random)
    const bytes = randomBytes(5); // 5 bytes = 10 hex chars, but we need decimal
    const first = (bytes[0] % 9) + 1; // 1-9
    const rest = Array.from(bytes.subarray(1), (b) => b % 10).join("") +
      ((bytes[0] >> 4) % 10).toString() +
      Array.from(randomBytes(4), (b) => b % 10).join("");
    return `${first}${rest}`.slice(0, 10);
  },

  /** UUID v4. */
  uuid(): string {
    return randomUUID();
  },

  /** Current Unix timestamp in milliseconds (as string). */
  timestamp(): string {
    return String(Date.now());
  },

  /** Random integer 1000–9999 (as string). */
  random_int(): string {
    const bytes = randomBytes(2);
    const num = 1000 + (((bytes[0] << 8) | bytes[1]) % 9000);
    return String(num);
  },
} satisfies Record<string, () => string>;

/** Names of all built-in generators. */
export type GeneratorName = keyof typeof generators;

/** All supported generator names as an array (for validation/docs). */
export const GENERATOR_NAMES: string[] = Object.keys(generators);

// ─── Generator Context ──────────────────────────────────────────────────────
// Caches values so the same placeholder resolves to the same value within a
// single compile/run. Supports registering custom generators.

export interface IGeneratorContext {
  /** Resolve a generator by name. Cached — same name returns same value within this context. */
  resolve(name: string): string | null;
  /** Register a custom generator. Overwrites built-in if same name. */
  register(name: string, fn: () => string): void;
  /** Check if a generator exists (built-in or custom). */
  has(name: string): boolean;
  /** List all available generator names (built-in + custom). */
  list(): string[];
  /** Get all resolved values so far (for debugging/logging). */
  snapshot(): Record<string, string>;
}

/**
 * Create a generator context that caches values for the lifetime of a
 * compile or test run. Each `resolve()` call for the same name returns
 * the same value.
 *
 * Supports **numbered variants**: `username_1`, `username_2`, etc.
 * The `_N` suffix is stripped to find the base generator, but the full
 * name (with suffix) is used as the cache key. This produces distinct
 * values for scenarios that need multiple unique instances of the same
 * data type (e.g. registering 3 different users in one suite).
 */
export function createGeneratorContext(): IGeneratorContext {
  const cache = new Map<string, string>();
  const custom = new Map<string, () => string>();

  /**
   * Find the generator function for a name, supporting `_N` suffix variants.
   * E.g. "username_2" → finds the "username" generator.
   */
  function findGenerator(name: string): (() => string) | null {
    // Exact match first (custom or built-in)
    const exact = custom.get(name) ?? (generators as Record<string, (() => string) | undefined>)[name];
    if (exact) return exact;

    // Try stripping _N suffix (e.g. "username_2" → "username")
    const suffixMatch = name.match(/^(.+)_(\d+)$/);
    if (suffixMatch) {
      const baseName = suffixMatch[1];
      return custom.get(baseName) ?? (generators as Record<string, (() => string) | undefined>)[baseName] ?? null;
    }

    return null;
  }

  return {
    resolve(name: string): string | null {
      if (cache.has(name)) return cache.get(name)!;

      const fn = findGenerator(name);
      if (!fn) return null;

      const value = fn();
      cache.set(name, value);
      return value;
    },

    register(name: string, fn: () => string): void {
      custom.set(name, fn);
      cache.delete(name);
    },

    has(name: string): boolean {
      return findGenerator(name) !== null;
    },

    list(): string[] {
      const names = new Set([...GENERATOR_NAMES, ...custom.keys()]);
      return [...names].sort();
    },

    snapshot(): Record<string, string> {
      return Object.fromEntries(cache);
    },
  };
}
