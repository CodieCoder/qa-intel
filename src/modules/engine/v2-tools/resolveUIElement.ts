import type { ResolveUIElementInput, ResolveUIElementOutput } from "../../types/index.js";

/**
 * Resolves a UI element targetRef. With the semantic locator architecture,
 * this simply returns the targetRef as-is — the actual resolution happens
 * at runtime in the ActionEngine via Playwright's getByRole/getByText/locator.
 */
export async function resolveUIElementTool(
  input: ResolveUIElementInput
): Promise<ResolveUIElementOutput> {
  if (!input.targetRef) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Missing targetRef",
      },
    };
  }

  return {
    ok: true,
    data: {
      selector: input.targetRef,
      exists: true,
      description: `Semantic target: ${input.targetRef}`,
    },
  };
}
