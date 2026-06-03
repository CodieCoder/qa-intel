import type {
  ExecuteContractInput,
  ExecuteContractOutput,
  StepResult,
  ContractResult,
  FailureSummary,
  FixHint,
  FailureType,
} from "../../types/index.js";

import { TestLogger, type NetworkEntry } from "../../logger/index.js";
import { LocalArtifactStorage } from "../../store/index.js";
import { ActionEngine, type ConsoleLogEntry } from "../action-engine.js";
import { AssertionEngine } from "../../assertions/index.js";
import { generateFixHintsTool } from "./generateFixHints.js";

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
 * - Step execution context (targetRef, resolved selector, input value)
 */
export async function executeContractTool(
  input: ExecuteContractInput,
  logger?: TestLogger
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
  const storage = new LocalArtifactStorage(artifactDir);
  const log = logger ?? new TestLogger({ stdout: false, collect: true });
  const engine = new ActionEngine(log, {
    baseUrl: input.baseUrl,
  });
  const assertionEngine = new AssertionEngine(10_000);
  const startTime = Date.now();

  try {
    await engine.launch();

    // ─── Execute steps (no adapter — DSL and V2 use same naming now) ──
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

      // Classify failure type
      let error: StepResult["error"];
      if (s.result === "failed" && s.error) {
        error = {
          type: classifyFailureType(s.error),
          message: s.error,
        };
      }

      steps.push({
        stepId,
        type: s.type,
        status: s.result === "success" ? "passed" : s.result as "failed" | "skipped",
        durationMs: s.duration,
        error,
        targetRef: s.targetRef,
        selector: s.selector,
        value: s.value,
        artifacts: {
          beforeScreenshot: beforePath,
          afterScreenshot: afterPath,
          domSnapshot,
        },
      });
    }

    const hasStepFailure = steps.some((s) => s.status === "failed");

    // ─── Execute assertions ───────────────────────────────────────────
    type AssertionResultEntry = {
      assertionId: string;
      domain: "ui" | "api";
      type: string;
      targetRef?: string;
      endpointRef?: string;
      status: "passed" | "failed";
      expected?: any;
      actual?: any;
      diagnostics?: { selector?: string; found?: boolean };
    };

    const assertions: AssertionResultEntry[] = [];

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
        const isApiAssertion =
          assertion.type === "status_code" ||
          assertion.type === "response_body_contains" ||
          assertion.type === "response_body_equals" ||
          assertion.type === "response_header_contains" ||
          assertion.type === "trace_id_present";

        if (isApiAssertion) {
          assertions.push({
            assertionId: `${traceId}-assert-${i}`,
            domain: "api",
            type: assertion.type,
            endpointRef: "url" in assertion ? assertion.url : undefined,
            status: r.status,
            expected: r.expected ? { status: parseInt(r.expected) || undefined } : undefined,
            actual: r.actual ? { status: parseInt(r.actual) || undefined, body: r.actual } : undefined,
          });
        } else {
          assertions.push({
            assertionId: `${traceId}-assert-${i}`,
            domain: "ui",
            type: assertion.type,
            targetRef: "targetRef" in assertion ? assertion.targetRef : undefined,
            status: r.status,
            expected: r.expected,
            actual: r.actual,
            diagnostics: "targetRef" in assertion
              ? { selector: assertion.targetRef }
              : undefined,
          });
        }
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
          selector: a.diagnostics?.selector,
        },
      });

      const failure: FailureSummary = {
        intent: contract.intent,
        layer,
        issue: `${a.type} assertion failed${a.expected ? ` — expected: ${a.expected}` : ""}${a.actual ? `, actual: ${a.actual}` : ""}`,
        fixHints: hintsResult.data?.hints as FixHint[] | undefined,
      };

      // Attach network trace for API failures
      if (layer === "api" && a.endpointRef) {
        const matching = networkLog.filter((n) => n.url.includes(a.endpointRef!));
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

    const result: ContractResult = {
      intent: contract.intent,
      status,
      durationMs: Date.now() - startTime,
      steps,
      assertions: assertions as any,
      summary: {
        passed: passedCount,
        failed: failedCount,
      },
      failure: rootFailure,
      failures: failures.length > 0 ? failures : undefined,
    };

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
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: `Contract execution failed: ${message}`,
      },
    };
  } finally {
    await engine.close();
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
