import { z } from "zod";

// ─── Failure Types ───────────────────────────────────────────────────────────

export const FailureTypeSchema = z.enum([
  "ELEMENT_NOT_FOUND",
  "ASSERTION_FAILED",
  "NETWORK_ERROR",
  "SCHEMA_MISMATCH",
  "TIMEOUT",
  "UNEXPECTED_NAVIGATION",
]);
export type FailureType = z.infer<typeof FailureTypeSchema>;

// ─── Step Result ─────────────────────────────────────────────────────────────

export const StepResultSchema = z.object({
  stepId: z.string(),
  type: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number(),
  error: z
    .object({
      type: FailureTypeSchema,
      message: z.string(),
      details: z.record(z.any()).optional(),
    })
    .optional(),
  /** Step execution context — display locator, resolved locator description, and input value */
  targetRef: z.string().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  artifacts: z.object({
    beforeScreenshot: z.string().optional(),
    afterScreenshot: z.string().optional(),
    domSnapshot: z.string().optional(),
  }),
});
export type StepResult = z.infer<typeof StepResultSchema>;

// ─── Assertion Results ───────────────────────────────────────────────────────

export const LocatorDiagnosticsSchema = z
  .object({
    selector: z.string().optional(),
    strategy: z.string().optional(),
    matchedCount: z.number().optional(),
    visibleCount: z.number().optional(),
    nearestMatches: z.array(z.record(z.any())).optional(),
    guidance: z.array(z.string()).optional(),
    found: z.boolean().optional(),
  })
  .catchall(z.any());

export const UIAssertionResultSchema = z.object({
  assertionId: z.string(),
  domain: z.literal("ui"),
  type: z.string(),
  targetRef: z.string().optional(),
  status: z.enum(["passed", "failed"]),
  expected: z.any().optional(),
  actual: z.any().optional(),
  diagnostics: LocatorDiagnosticsSchema.optional(),
});
export type UIAssertionResult = z.infer<typeof UIAssertionResultSchema>;

export const APIAssertionResultSchema = z.object({
  assertionId: z.string(),
  domain: z.literal("api"),
  endpointRef: z.string(),
  status: z.enum(["passed", "failed"]),
  expected: z
    .object({
      status: z.number().optional(),
      schema: z.any().optional(),
    })
    .optional(),
  actual: z
    .object({
      status: z.number().optional(),
      body: z.any().optional(),
    })
    .optional(),
  diff: z
    .object({
      missingFields: z.array(z.string()).optional(),
      invalidFields: z.array(z.string()).optional(),
    })
    .optional(),
});
export type APIAssertionResult = z.infer<typeof APIAssertionResultSchema>;

export const AssertionResultSchema = z.union([
  UIAssertionResultSchema,
  APIAssertionResultSchema,
]);
export type AssertionResult = z.infer<typeof AssertionResultSchema>;

// ─── Fix Hints ───────────────────────────────────────────────────────────────

export const FixHintSchema = z.object({
  type: z.enum(["frontend", "backend", "test"]),
  suggestion: z.string(),
  target: z
    .object({
      file: z.string().optional(),
      function: z.string().optional(),
      endpoint: z.string().optional(),
    })
    .optional(),
});
export type FixHint = z.infer<typeof FixHintSchema>;

// ─── Failure Summary ─────────────────────────────────────────────────────────

export const FailureSummarySchema = z.object({
  intent: z.string(),
  layer: z.enum(["ui", "api", "business"]),
  issue: z.string(),
  location: z.string().optional(),
  details: z.record(z.any()).optional(),
  fixHints: z.array(FixHintSchema).optional(),
});
export type FailureSummary = z.infer<typeof FailureSummarySchema>;

// ─── Contract Result ─────────────────────────────────────────────────────────

export const ContractResultSchema = z.object({
  intent: z.string(),
  status: z.enum(["passed", "failed", "error"]),
  durationMs: z.number(),
  steps: z.array(StepResultSchema),
  assertions: z.array(AssertionResultSchema),
  summary: z.object({
    passed: z.number(),
    failed: z.number(),
  }),
  failure: z
    .object({
      layer: z.enum(["ui", "api", "business"]),
      rootCause: z.string(),
      causedByStep: z.string().optional(),
      details: z.record(z.any()).optional(),
    })
    .optional(),
  failures: z.array(FailureSummarySchema).optional(),
});
export type ContractResult = z.infer<typeof ContractResultSchema>;

// ─── Run Result ──────────────────────────────────────────────────────────────

export const RunResultSchema = z.object({
  runId: z.string(),
  traceId: z.string(),
  status: z.enum(["passed", "failed"]),
  summary: z.object({
    totalContracts: z.number(),
    passed: z.number(),
    failed: z.number(),
  }),
  contracts: z.array(ContractResultSchema),
  failures: z.array(FailureSummarySchema),
});
export type RunResult = z.infer<typeof RunResultSchema>;
