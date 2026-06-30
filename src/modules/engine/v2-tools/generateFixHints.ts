import type { GenerateFixHintsInput, GenerateFixHintsOutput, FixHint } from "../../types/index.js";

/**
 * Pattern-based failure analysis that generates actionable fix hints.
 * Analyzes the failure payload and matches against known failure patterns
 * to produce targeted suggestions.
 */
export async function generateFixHintsTool(
  input: GenerateFixHintsInput
): Promise<GenerateFixHintsOutput> {
  try {
    const failure = input.failure;
    if (!failure) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Missing failure payload",
        },
      };
    }

    const hints: FixHint[] = [];
    const reason = String(failure.reason ?? failure.message ?? failure.error ?? "").toLowerCase();
    const step = String(failure.step ?? "").toLowerCase();
    const assertion = String(failure.assertion ?? "").toLowerCase();
    const selector = String(failure.selector ?? "");
    const locatorDiagnostics = failure.locatorDiagnostics;
    const guidance = Array.isArray(locatorDiagnostics?.guidance)
      ? locatorDiagnostics.guidance.filter((entry: unknown) => typeof entry === "string")
      : [];

    if (guidance.some((entry: string) => entry.includes("not as"))) {
      hints.push({
        type: "frontend",
        suggestion: guidance[0],
      });
      hints.push({
        type: "test",
        suggestion: `If the UI intentionally exposes this copy as plain text or another element kind, change the contract target away from "${selector || "the current semantic locator"}".`,
      });
    }

    // ─── UI / Element Visibility Patterns ───────────────────────────────

    if (reason.includes("not visible") || reason.includes("not found")) {
      hints.push({
        type: "frontend",
        suggestion: `Element "${selector || "target"}" is not rendering. Check that the component mounts correctly and that conditional rendering logic (v-if, ternary, etc.) evaluates to true.`,
      });
      hints.push({
        type: "test",
        suggestion: "Add a wait/delay step before interacting with this element, or increase the assertion timeout.",
      });
    }

    // ─── Timeout Patterns ───────────────────────────────────────────────

    if (reason.includes("timeout") || reason.includes("timed out")) {
      hints.push({
        type: "frontend",
        suggestion: "The page or element took too long to load. Check for slow API calls, heavy computations, or missing loading states blocking render.",
      });
      hints.push({
        type: "backend",
        suggestion: "Verify that the API endpoint responds within an acceptable time. Check for N+1 queries or missing database indexes.",
      });
      hints.push({
        type: "test",
        suggestion: "Increase the timeout for this step or assertion. Consider whether the test environment has adequate resources.",
      });
    }

    // ─── Text Mismatch Patterns ─────────────────────────────────────────

    if (reason.includes("text mismatch") || reason.includes("does not contain")) {
      hints.push({
        type: "frontend",
        suggestion: "The displayed text doesn't match the expected value. Check for i18n changes, whitespace issues, or dynamic content that varies between runs.",
      });
      hints.push({
        type: "test",
        suggestion: "Consider using text_contains instead of text_equals if the text includes dynamic portions (timestamps, counts, etc.).",
      });
    }

    // ─── Navigation / URL Patterns ──────────────────────────────────────

    if (reason.includes("url") || step.includes("navigate")) {
      hints.push({
        type: "frontend",
        suggestion: "Check that the route is correctly defined and that client-side navigation (Link/router.push) targets the right path.",
      });
    }

    // ─── API / Network Patterns ─────────────────────────────────────────

    if (
      reason.includes("status code") ||
      reason.includes("network") ||
      assertion.includes("status_code") ||
      assertion.includes("response_body")
    ) {
      hints.push({
        type: "backend",
        suggestion: "The API returned an unexpected status code or response body. Verify the endpoint is running, the route exists, and authentication/authorization is not blocking the request.",
      });
      hints.push({
        type: "frontend",
        suggestion: "Check that the API base URL configured in the test suite matches the running server.",
      });
    }

    // ─── Click / Interaction Failures ───────────────────────────────────

    if (step.includes("click") && (reason.includes("failed") || reason.includes("intercept"))) {
      hints.push({
        type: "frontend",
        suggestion: "The click target may be obscured by an overlay, modal, or z-index issue. Check for loading spinners, toasts, or cookie banners that might block interaction.",
      });
    }

    // ─── Selector Issues ────────────────────────────────────────────────

    if (selector && (reason.includes("selector") || reason.includes("resolve"))) {
      hints.push({
        type: "test",
        suggestion: `Review the locator "${selector}". Prefer role, label, placeholder, or visible text; use testid: or css: only when the UI has no stable semantic target.`,
      });
    }

    // ─── Fallback if no patterns matched ────────────────────────────────

    if (hints.length === 0) {
      hints.push({
        type: "test",
        suggestion: `Review the failure details: ${reason || "No specific reason captured"}. Check if the test environment is properly configured and the target application is running.`,
      });
    }

    return {
      ok: true,
      data: { hints },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: `Failed to generate fix hints: ${message}`,
      },
    };
  }
}
