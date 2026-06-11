import type {
  RunSuiteInput,
  RunSuiteOutput,
  RunResult,
  ContractResult,
  FailureSummary,
} from "../../types/index.js";
import type { NetworkEntry } from "../../logger/index.js";
import type { ConsoleLogEntry } from "../action-engine.js";
import { parseTestSuite, compileGherkin, type TestSuite } from "../../dsl/index.js";
import { TestLogger } from "../../logger/index.js";
import { ResultStore } from "../../store/index.js";
import { executeContractTool } from "./executeContract.js";

/**
 * Executes a full test suite: compiles if needed, runs all contracts, aggregates results.
 * This is the single entry point for the CLI and agent scripts.
 *
 * Returns a spec-compliant RunResult with:
 * - Per-contract results with screenshot file paths
 * - Aggregated failure summaries with fix hints
 * - Failure layer classification (ui/api/business)
 */
export async function runSuiteTool(
  input: RunSuiteInput
): Promise<RunSuiteOutput> {
  const runId = crypto.randomUUID();
  const traceId = crypto.randomUUID();

  try {
    // ─── Parse suite ──────────────────────────────────────────────────
    let suite: any;
    if (typeof input.suite === "string") {
      // Could be raw Gherkin or JSON string
      try {
        suite = JSON.parse(input.suite);
      } catch {
        // Treat as Gherkin
        const { contracts, errors } = compileGherkin(input.suite);
        if (contracts.length === 0) {
          return {
            ok: false,
            error: {
              code: "INVALID_INPUT",
              message: `No valid contracts compiled. Errors: ${errors.map((e) => e.message).join("; ")}`,
            },
          };
        }
        suite = {
          name: "compiled-suite",
          baseUrl: input.baseUrl,
          contracts,
        };
      }
    } else {
      suite = input.suite;
    }

    const validated = parseTestSuite(suite);

    const baseUrl = input.baseUrl ?? validated.baseUrl;
    const relativeUrls = baseUrl ? [] : collectRelativeStepUrls(validated);
    if (relativeUrls.length > 0) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message:
            "A baseUrl is required when suite steps use relative URLs. " +
            `Missing baseUrl for: ${relativeUrls.slice(0, 3).join(", ")}`,
        },
      };
    }

    const failFast = input.config?.failFast ?? false;
    const artifactDir = input.artifactDir ?? ".qa-results/artifacts";

    // ─── Execute contracts ────────────────────────────────────────────
    const contractResults: ContractResult[] = [];
    const allFailures: FailureSummary[] = [];

    // Auxiliary data for DB persistence (network logs per contract, console logs per step)
    const allNetworkLogs = new Map<number, NetworkEntry[]>();
    const allConsoleLogs = new Map<string, ConsoleLogEntry[]>();

    for (let i = 0; i < validated.contracts.length; i++) {
      const contract = validated.contracts[i];
      const contractTraceId = `${traceId}-c${i}`;

      const logger = new TestLogger({ stdout: false, collect: true });

      const result = await executeContractTool(
        {
          traceId: contractTraceId,
          contract,
          baseUrl: baseUrl ?? "",
          artifactDir,
          config: input.config,
        },
        logger
      );

      if (result.ok && result.data) {
        contractResults.push(result.data);

        // Collect failures
        if (result.data.failures) {
          allFailures.push(...result.data.failures);
        }

        // Collect auxiliary data for DB persistence
        if (result._auxiliary) {
          allNetworkLogs.set(i, result._auxiliary.networkLogs);
          for (const [stepId, logs] of result._auxiliary.consoleLogsByStep) {
            allConsoleLogs.set(stepId, logs);
          }
        }
      } else {
        // Tool-level failure — create an error ContractResult
        contractResults.push({
          intent: contract.intent,
          status: "error",
          durationMs: 0,
          steps: [],
          assertions: [],
          summary: { passed: 0, failed: 0 },
          failure: {
            layer: "ui",
            rootCause: result.error?.message ?? "Unknown execution error",
          },
        });

        allFailures.push({
          intent: contract.intent,
          layer: "ui",
          issue: result.error?.message ?? "Unknown execution error",
        });
      }

      // Fail fast
      if (failFast && contractResults[contractResults.length - 1].status !== "passed") {
        break;
      }
    }

    // ─── Aggregate ────────────────────────────────────────────────────
    const passed = contractResults.filter((r) => r.status === "passed").length;
    const failed = contractResults.filter((r) => r.status !== "passed").length;
    const status = failed > 0 ? "failed" : "passed";

    const runResult: RunResult = {
      runId,
      traceId,
      status,
      summary: {
        totalContracts: contractResults.length,
        passed,
        failed,
      },
      contracts: contractResults,
      failures: allFailures,
    };

    // ─── Persist to SQLite (when configured) ──────────────────────────
    if (input.resultsDb) {
      try {
        const store = new ResultStore(input.resultsDb);
        store.saveRun(runResult, {
          networkLogs: allNetworkLogs,
          consoleLogs: allConsoleLogs,
        });
        store.close();
      } catch (dbErr) {
        // Non-fatal: log to stderr so it doesn't pollute JSON stdout
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        process.stderr.write(`[qa-intel] Warning: failed to persist results to DB: ${msg}\n`);
      }
    }

    return { ok: true, data: runResult };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: `Suite execution failed: ${message}`,
      },
    };
  }
}

function collectRelativeStepUrls(suite: TestSuite): string[] {
  const urls: string[] = [];

  for (const contract of suite.contracts) {
    for (const step of contract.steps) {
      if (
        (step.type === "navigate" || step.type === "request") &&
        isRelativeStepUrl(step.url)
      ) {
        urls.push(step.url);
      }
    }
  }

  return [...new Set(urls)];
}

function isRelativeStepUrl(url: string): boolean {
  if (url.startsWith("//")) return false;
  return !/^(?:https?:|file:|data:|about:)/i.test(url);
}
