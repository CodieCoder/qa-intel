import type { ResolveUIElementInput, ResolveUIElementOutput } from "../../types/index.js";
import { UIContractMap } from "../../contracts/index.js";

export async function resolveUIElementTool(
  input: ResolveUIElementInput,
  contractMap: UIContractMap
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

  try {
    const selector = contractMap.resolve(input.targetRef);
    if (!selector) {
      return {
        ok: true,
        data: {
          selector: "",
          exists: false,
          description: `No selector mapped for targetRef: ${input.targetRef}`,
        },
        error: {
          code: "NOT_FOUND",
          message: `Target ${input.targetRef} not found in DSL contracts`,
        },
      };
    }

    return {
      ok: true,
      data: {
        selector,
        exists: true,
      },
    };
  } catch (err: any) {
    return {
      ok: true,
      data: {
        selector: "",
        exists: false,
      },
      error: {
        code: "NOT_FOUND",
        message: err.message,
      },
    };
  }
}
