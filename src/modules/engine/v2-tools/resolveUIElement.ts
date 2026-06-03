import type { ResolveUIElementInput, ResolveUIElementOutput } from "../../types/index.js";
import { describeLocator } from "../../locators/index.js";

/**
 * Resolves a UI element locator description. Actual Playwright resolution
 * happens at runtime in the shared locator resolver.
 */
export async function resolveUIElementTool(
  input: ResolveUIElementInput
): Promise<ResolveUIElementOutput> {
  if (!input.locator) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Missing locator",
      },
    };
  }

  const selector = describeLocator(input.locator);

  return {
    ok: true,
    data: {
      selector,
      exists: true,
      description: `Semantic locator: ${selector}`,
    },
  };
}
