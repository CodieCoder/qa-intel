import type { ValidateUIAssertionInput, ValidateUIAssertionOutput } from "../../types/index.js";
import { AssertionEngine } from "../../assertions/index.js";
import { EngineManager } from "./engine-manager.js";

export async function validateUIAssertionTool(
  input: ValidateUIAssertionInput
): Promise<ValidateUIAssertionOutput> {
  const engine = EngineManager.get(input.traceId);
  if (!engine) {
    return {
      ok: false,
      error: { code: "EXECUTION_FAILED", message: "No active browser session found for traceId." },
    };
  }

  const page = engine.getPage();
  if (!page) {
    return {
      ok: false,
      error: { code: "EXECUTION_FAILED", message: "Browser page is closed or not available." },
    };
  }

  const assertionEngine = new AssertionEngine();
  const assertionId = crypto.randomUUID();

  // V2 assertion matches DSL format directly now — no adapter needed
  const dslAssertion: any = {
    type: input.assertion.type,
    targetRef: input.assertion.targetRef,
    value: input.assertion.value,
  };

  try {
    const result = await assertionEngine.evaluate(page, dslAssertion);

    return {
      ok: true,
      data: {
        assertionId,
        domain: "ui",
        type: input.assertion.type,
        targetRef: input.assertion.targetRef,
        status: result.status,
        expected: result.expected ?? input.assertion.value,
        actual: result.actual,
        diagnostics: input.assertion.targetRef
          ? {
              selector: input.assertion.targetRef,
              found: result.status === "passed",
            }
          : undefined,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      error: { code: "EXECUTION_FAILED", message: error.message },
    };
  }
}
