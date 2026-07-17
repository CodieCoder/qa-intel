import type { ExecuteStepInput, ExecuteStepOutput } from "../../tools/schema.js";
import type { FailureType } from "../../results/schema.js";
import { TestLogger } from "../../logger/index.js";
import { LocalArtifactStorage } from "../../store/index.js";
import { EngineManager } from "./engine-manager.js";

const DEFAULT_ARTIFACT_DIR = ".qa-results/artifacts";

export async function executeStepTool(
  input: ExecuteStepInput,
  logger: TestLogger
): Promise<ExecuteStepOutput> {
  if (!input.traceId) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Missing traceId" },
    };
  }

  const artifactDir = input.artifactDir ?? DEFAULT_ARTIFACT_DIR;
  const storage = new LocalArtifactStorage(artifactDir);

  try {
    const engine = await EngineManager.getOrCreate(input.traceId, logger);

    // Tool step input uses the canonical DSL field names.
    const dslStep: any = {
      type: input.step.type,
      locator: input.step.locator,
      value: input.step.value,
      url: input.step.url,
      timeout: input.step.timeout,
      method: input.step.method,
      body: input.step.body,
      headers: input.step.headers,
    };

    const result = await engine.execute(dslStep);
    const stepId = crypto.randomUUID();

    let beforePath: string | undefined;
    let afterPath: string | undefined;

    if (result.screenshotBefore) {
      beforePath = await storage.saveArtifact(input.traceId, `${stepId}-before.png`, result.screenshotBefore);
    }

    if (result.screenshot) {
      afterPath = await storage.saveArtifact(input.traceId, `${stepId}-after.png`, result.screenshot);
    }

    if (result.result === "success") {
      return {
        ok: true,
        data: {
          stepId,
          type: input.step.type,
          status: "passed",
          durationMs: result.duration,
          targetRef: result.targetRef,
          selector: result.selector,
          value: result.value,
          artifacts: {
            beforeScreenshot: beforePath,
            afterScreenshot: afterPath,
          },
        },
      };
    } else {
      return {
        ok: true,
        data: {
          stepId,
          type: input.step.type,
          status: "failed",
          durationMs: result.duration,
          targetRef: result.targetRef,
          selector: result.selector,
          value: result.value,
          error: {
            type: classifyFailureType(result.error ?? ""),
            message: result.error ?? "Step failed to execute",
            details: result.errorDetails,
          },
          artifacts: {
            beforeScreenshot: beforePath,
            afterScreenshot: afterPath,
          },
        },
      };
    }
  } catch (error: any) {
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: error.message || "Unknown error occurred",
      },
    };
  }
}

function classifyFailureType(errorMessage: string): FailureType {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "TIMEOUT";
  if (msg.includes("not found") || msg.includes("not visible")) return "ELEMENT_NOT_FOUND";
  if (msg.includes("network") || msg.includes("net::")) return "NETWORK_ERROR";
  if (msg.includes("schema") || msg.includes("validation")) return "SCHEMA_MISMATCH";
  if (msg.includes("navigation")) return "UNEXPECTED_NAVIGATION";
  return "ASSERTION_FAILED";
}
