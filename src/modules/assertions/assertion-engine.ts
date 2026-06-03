import type { Page } from "playwright";
import type { Assertion, AssertionResult, LocatorSpec } from "../dsl/index.js";
import type { NetworkEntry } from "../logger/index.js";
import { describeLocator, resolveLocator } from "../locators/index.js";

// ─── Assertion Engine ────────────────────────────────────────────────────────

export class AssertionEngine {
  private timeout: number;

  constructor(timeout: number = 5_000) {
    this.timeout = timeout;
  }

  /**
   * Run a single assertion against the current page state.
   * Network assertions require the networkLog parameter.
   */
  async evaluate(
    page: Page,
    assertion: Assertion,
    networkLog?: readonly NetworkEntry[]
  ): Promise<AssertionResult> {
    const start = Date.now();
    const desc = this.describe(assertion);

    try {
      switch (assertion.type) {
        case "visible":
          return await this.assertVisible(page, assertion.locator, desc);

        case "not_visible":
          return await this.assertNotVisible(page, assertion.locator, desc);

        case "exists":
          return await this.assertExists(page, assertion.locator, desc);

        case "text_equals":
          return await this.assertTextEquals(page, assertion.locator, assertion.value, desc);

        case "text_contains":
          return await this.assertTextContains(page, assertion.locator, assertion.value, desc);

        case "url_equals":
          return await this.assertUrlEquals(page, assertion.value, desc);

        case "url_contains":
          return await this.assertUrlContains(page, assertion.value, desc);

        case "status_code":
          return this.assertStatusCode(networkLog ?? [], assertion.url, assertion.value, desc);

        case "response_body_contains":
          return this.assertResponseBodyContains(networkLog ?? [], assertion.url, assertion.value, desc);

        case "response_body_equals":
          return this.assertResponseBodyEquals(networkLog ?? [], assertion.url, assertion.path, assertion.value, desc);

        case "response_header_contains":
          return this.assertResponseHeaderContains(networkLog ?? [], assertion.url, assertion.header, assertion.value, desc);

        case "trace_id_present":
          return this.assertTraceIdPresent(networkLog ?? [], assertion.url, desc);

        default: {
          const _exhaustive: never = assertion;
          throw new Error(`Unknown assertion type: ${(_exhaustive as Assertion).type}`);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        assertion: desc,
        status: "failed",
        reason: error,
      };
    }
  }

  /**
   * Run all assertions and return results.
   * Does NOT fail-fast — runs all assertions to provide complete feedback.
   */
  async evaluateAll(
    page: Page,
    assertions: Assertion[],
    networkLog?: readonly NetworkEntry[]
  ): Promise<AssertionResult[]> {
    const results: AssertionResult[] = [];

    for (const assertion of assertions) {
      const result = await this.evaluate(page, assertion, networkLog);
      results.push(result);
    }

    return results;
  }

  // ─── Individual Assertion Implementations ────────────────────────────────

  private async assertVisible(
    page: Page,
    locatorSpec: LocatorSpec,
    desc: string
  ): Promise<AssertionResult> {
    const locator = resolveLocator(page, locatorSpec);
    const target = describeLocator(locatorSpec);

    try {
      await locator.waitFor({ state: "visible", timeout: this.timeout });
      return { assertion: desc, status: "passed" };
    } catch {
      return {
        assertion: desc,
        status: "failed",
        reason: `Element "${target}" is not visible`,
      };
    }
  }

  private async assertNotVisible(
    page: Page,
    locatorSpec: LocatorSpec,
    desc: string
  ): Promise<AssertionResult> {
    const locator = resolveLocator(page, locatorSpec);
    const target = describeLocator(locatorSpec);

    try {
      await locator.waitFor({ state: "hidden", timeout: this.timeout });
      return { assertion: desc, status: "passed" };
    } catch {
      return {
        assertion: desc,
        status: "failed",
        reason: `Element "${target}" is still visible`,
      };
    }
  }

  private async assertExists(
    page: Page,
    locatorSpec: LocatorSpec,
    desc: string
  ): Promise<AssertionResult> {
    const locator = resolveLocator(page, locatorSpec);
    const target = describeLocator(locatorSpec);

    try {
      await locator.waitFor({ state: "attached", timeout: this.timeout });
      return { assertion: desc, status: "passed" };
    } catch {
      return {
        assertion: desc,
        status: "failed",
        reason: `Element "${target}" does not exist in DOM`,
      };
    }
  }

  private async assertTextEquals(
    page: Page,
    locatorSpec: LocatorSpec,
    expected: string,
    desc: string
  ): Promise<AssertionResult> {
    const locator = resolveLocator(page, locatorSpec);
    const target = describeLocator(locatorSpec);

    try {
      await locator.waitFor({ timeout: this.timeout });
      const actual = await locator.textContent({ timeout: this.timeout });
      const trimmed = actual?.trim() ?? "";

      if (trimmed === expected) {
        return { assertion: desc, status: "passed" };
      }

      return {
        assertion: desc,
        status: "failed",
        reason: `Text mismatch for "${target}"`,
        expected,
        actual: trimmed,
      };
    } catch (err) {
      return {
        assertion: desc,
        status: "failed",
        reason: `Could not read text from "${target}": ${err instanceof Error ? err.message : String(err)}`,
        expected,
      };
    }
  }

  private async assertTextContains(
    page: Page,
    locatorSpec: LocatorSpec,
    expected: string,
    desc: string
  ): Promise<AssertionResult> {
    const locator = resolveLocator(page, locatorSpec);
    const target = describeLocator(locatorSpec);

    try {
      await locator.waitFor({ timeout: this.timeout });
      const actual = await locator.textContent({ timeout: this.timeout });
      const trimmed = actual?.trim() ?? "";

      if (trimmed.includes(expected)) {
        return { assertion: desc, status: "passed" };
      }

      return {
        assertion: desc,
        status: "failed",
        reason: `Text does not contain expected value for "${target}"`,
        expected,
        actual: trimmed,
      };
    } catch (err) {
      return {
        assertion: desc,
        status: "failed",
        reason: `Could not read text from "${target}": ${err instanceof Error ? err.message : String(err)}`,
        expected,
      };
    }
  }

  private async assertUrlEquals(
    page: Page,
    expected: string,
    desc: string
  ): Promise<AssertionResult> {
    const actual = page.url();
    if (actual === expected) {
      return { assertion: desc, status: "passed" };
    }
    return {
      assertion: desc,
      status: "failed",
      reason: "URL mismatch",
      expected,
      actual,
    };
  }

  private async assertUrlContains(
    page: Page,
    expected: string,
    desc: string
  ): Promise<AssertionResult> {
    const actual = page.url();
    if (actual.includes(expected)) {
      return { assertion: desc, status: "passed" };
    }
    return {
      assertion: desc,
      status: "failed",
      reason: "URL does not contain expected value",
      expected,
      actual,
    };
  }

  // ─── Network / API Assertion Implementations ─────────────────────────────

  /**
   * Substring match on urlPattern, but exclude longer paths that merely contain the
   * pattern as a prefix (e.g. /v1/loan-products/507f... must not match pattern
   * "/v1/loan-products" — otherwise Link prefetch / detail GETs steal the
   * "last match" from collection GET assertions).
   */
  private entryUrlMatchesPattern(url: string, urlPattern: string): boolean {
    const idx = url.indexOf(urlPattern);
    if (idx === -1) return false;
    const rest = url.slice(idx + urlPattern.length);
    if (rest === "") return true;
    if (rest.startsWith("?") || rest.startsWith("#")) return true;
    if (rest === "/") return true;
    if (rest.startsWith("/")) return false;
    return true;
  }

  private findMatchingEntries(
    networkLog: readonly NetworkEntry[],
    urlPattern: string
  ): NetworkEntry[] {
    return networkLog.filter((entry) =>
      this.entryUrlMatchesPattern(entry.url, urlPattern)
    );
  }

  private assertStatusCode(
    networkLog: readonly NetworkEntry[],
    urlPattern: string,
    expectedStatus: number,
    desc: string
  ): AssertionResult {
    const entries = this.findMatchingEntries(networkLog, urlPattern);

    if (entries.length === 0) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No network requests matched URL pattern "${urlPattern}"`,
        expected: String(expectedStatus),
      };
    }

    // Check the last matching entry (most recent response)
    const entry = entries[entries.length - 1];
    if (entry.status === undefined) {
      return {
        assertion: desc,
        status: "failed",
        reason: `Matched request to "${urlPattern}" has no response status`,
        expected: String(expectedStatus),
      };
    }

    if (entry.status === expectedStatus) {
      return { assertion: desc, status: "passed" };
    }

    return {
      assertion: desc,
      status: "failed",
      reason: `Status code mismatch for "${urlPattern}"`,
      expected: String(expectedStatus),
      actual: String(entry.status),
    };
  }

  private assertResponseBodyContains(
    networkLog: readonly NetworkEntry[],
    urlPattern: string,
    expected: string,
    desc: string
  ): AssertionResult {
    const entries = this.findMatchingEntries(networkLog, urlPattern);

    if (entries.length === 0) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No network requests matched URL pattern "${urlPattern}"`,
        expected,
      };
    }

    const entry = entries[entries.length - 1];
    if (entry.responseBody === undefined || entry.responseBody === null) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No response body captured for "${urlPattern}"`,
        expected,
      };
    }

    const bodyStr = typeof entry.responseBody === "string"
      ? entry.responseBody
      : JSON.stringify(entry.responseBody);

    if (bodyStr.includes(expected)) {
      return { assertion: desc, status: "passed" };
    }

    return {
      assertion: desc,
      status: "failed",
      reason: `Response body for "${urlPattern}" does not contain expected value`,
      expected,
      actual: bodyStr.length > 500 ? bodyStr.slice(0, 500) + "..." : bodyStr,
    };
  }

  private assertResponseBodyEquals(
    networkLog: readonly NetworkEntry[],
    urlPattern: string,
    path: string,
    expected: string,
    desc: string
  ): AssertionResult {
    const entries = this.findMatchingEntries(networkLog, urlPattern);

    if (entries.length === 0) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No network requests matched URL pattern "${urlPattern}"`,
        expected,
      };
    }

    const entry = entries[entries.length - 1];
    if (entry.responseBody === undefined || entry.responseBody === null) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No response body captured for "${urlPattern}"`,
        expected,
      };
    }

    // Resolve dot-notation path (e.g. "user.name" → body.user.name)
    const actual = this.resolvePath(entry.responseBody, path);
    if (actual === undefined) {
      return {
        assertion: desc,
        status: "failed",
        reason: `Path "${path}" not found in response body for "${urlPattern}"`,
        expected,
      };
    }

    const actualStr = String(actual);
    if (actualStr === expected) {
      return { assertion: desc, status: "passed" };
    }

    return {
      assertion: desc,
      status: "failed",
      reason: `Response body field "${path}" mismatch for "${urlPattern}"`,
      expected,
      actual: actualStr,
    };
  }

  private assertResponseHeaderContains(
    networkLog: readonly NetworkEntry[],
    urlPattern: string,
    headerName: string,
    expected: string,
    desc: string
  ): AssertionResult {
    const entries = this.findMatchingEntries(networkLog, urlPattern);

    if (entries.length === 0) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No network requests matched URL pattern "${urlPattern}"`,
        expected,
      };
    }

    // Check the last matching entry (most recent response)
    const entry = entries[entries.length - 1];
    const headers = entry.responseHeaders ?? {};

    // Case-insensitive header lookup
    const headerKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === headerName.toLowerCase()
    );

    if (!headerKey) {
      return {
        assertion: desc,
        status: "failed",
        reason: `Response header "${headerName}" not found for "${urlPattern}"`,
        expected,
      };
    }

    const actual = headers[headerKey];
    if (actual.includes(expected)) {
      return { assertion: desc, status: "passed" };
    }

    return {
      assertion: desc,
      status: "failed",
      reason: `Response header "${headerName}" does not contain expected value for "${urlPattern}"`,
      expected,
      actual: actual.length > 500 ? actual.slice(0, 500) + "..." : actual,
    };
  }

  private assertTraceIdPresent(
    networkLog: readonly NetworkEntry[],
    urlPattern: string,
    desc: string
  ): AssertionResult {
    const entries = this.findMatchingEntries(networkLog, urlPattern);

    if (entries.length === 0) {
      return {
        assertion: desc,
        status: "failed",
        reason: `No network requests matched URL pattern "${urlPattern}"`,
      };
    }

    // Prefer X-Request-Id (matches common CORS allowlists); accept legacy x-trace-id.
    const hasTraceId = entries.some((entry) => {
      const headers = entry.requestHeaders ?? {};
      const lower = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
      );
      const id = lower["x-request-id"] ?? lower["x-trace-id"];
      return typeof id === "string" && id.length > 0;
    });

    if (hasTraceId) {
      return { assertion: desc, status: "passed" };
    }

    return {
      assertion: desc,
      status: "failed",
      reason: `No X-Request-Id (or x-trace-id) header found in requests matching "${urlPattern}"`,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Resolve a dot-notation path against an object.
   * E.g. resolvePath({ user: { name: "Alice" } }, "user.name") → "Alice"
   */
  private resolvePath(obj: unknown, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private describe(assertion: Assertion): string {
    switch (assertion.type) {
      case "visible":
        return `visible: ${describeLocator(assertion.locator)}`;
      case "not_visible":
        return `not_visible: ${describeLocator(assertion.locator)}`;
      case "exists":
        return `exists: ${describeLocator(assertion.locator)}`;
      case "text_equals":
        return `text_equals: ${describeLocator(assertion.locator)} = "${assertion.value}"`;
      case "text_contains":
        return `text_contains: ${describeLocator(assertion.locator)} contains "${assertion.value}"`;
      case "url_equals":
        return `url_equals: "${assertion.value}"`;
      case "url_contains":
        return `url_contains: "${assertion.value}"`;
      case "status_code":
        return `status_code: ${assertion.url} = ${assertion.value}`;
      case "response_body_contains":
        return `response_body_contains: ${assertion.url} contains "${assertion.value}"`;
      case "response_body_equals":
        return `response_body_equals: ${assertion.url} ${assertion.path} = "${assertion.value}"`;
      case "response_header_contains":
        return `response_header_contains: ${assertion.url} header "${assertion.header}" contains "${assertion.value}"`;
      case "trace_id_present":
        return `trace_id_present: ${assertion.url}`;
    }
  }
}
