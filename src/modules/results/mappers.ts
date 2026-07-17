import type { Assertion } from "../dsl/schema.js";
import type { AssertionResult as AssertionEvaluation } from "../assertions/results.js";
import type { StepEvent } from "../logger/types.js";
import { describeLocator } from "../locators/index.js";
import type {
  APIAssertionResult,
  AssertionResult,
  ContractResult,
  FailureType,
  RunResult,
  StepResult,
  UIAssertionResult,
} from "./schema.js";

export interface StepEventMappingInput {
  stepId: string;
  event: StepEvent;
  errorType?: FailureType;
  beforeScreenshot?: string;
  afterScreenshot?: string;
  domSnapshot?: string;
}

export function mapStepEvent(input: StepEventMappingInput): StepResult {
  const { event } = input;
  const error = event.result === "failed" && event.error && input.errorType
    ? {
        type: input.errorType,
        message: event.error,
        details: event.errorDetails,
      }
    : undefined;

  return {
    stepId: input.stepId,
    type: event.type,
    status: event.result === "success" ? "passed" : event.result,
    durationMs: event.duration,
    error,
    targetRef: event.targetRef,
    selector: event.selector,
    value: event.value,
    artifacts: {
      beforeScreenshot: input.beforeScreenshot,
      afterScreenshot: input.afterScreenshot,
      domSnapshot: input.domSnapshot,
    },
  };
}

export interface AssertionEvaluationMappingInput {
  assertionId: string;
  assertion: Assertion;
  evaluation: AssertionEvaluation;
}

/** API results keep the runtime `type` field while the v1 public schema remains permissive. */
export type MappedAssertionResult =
  | UIAssertionResult
  | (APIAssertionResult & { type: string });

export function mapAssertionEvaluation(
  input: AssertionEvaluationMappingInput,
): MappedAssertionResult {
  const { assertion, evaluation } = input;

  if (isApiAssertion(assertion)) {
    return {
      assertionId: input.assertionId,
      domain: "api",
      type: assertion.type,
      endpointRef: assertion.url,
      status: evaluation.status,
      expected: evaluation.expected
        ? { status: Number.parseInt(String(evaluation.expected), 10) || undefined }
        : undefined,
      actual: evaluation.actual
        ? {
            status: Number.parseInt(String(evaluation.actual), 10) || undefined,
            body: evaluation.actual,
          }
        : undefined,
    };
  }

  const targetRef = "locator" in assertion
    ? describeLocator(assertion.locator)
    : undefined;

  return {
    assertionId: input.assertionId,
    domain: "ui",
    type: assertion.type,
    targetRef,
    status: evaluation.status,
    expected: evaluation.expected,
    actual: evaluation.actual,
    diagnostics: targetRef
      ? mapAssertionDiagnostics(targetRef, evaluation)
      : undefined,
  };
}

export function createContractResult(input: ContractResult): ContractResult {
  return input;
}

export function createRunResult(input: RunResult): RunResult {
  return input;
}

function isApiAssertion(
  assertion: Assertion,
): assertion is Extract<Assertion, { url: string }> {
  return assertion.type === "status_code" ||
    assertion.type === "response_body_contains" ||
    assertion.type === "response_body_equals" ||
    assertion.type === "response_header_contains" ||
    assertion.type === "trace_id_present";
}

function mapAssertionDiagnostics(
  selector: string,
  evaluation: AssertionEvaluation,
): Record<string, unknown> {
  const matchedCount = typeof evaluation.diagnostics?.matchedCount === "number"
    ? evaluation.diagnostics.matchedCount
    : undefined;

  return {
    ...evaluation.diagnostics,
    selector,
    found: matchedCount !== undefined
      ? matchedCount > 0
      : evaluation.status === "passed",
  };
}
