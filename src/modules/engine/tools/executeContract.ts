import type {
  ExecuteContractInput,
  ExecuteContractOutput,
} from "../../tools/schema.js";
import type {
  StepResult,
  ContractResult,
  FailureSummary,
  FixHint,
  FailureType,
} from "../../results/schema.js";

import { TestLogger, type NetworkEntry } from "../../logger/index.js";
import type { ConsoleLogEntry } from "../action-engine.js";
import type { EngineConfig } from "../types.js";
import { BrowserLaunchError } from "../browser-selection.js";
import { generateFixHintsTool } from "./generateFixHints.js";
import {
  createContractResult,
  mapAssertionEvaluation,
  mapStepEvent,
  type MappedAssertionResult,
} from "../../results/mappers.js";
import {
  createDefaultRuntimeServices,
  type RuntimeActionEngine,
  type RuntimeArtifactStorage,
  type RuntimeServices,
} from "../runtime-services.js";

const DEFAULT_ARTIFACT_DIR = ".qa-results/artifacts";

/**
 * Extended output that includes auxiliary data for DB persistence.
 * The `data` field is the spec-compliant ContractResult.
 * The `_auxiliary` field carries data needed by the result store but not part of
 * the contract result spec (network logs, console logs).
 */
export interface ExecuteContractFullOutput extends ExecuteContractOutput {
  _auxiliary?: {
    networkLogs: NetworkEntry[];
    consoleLogsByStep: Map<string, ConsoleLogEntry[]>;
  };
}

/**
 * Executes a single test contract: runs all steps then evaluates all assertions.
 * Writes screenshots to disk via LocalArtifactStorage.
 * Returns spec-compliant ContractResult with failures, fix hints, and artifact paths.
 *
 * Also captures and returns auxiliary diagnostic data:
 * - Network logs (all HTTP traffic during execution)
 * - Console logs (browser console.log/error/warn + uncaught JS errors)
 * - DOM snapshots on failure
 * - Step execution context (display locator, resolved locator description, input value)
 */
export async function executeContractTool(
  input: ExecuteContractInput,
  logger?: TestLogger
): Promise<ExecuteContractFullOutput> {
  return executeContractWithServices(
    input,
    createDefaultRuntimeServices(),
    logger,
  );
}

/** Internal orchestration entry point used for deterministic service injection. */
export async function executeContractWithServices(
  input: ExecuteContractInput,
  services: RuntimeServices,
  logger?: TestLogger,
): Promise<ExecuteContractFullOutput> {
  const contract = input.contract;

  if (!contract || !contract.steps || !contract.assertions) {
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Contract must include steps and assertions arrays",
      },
    };
  }

  const traceId = input.traceId;
  const artifactDir = input.artifactDir ?? DEFAULT_ARTIFACT_DIR;
  let storage: RuntimeArtifactStorage | undefined;
  let engine: RuntimeActionEngine | undefined;

  try {
    storage = services.createArtifactStorage(artifactDir);
    const log = logger ?? services.createLogger();
    const engineConfig: Partial<EngineConfig> = {
      baseUrl: input.baseUrl,
      autoHeal: input.config?.autoHeal ?? false,
      browserExecutablePath: input.config?.browserExecutablePath,
      browserChannel: input.config?.browserChannel,
    };
    if (input.config?.headless !== undefined) engineConfig.headless = input.config.headless;
    if (input.config?.timeoutMs !== undefined) engineConfig.timeout = input.config.timeoutMs;

    engine = services.createActionEngine(log, engineConfig);
    const assertionEngine = services.createAssertionEngine(10_000);
    const startTime = services.now();

    await engine.launch();

    // ─── Execute canonical DSL steps ──────────────────────────────────
    const stepEvents = await engine.executeAll(contract.steps);

    const steps: StepResult[] = [];
    for (let i = 0; i < stepEvents.length; i++) {
      const s = stepEvents[i];
      const stepId = `${traceId}-step-${i}`;

      // Flush console logs captured during this step and associate with stepId
      engine.flushConsoleLogsForStep(stepId);

      // Write screenshots to disk
      let beforePath: string | undefined;
      let afterPath: string | undefined;

      if (s.screenshotBefore) {
        beforePath = await storage.saveArtifact(traceId, `step-${i}-before.png`, s.screenshotBefore);
      }
      if (s.screenshot) {
        afterPath = await storage.saveArtifact(traceId, `step-${i}-after.png`, s.screenshot);
      }

      // Capture DOM snapshot on failure
      let domSnapshot: string | undefined;
      if (s.result === "failed") {
        try {
          domSnapshot = await engine.getPage().content();
        } catch {
          // Page may be in an unrecoverable state
        }
      }

      steps.push(mapStepEvent({
        stepId,
        event: s,
        errorType: s.result === "failed" && s.error
          ? classifyFailureType(s.error)
          : undefined,
        beforeScreenshot: beforePath,
        afterScreenshot: afterPath,
        domSnapshot,
      }));
    }

    const hasStepFailure = steps.some((s) => s.status === "failed");

    // ─── Execute assertions ───────────────────────────────────────────
    const assertions: MappedAssertionResult[] = [];

    if (!hasStepFailure && contract.assertions.length > 0) {
      const page = engine.getPage();

      try {
        await page.waitForLoadState("networkidle", { timeout: 5_000 });
      } catch {
        // Timeout acceptable
      }

      const networkLog = log.getNetworkLog();
      const results = await assertionEngine.evaluateAll(page, contract.assertions, networkLog);

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const assertion = contract.assertions[i];
        assertions.push(mapAssertionEvaluation({
          assertionId: `${traceId}-assert-${i}`,
          assertion,
          evaluation: r,
        }));
      }
    }

    // ─── Capture final page screenshot ────────────────────────────────
    if (!hasStepFailure) {
      try {
        const page = engine.getPage();
        const buffer = await page.screenshot({ type: "png" });
        const base64 = buffer.toString("base64");
        await storage.saveArtifact(traceId, "final.png", base64);
      } catch {
        // Non-fatal
      }
    }

    // ─── Build failure analysis ───────────────────────────────────────
    const hasAssertionFailure = assertions.some((a) => a.status === "failed");
    const status = hasStepFailure || hasAssertionFailure ? "failed" : "passed";

    let passedCount = steps.filter((s) => s.status === "passed").length +
      assertions.filter((a) => a.status === "passed").length;
    let failedCount = steps.filter((s) => s.status === "failed").length +
      assertions.filter((a) => a.status === "failed").length;

    const failures: FailureSummary[] = [];

    // Step failures
    for (const step of steps) {
      if (step.status !== "failed") continue;

      const hintsResult = await generateFixHintsTool({
        failure: {
          reason: step.error?.message,
          step: step.type,
          selector: step.selector,
          locatorDiagnostics: step.error?.details?.locatorDiagnostics,
        },
      });

      failures.push({
        intent: contract.intent,
        layer: "ui",
        issue: step.error?.message ?? "Step failed",
        location: `step: ${step.type}${step.targetRef ? ` (${step.targetRef})` : ""}`,
        fixHints: hintsResult.data?.hints as FixHint[] | undefined,
      });
    }

    // Assertion failures
    const networkLog = log.getNetworkLog();
    for (const a of assertions) {
      if (a.status !== "failed") continue;

      const layer = a.domain;

      const hintsResult = await generateFixHintsTool({
        failure: {
          reason: `${a.type} assertion failed`,
          assertion: a.type,
          selector: a.domain === "ui" ? a.diagnostics?.selector : undefined,
          locatorDiagnostics: a.domain === "ui" ? a.diagnostics : undefined,
        },
      });

      const failure: FailureSummary = {
        intent: contract.intent,
        layer,
        issue: `${a.type} assertion failed${a.expected ? ` — expected: ${a.expected}` : ""}${a.actual ? `, actual: ${a.actual}` : ""}`,
        fixHints: hintsResult.data?.hints as FixHint[] | undefined,
      };

      // Attach network trace for API failures
      if (a.domain === "api" && a.endpointRef) {
        const matching = networkLog.filter((n) => n.url.includes(a.endpointRef));
        if (matching.length > 0) {
          const last = matching[matching.length - 1];
          failure.location = `${last.method} ${last.url} → ${last.status}`;
        }
      }

      failures.push(failure);
    }

    // Determine root failure
    let rootFailure: ContractResult["failure"];
    if (failures.length > 0) {
      const first = failures[0];
      rootFailure = {
        layer: first.layer,
        rootCause: first.issue,
        causedByStep: steps.find((s) => s.status === "failed")?.stepId,
      };
    }

    const result = createContractResult({
      intent: contract.intent,
      status,
      durationMs: services.now() - startTime,
      steps,
      assertions,
      summary: {
        passed: passedCount,
        failed: failedCount,
      },
      failure: rootFailure,
      failures: failures.length > 0 ? failures : undefined,
    });

    return {
      ok: true,
      data: result,
      _auxiliary: {
        networkLogs: [...networkLog],
        consoleLogsByStep: engine.getConsoleLogsByStep(),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const details = err instanceof BrowserLaunchError ? err.details : undefined;
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: `Contract execution failed: ${message}`,
        details,
      },
    };
  } finally {
    try {
      await engine?.close();
    } finally {
      await storage?.close?.();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyFailureType(errorMessage: string): FailureType {
  const msg = errorMessage.toLowerCase();
  if (msg.includes("timeout") || msg.includes("timed out")) return "TIMEOUT";
  if (msg.includes("not found") || msg.includes("not visible") || msg.includes("no element")) return "ELEMENT_NOT_FOUND";
  if (msg.includes("network") || msg.includes("net::")) return "NETWORK_ERROR";
  if (msg.includes("schema") || msg.includes("validation")) return "SCHEMA_MISMATCH";
  if (msg.includes("navigation") || msg.includes("navigat")) return "UNEXPECTED_NAVIGATION";
  return "ASSERTION_FAILED";
}
