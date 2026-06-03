/**
 * Static testid registry — scans source files for `data-testid` attributes
 * and exposes a `has() / lookup() / suggest()` API.
 *
 * See `artifacts/analysis/qa-agent-grammar-migration-plan.md` §9.
 *
 * ## Accepted attribute forms (§9.2)
 *
 * 1. Static string literal — `data-testid="foo-bar"` / `data-testid='foo-bar'`
 *    → registers exact `foo-bar`.
 * 2. Template literal with no interpolation — ``data-testid={`foo-bar`}``
 *    → registers exact `foo-bar`.
 * 3. Template literal with interpolation — ``data-testid={`row-${id}`}``
 *    → registers glob `row-*` (every `${…}` becomes a `*`).
 * 4. Ternary where both branches are forms #1–#3 — both branches registered.
 *
 * Anything else (prop forwards, arbitrary identifiers, call expressions,
 * member lookups, `&&` conditionals, etc.) is ignored by the scanner. The
 * ESLint rule `no-non-literal-testid` (PR 2) enforces at source that every
 * `data-testid` matches one of the four accepted forms, so no scanner
 * special case is needed for "opaque" expressions.
 *
 * ## Lookup semantics (§9.1)
 *
 * - `has(x)` → true iff `x` matches an exact entry OR a glob entry.
 * - Glob `*` matches one or more characters with no hyphen-boundary
 *   restriction. `row-*` matches `row-123`, `row-user-42`, `row-a-b-c`.
 * - `lookup(x)` prefers exact matches over glob matches; within a class
 *   the first registered entry wins.
 * - `suggest(x, limit)` returns up to `limit` entries whose Levenshtein
 *   distance to `x` is ≤ 4 or whose similarity ratio is ≥ 0.6, ordered
 *   by ascending distance.
 */

import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve, relative, dirname, sep, posix } from "node:path";

// ─── Public types ──────────────────────────────────────────────────────────

export interface RegistryEntry {
  /** Exact testid (e.g. `login-submit`) or a glob pattern (e.g. `row-*`). */
  testid: string;
  /** True iff the entry was declared via an interpolated template literal. */
  isGlob: boolean;
  /** Absolute path of the source file where the testid was declared. */
  sourceFile: string;
  /** 1-indexed line number. */
  line: number;
  /** 1-indexed column number of the start of the attribute. */
  column: number;
}

export interface TestidRegistry {
  /** True iff `testid` matches any exact or glob entry. */
  has(testid: string): boolean;
  /**
   * Return the first entry matching `testid` — exact match preferred over
   * glob match, or `null` if nothing matches.
   */
  lookup(testid: string): RegistryEntry | null;
  /**
   * Suggest up to `limit` entries whose Levenshtein distance to `testid`
   * is ≤ 4, or similarity ratio ≥ 0.6. Ordered by ascending distance.
   */
  suggest(testid: string, limit?: number): RegistryEntry[];
  /** Return a snapshot array of all registered entries. */
  entries(): RegistryEntry[];
  /** Total number of registered entries. */
  readonly size: number;
}

export interface BuildRegistryOptions {
  /** One or more source roots to scan. Relative paths are resolved from `process.cwd()`. */
  roots: string[];
  /**
   * Extra ignore globs, merged with the built-in ignores:
   *   `node_modules`, `__tests__`, `*.test.{ts,tsx}`, `*.spec.{ts,tsx}`,
   *   `stories`, `*.stories.{ts,tsx}`, `dist`, `.next`, `build`.
   */
  ignore?: string[];
  /**
   * Cache file path. Defaults to `.qa-results/testid-registry.json` under
   * `process.cwd()`. Pass `null` to disable the cache entirely.
   */
  cache?: string | null;
  /** Ignore the existing cache and rebuild from scratch. */
  force?: boolean;
}

// ─── Cache schema ──────────────────────────────────────────────────────────

/**
 * Bumped whenever the cache schema or the scanner's extraction semantics
 * change. A version mismatch triggers a full rebuild.
 */
const CACHE_VERSION = 1;

interface CacheFileShape {
  version: number;
  /** The set of inputs that produced this cache, hashed. If inputs change, cache is invalid. */
  inputsHash: string;
  /** map: absolute source file → { mtimeMs, entries[] }. */
  files: Record<string, CachedFile>;
}

interface CachedFile {
  mtimeMs: number;
  entries: RegistryEntry[];
}

// ─── Built-in ignore patterns ──────────────────────────────────────────────

/**
 * Return true if the given absolute path should be skipped based on the
 * built-in ignores plus any user-supplied ignores. The user-supplied
 * ignores are matched as simple substrings on the POSIX-style path (this
 * mirrors what §9.2 specifies — these aren't full glob matchers, they're
 * path substring checks; the defaults cover the cases that matter).
 */
function isIgnoredPath(absPath: string, extraIgnores: string[]): boolean {
  // Normalise to POSIX separators for portable substring matching.
  const p = absPath.split(sep).join(posix.sep);

  // Built-ins (§9.2).
  if (p.includes("/node_modules/")) return true;
  if (p.includes("/__tests__/")) return true;
  if (p.includes("/stories/")) return true;
  if (p.includes("/dist/")) return true;
  if (p.includes("/.next/")) return true;
  if (p.includes("/build/")) return true;
  if (/\.test\.(ts|tsx|js|jsx)$/.test(p)) return true;
  if (/\.spec\.(ts|tsx|js|jsx)$/.test(p)) return true;
  if (/\.stories\.(ts|tsx|js|jsx)$/.test(p)) return true;

  for (const frag of extraIgnores) {
    if (frag.length > 0 && p.includes(frag)) return true;
  }
  return false;
}

const SCANNABLE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

// ─── Directory walk ────────────────────────────────────────────────────────

async function walk(root: string, extraIgnores: string[]): Promise<string[]> {
  const out: string[] = [];
  const absRoot = resolve(root);

  async function visit(dir: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // directory missing or unreadable — skip
    }
    for (const item of items) {
      const abs = join(dir, item.name);
      if (isIgnoredPath(abs, extraIgnores)) continue;
      if (item.isDirectory()) {
        await visit(abs);
      } else if (item.isFile()) {
        const dot = item.name.lastIndexOf(".");
        const ext = dot >= 0 ? item.name.slice(dot) : "";
        if (SCANNABLE_EXTENSIONS.has(ext)) {
          out.push(abs);
        }
      }
    }
  }

  await visit(absRoot);
  return out;
}

// ─── Scanner ───────────────────────────────────────────────────────────────

/**
 * Scan a single source file's text and return the set of registry entries
 * it contains. The caller is responsible for providing the absolute path
 * (used as `sourceFile` on each entry).
 *
 * LIMITATION: The scan is line-based. A `data-testid` attribute whose value
 * expression spans multiple source lines will not be captured. This matches
 * real-world Prettier-formatted codebases (attributes rarely wrap) but
 * imposes a hard constraint: feature-file authors must format each
 * `data-testid="..."` declaration on a single line. The ESLint rule accepts
 * multi-line forms; a future scanner pass should do the same. Tracked as a
 * v2 follow-up in artifacts/analysis/qa-agent-grammar-migration-plan.md §17.
 */
export function scanSource(
  absSourcePath: string,
  text: string,
): RegistryEntry[] {
  const out: RegistryEntry[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    let searchFrom = 0;

    // Multiple data-testid occurrences on one line? Rare but handle it.
    while (true) {
      const attrIdx = line.indexOf("data-testid=", searchFrom);
      if (attrIdx < 0) break;
      searchFrom = attrIdx + "data-testid=".length;

      const afterEq = attrIdx + "data-testid=".length;
      // Need at least one char after `=`.
      if (afterEq >= line.length) continue;

      const rhs = line.slice(afterEq);
      const extracted = extractFromRhs(rhs);
      for (const e of extracted) {
        out.push({
          testid: e.testid,
          isGlob: e.isGlob,
          sourceFile: absSourcePath,
          line: lineIdx + 1,
          column: attrIdx + 1,
        });
      }
    }
  }

  return out;
}

/** Result of parsing a single accepted form. */
interface RawTestid {
  testid: string;
  isGlob: boolean;
}

/**
 * Parse the text following `data-testid=`. Returns zero or more testids.
 *
 * Handled cases:
 *   "foo-bar"      → [exact foo-bar]
 *   'foo-bar'      → [exact foo-bar]
 *   {"foo"}        → [exact foo]
 *   {'foo'}        → [exact foo]
 *   {`foo-${x}`}   → [glob foo-*]
 *   {`foo-bar`}    → [exact foo-bar]
 *   {a ? X : Y}    → extract(X), extract(Y)     (X, Y must be one of the above)
 *
 * Anything else → []. The ESLint rule is responsible for preventing other
 * shapes from entering the codebase.
 */
function extractFromRhs(rhs: string): RawTestid[] {
  // Direct string literal (no JSX-expression braces).
  if (rhs[0] === '"' || rhs[0] === "'") {
    const quote = rhs[0];
    const end = rhs.indexOf(quote, 1);
    if (end < 0) return [];
    return [{ testid: rhs.slice(1, end), isGlob: false }];
  }

  // JSX expression: must start with `{`.
  if (rhs[0] !== "{") return [];

  // Find the matching closing brace, respecting nested braces / strings / template backticks.
  const inner = sliceBracedExpression(rhs);
  if (inner === null) return [];

  return parseExpression(inner.trim());
}

/**
 * Given `rhs` starting with `{`, return the text between the outermost
 * braces (not including the braces themselves), or `null` if no
 * balanced closing brace exists on the current line. The parser tracks:
 *
 *   - Nested `{…}`
 *   - `'…'` / `"…"` single- and double-quoted strings (with `\` escape)
 *   - `` `…${ … }…` `` template literals, including nested braces in `${…}`
 */
function sliceBracedExpression(rhs: string): string | null {
  // rhs[0] === '{'
  let depth = 0;
  // 0 = normal, 1 = single-quote string, 2 = double-quote string,
  // 3 = template literal (may contain nested ${ })
  let mode: 0 | 1 | 2 | 3 = 0;
  // For mode 3 (template), a stack of "depth at which we entered a ${}".
  const templateExprDepth: number[] = [];

  for (let i = 0; i < rhs.length; i++) {
    const c = rhs[i]!;
    const prev = i > 0 ? rhs[i - 1]! : "";

    if (mode === 1) {
      if (c === "'" && prev !== "\\") mode = 0;
      continue;
    }
    if (mode === 2) {
      if (c === '"' && prev !== "\\") mode = 0;
      continue;
    }
    if (mode === 3) {
      if (c === "`" && prev !== "\\") {
        mode = 0;
      } else if (c === "$" && rhs[i + 1] === "{") {
        templateExprDepth.push(depth);
        depth++;
        mode = 0;
        i++; // skip the '{'
      }
      continue;
    }

    // Normal mode.
    if (c === "'") {
      mode = 1;
      continue;
    }
    if (c === '"') {
      mode = 2;
      continue;
    }
    if (c === "`") {
      mode = 3;
      continue;
    }
    if (c === "{") {
      depth++;
      continue;
    }
    if (c === "}") {
      depth--;
      if (
        templateExprDepth.length > 0 &&
        templateExprDepth[templateExprDepth.length - 1] === depth
      ) {
        // Closing the `${…}` expression; return to template mode.
        templateExprDepth.pop();
        mode = 3;
        continue;
      }
      if (depth === 0) {
        // We consumed the opening `{` at i=0 implicitly; return content.
        return rhs.slice(1, i);
      }
    }
  }

  return null;
}

/**
 * Parse an already-unwrapped JSX expression (no surrounding `{…}`). Returns
 * the registered testids, or [] if the shape isn't one of our accepted
 * forms.
 */
function parseExpression(expr: string): RawTestid[] {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return [];

  // String literal: "foo" or 'foo'.
  if (trimmed[0] === '"' || trimmed[0] === "'") {
    const quote = trimmed[0];
    // Ensure the literal terminates cleanly and nothing follows.
    const end = findStringEnd(trimmed, 0, quote);
    if (end < 0) return [];
    if (trimmed.slice(end + 1).trim() !== "") return []; // concatenation / anything else → reject
    return [{ testid: trimmed.slice(1, end), isGlob: false }];
  }

  // Template literal.
  if (trimmed[0] === "`") {
    const end = findTemplateEnd(trimmed, 0);
    if (end < 0) return [];
    if (trimmed.slice(end + 1).trim() !== "") return [];
    return [templateToEntry(trimmed.slice(1, end))];
  }

  // Ternary: COND ? A : B   where A and B are both string literals or template literals.
  const ternary = splitTernary(trimmed);
  if (ternary !== null) {
    const results: RawTestid[] = [];
    for (const branch of [ternary.then, ternary.else]) {
      const parsed = parseExpression(branch);
      if (parsed.length === 0) return []; // if either branch fails, reject the whole thing
      results.push(...parsed);
    }
    return results;
  }

  // Anything else (bare identifier, member, call, …) → ignored by design.
  return [];
}

/** Return the index of the closing quote of a string starting at `start`, or -1. */
function findStringEnd(s: string, start: number, quote: string): number {
  for (let i = start + 1; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === quote) return i;
  }
  return -1;
}

/** Return the index of the closing backtick of a template starting at `start`, or -1. */
function findTemplateEnd(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") return i;
    if (c === "$" && s[i + 1] === "{") {
      // Skip past the interpolation.
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        const cc = s[i]!;
        if (cc === "{") depth++;
        else if (cc === "}") depth--;
        else if (cc === "'" || cc === '"') {
          const end = findStringEnd(s, i, cc);
          if (end < 0) return -1;
          i = end + 1;
          continue;
        } else if (cc === "`") {
          const end = findTemplateEnd(s, i);
          if (end < 0) return -1;
          i = end + 1;
          continue;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return -1;
}

/**
 * Convert the inside of a template literal (between the backticks) to a
 * registry entry. `${…}` interpolations become `*`. If no interpolations
 * exist, the entry is exact.
 */
function templateToEntry(inner: string): RawTestid {
  let out = "";
  let i = 0;
  let hasInterp = false;
  while (i < inner.length) {
    const c = inner[i]!;
    if (c === "\\") {
      // Preserve escaped char literally (rare in practice).
      if (i + 1 < inner.length) {
        out += inner[i + 1];
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (c === "$" && inner[i + 1] === "{") {
      hasInterp = true;
      out += "*";
      // Skip past the interpolation (balanced braces).
      let depth = 1;
      i += 2;
      while (i < inner.length && depth > 0) {
        const cc = inner[i]!;
        if (cc === "{") depth++;
        else if (cc === "}") depth--;
        else if (cc === "'" || cc === '"') {
          const end = findStringEnd(inner, i, cc);
          if (end < 0) return { testid: out, isGlob: hasInterp };
          i = end + 1;
          continue;
        } else if (cc === "`") {
          const end = findTemplateEnd(inner, i);
          if (end < 0) return { testid: out, isGlob: hasInterp };
          i = end + 1;
          continue;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  // Collapse consecutive `*` (e.g. ``${a}${b}``) into a single `*`.
  if (hasInterp) out = out.replace(/\*+/g, "*");
  return { testid: out, isGlob: hasInterp };
}

interface TernaryParts {
  cond: string;
  then: string;
  else: string;
}

/**
 * Try to split `expr` as `COND ? THEN : ELSE`. Respects nested strings,
 * template literals, and parens/braces. Returns `null` if the expression
 * is not a top-level ternary.
 */
function splitTernary(expr: string): TernaryParts | null {
  let depth = 0;
  let mode: 0 | 1 | 2 | 3 = 0;
  const templateExprDepth: number[] = [];
  let qIdx = -1;
  let colonIdx = -1;
  // Track ternary nesting within the same scope so a `? :` inside a nested
  // ternary in the condition or then-branch doesn't throw us off.
  let nestedTernary = 0;

  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!;
    const prev = i > 0 ? expr[i - 1]! : "";

    if (mode === 1) {
      if (c === "'" && prev !== "\\") mode = 0;
      continue;
    }
    if (mode === 2) {
      if (c === '"' && prev !== "\\") mode = 0;
      continue;
    }
    if (mode === 3) {
      if (c === "`" && prev !== "\\") mode = 0;
      else if (c === "$" && expr[i + 1] === "{") {
        templateExprDepth.push(depth);
        depth++;
        mode = 0;
        i++;
      }
      continue;
    }

    if (c === "'") {
      mode = 1;
      continue;
    }
    if (c === '"') {
      mode = 2;
      continue;
    }
    if (c === "`") {
      mode = 3;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (
        c === "}" &&
        templateExprDepth.length > 0 &&
        templateExprDepth[templateExprDepth.length - 1] === depth
      ) {
        templateExprDepth.pop();
        mode = 3;
      }
      continue;
    }

    if (depth !== 0) continue;

    if (c === "?") {
      // Skip `??` nullish-coalescing operator.
      if (expr[i + 1] === "?") {
        i++;
        continue;
      }
      // Skip `?.` optional chaining.
      if (expr[i + 1] === ".") {
        i++;
        continue;
      }
      if (qIdx < 0) qIdx = i;
      else nestedTernary++;
      continue;
    }
    if (c === ":") {
      if (qIdx >= 0 && nestedTernary === 0 && colonIdx < 0) {
        colonIdx = i;
        // Found the top-level ternary; we can stop — but we still need to
        // consume to end of expression to know there's no trailing content
        // that breaks the shape. We'll just continue and let the caller
        // use the first match.
        break;
      } else if (nestedTernary > 0) {
        nestedTernary--;
      }
      continue;
    }
  }

  if (qIdx < 0 || colonIdx < 0) return null;
  const cond = expr.slice(0, qIdx).trim();
  const thenBranch = expr.slice(qIdx + 1, colonIdx).trim();
  const elseBranch = expr.slice(colonIdx + 1).trim();
  if (thenBranch.length === 0 || elseBranch.length === 0) return null;
  return { cond, then: thenBranch, else: elseBranch };
}

// ─── Glob matching ─────────────────────────────────────────────────────────

/**
 * Convert a glob pattern (where `*` matches one or more characters,
 * including hyphens and slashes) to a RegExp.
 */
function globToRegExp(pattern: string): RegExp {
  // Escape regex metachars, then convert `\*` back to `.+`.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexBody = escaped.replace(/\*/g, ".+");
  return new RegExp("^" + regexBody + "$");
}

// ─── Levenshtein distance ──────────────────────────────────────────────────

/** Standard Levenshtein distance. O(m*n) time and space. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = curr[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n]!;
}

// ─── Cache I/O ─────────────────────────────────────────────────────────────

async function readCache(path: string): Promise<CacheFileShape | null> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as CacheFileShape;
    if (parsed?.version !== CACHE_VERSION) return null;
    if (typeof parsed.inputsHash !== "string") return null;
    if (typeof parsed.files !== "object" || parsed.files === null) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(path: string, cache: CacheFileShape): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(cache), "utf8");
  } catch {
    // Cache write failures are non-fatal — scanning still returned correct data.
  }
}

function hashInputs(roots: string[], ignore: string[]): string {
  const h = createHash("sha256");
  h.update(String(CACHE_VERSION));
  h.update("\0");
  for (const r of [...roots].sort()) {
    h.update(resolve(r));
    h.update("\0");
  }
  h.update("|ignore|");
  for (const i of [...ignore].sort()) {
    h.update(i);
    h.update("\0");
  }
  return h.digest("hex");
}

// ─── buildRegistry — public entry point ────────────────────────────────────

const DEFAULT_CACHE_PATH = ".qa-results/testid-registry.json";

export async function buildRegistry(
  opts: BuildRegistryOptions,
): Promise<TestidRegistry> {
  const roots = opts.roots.map((r) => resolve(r));
  const extraIgnores = opts.ignore ?? [];
  const cachePath =
    opts.cache === null
      ? null
      : opts.cache
        ? resolve(opts.cache)
        : resolve(DEFAULT_CACHE_PATH);
  const force = opts.force ?? false;

  const inputsHash = hashInputs(roots, extraIgnores);

  // Load existing cache (if any, not forced, and inputs match).
  let cache: CacheFileShape | null = null;
  if (cachePath && !force) {
    const existing = await readCache(cachePath);
    if (existing && existing.inputsHash === inputsHash) {
      cache = existing;
    }
  }

  // Discover all scannable files.
  const files: string[] = [];
  for (const root of roots) {
    const found = await walk(root, extraIgnores);
    files.push(...found);
  }

  // Dedup (a file may be under multiple roots).
  const uniqueFiles = Array.from(new Set(files));

  const nextCache: CacheFileShape = {
    version: CACHE_VERSION,
    inputsHash,
    files: {},
  };
  const allEntries: RegistryEntry[] = [];

  for (const file of uniqueFiles) {
    let mtimeMs = 0;
    try {
      const s = await stat(file);
      mtimeMs = s.mtimeMs;
    } catch {
      continue;
    }

    const cached = cache?.files[file];
    let fileEntries: RegistryEntry[];
    if (cached && cached.mtimeMs === mtimeMs) {
      fileEntries = cached.entries;
    } else {
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      fileEntries = scanSource(file, text);
    }

    nextCache.files[file] = { mtimeMs, entries: fileEntries };
    allEntries.push(...fileEntries);
  }

  if (cachePath) {
    await writeCache(cachePath, nextCache);
  }

  return buildRegistryFromEntries(allEntries);
}

/**
 * Convenience: build an in-memory registry from a pre-collected list of
 * entries (skips scanning and caching entirely). Exported for tests.
 */
export function buildRegistryFromEntries(
  entries: readonly RegistryEntry[],
): TestidRegistry {
  const exactByTestid = new Map<string, RegistryEntry>();
  const globEntries: { entry: RegistryEntry; regex: RegExp }[] = [];

  for (const e of entries) {
    if (e.isGlob) {
      globEntries.push({ entry: e, regex: globToRegExp(e.testid) });
    } else {
      // First writer wins, matching "in definition order".
      if (!exactByTestid.has(e.testid)) {
        exactByTestid.set(e.testid, e);
      }
    }
  }

  const snapshot = entries.slice();

  function has(testid: string): boolean {
    if (exactByTestid.has(testid)) return true;
    for (const g of globEntries) {
      if (g.regex.test(testid)) return true;
    }
    return false;
  }

  function lookup(testid: string): RegistryEntry | null {
    const exact = exactByTestid.get(testid);
    if (exact) return exact;
    for (const g of globEntries) {
      if (g.regex.test(testid)) return g.entry;
    }
    return null;
  }

  function suggest(testid: string, limit: number = 3): RegistryEntry[] {
    interface Scored {
      entry: RegistryEntry;
      distance: number;
    }
    const scored: Scored[] = [];
    const seen = new Set<string>();
    // Suggest exact entries by their literal testid, and glob entries by
    // their literal pattern string (e.g. "row-*").
    for (const e of exactByTestid.values()) {
      if (seen.has(e.testid)) continue;
      seen.add(e.testid);
      const d = levenshtein(testid, e.testid);
      const longer = Math.max(testid.length, e.testid.length);
      const ratio = longer === 0 ? 1 : 1 - d / longer;
      if (d <= 4 || ratio >= 0.6) {
        scored.push({ entry: e, distance: d });
      }
    }
    for (const g of globEntries) {
      if (seen.has(g.entry.testid)) continue;
      seen.add(g.entry.testid);
      const d = levenshtein(testid, g.entry.testid);
      const longer = Math.max(testid.length, g.entry.testid.length);
      const ratio = longer === 0 ? 1 : 1 - d / longer;
      if (d <= 4 || ratio >= 0.6) {
        scored.push({ entry: g.entry, distance: d });
      }
    }
    scored.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      // Tiebreak: shorter testid first, then lexicographic — deterministic order.
      if (a.entry.testid.length !== b.entry.testid.length) {
        return a.entry.testid.length - b.entry.testid.length;
      }
      return a.entry.testid < b.entry.testid
        ? -1
        : a.entry.testid > b.entry.testid
          ? 1
          : 0;
    });
    return scored.slice(0, limit).map((s) => s.entry);
  }

  return {
    has,
    lookup,
    suggest,
    entries: () => snapshot.slice(),
    get size() {
      return snapshot.length;
    },
  };
}

// ─── Re-exports for convenience ────────────────────────────────────────────

/**
 * Exposed for test fixtures and tooling that needs to resolve a relative
 * path to the same canonical form used by the scanner.
 */
export function canonicalPath(p: string): string {
  return resolve(p);
}

/**
 * Exposed for tests and diagnostics. Not part of the stable public API.
 * Given the full path, produce a path relative to the current working
 * directory (or to `base` if given), using POSIX separators.
 */
export function relativeForReporting(absPath: string, base?: string): string {
  const rel = relative(base ?? process.cwd(), absPath);
  return rel.split(sep).join(posix.sep);
}
