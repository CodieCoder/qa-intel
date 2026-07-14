import type { ValidateAPIResponseInput, ValidateAPIResponseOutput } from "../../tools/schema.js";

/**
 * Validates an API response against expected structure/constraints.
 */
export async function validateAPIResponseTool(
  input: ValidateAPIResponseInput
): Promise<ValidateAPIResponseOutput> {
  const assertionId = crypto.randomUUID();

  try {
    const { response, endpointRef } = input;

    // If no response is provided, fail immediately
    if (response === null || response === undefined) {
      return {
        ok: true,
        data: {
          assertionId,
          domain: "api",
          endpointRef,
          status: "failed",
          diff: {
            missingFields: ["(entire response is null/undefined)"],
          },
        },
      };
    }

    // If response is not an object, pass basic check
    if (typeof response !== "object") {
      return {
        ok: true,
        data: {
          assertionId,
          domain: "api",
          endpointRef,
          status: "passed",
        },
      };
    }

    // Validate common API response patterns
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    if (response.status !== undefined) {
      const status = Number(response.status);
      if (status >= 400) {
        invalidFields.push(`status: ${status} (HTTP error)`);
      }
    }

    if (response.statusCode !== undefined) {
      const status = Number(response.statusCode);
      if (status >= 400) {
        invalidFields.push(`statusCode: ${status} (HTTP error)`);
      }
    }

    if (response.error) {
      invalidFields.push(`error: ${typeof response.error === "string" ? response.error : JSON.stringify(response.error)}`);
    }

    if (response.ok === false) {
      invalidFields.push("ok: false");
    }

    const hasMissing = missingFields.length > 0;
    const hasInvalid = invalidFields.length > 0;
    const status = hasMissing || hasInvalid ? "failed" : "passed";

    return {
      ok: true,
      data: {
        assertionId,
        domain: "api",
        endpointRef,
        status,
        ...(hasMissing || hasInvalid
          ? {
              diff: {
                ...(hasMissing ? { missingFields } : {}),
                ...(hasInvalid ? { invalidFields } : {}),
              },
            }
          : {}),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: `API response validation failed: ${message}`,
      },
    };
  }
}
