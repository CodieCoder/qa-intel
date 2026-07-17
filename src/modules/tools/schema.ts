import { z } from "zod";
import { LocatorSpecSchema } from "../dsl/schema.js";
import type {
  APIAssertionResult,
  ContractResult,
  FixHint,
  RunResult,
  StepResult,
  UIAssertionResult,
} from "../results/schema.js";

// ─── Tool Errors And Responses ───────────────────────────────────────────────

export const ErrorCodeSchema = z.enum([
  "NOT_FOUND",
  "INVALID_INPUT",
  "EXECUTION_FAILED",
  "TIMEOUT",
  "NETWORK_ERROR",
  "SCHEMA_MISMATCH",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ToolErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.any()).optional(),
});
export type ToolError = z.infer<typeof ToolErrorSchema>;

export type ToolResponse<T> = {
  ok: boolean;
  data?: T;
  error?: ToolError;
};

// ─── Tool Input Shapes ───────────────────────────────────────────────────────

export const StepInputSchema = z.object({
  type: z.enum([
    "navigate",
    "click",
    "type",
    "select",
    "wait",
    "check",
    "uncheck",
    "toggle",
    "upload",
    "request",
  ]),
  url: z.string().optional(),
  locator: LocatorSpecSchema.optional(),
  value: z.string().optional(),
  timeout: z.number().optional(),
  /** HTTP method for request steps */
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
  /** Request body (JSON string) for request steps */
  body: z.string().optional(),
  /** Custom headers for request steps */
  headers: z.record(z.string()).optional(),
});
export type StepInput = z.infer<typeof StepInputSchema>;

export const UIAssertionInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("visible"), locator: LocatorSpecSchema }),
  z.object({ type: z.literal("not_visible"), locator: LocatorSpecSchema }),
  z.object({ type: z.literal("exists"), locator: LocatorSpecSchema }),
  z.object({ type: z.literal("text_equals"), locator: LocatorSpecSchema, value: z.string() }),
  z.object({ type: z.literal("text_contains"), locator: LocatorSpecSchema, value: z.string() }),
  z.object({ type: z.literal("url_equals"), value: z.string() }),
  z.object({ type: z.literal("url_contains"), value: z.string() }),
]);
export type UIAssertionInput = z.infer<typeof UIAssertionInputSchema>;

export const APIAssertionInputSchema = z.object({
  endpointRef: z.string(),
  expect: z.object({
    status: z.number().optional(),
    bodyContains: z.array(z.string()).optional(),
    schema: z.record(z.any()).optional(),
  }),
  trigger: z.string().optional(),
});
export type APIAssertionInput = z.infer<typeof APIAssertionInputSchema>;

export const BusinessAssertionInputSchema = z.object({
  type: z.literal("invariant"),
  rule: z.string(),
});
export type BusinessAssertionInput = z.infer<typeof BusinessAssertionInputSchema>;

// ─── Suite Configuration ─────────────────────────────────────────────────────

export const SuiteConfigSchema = z.object({
  headless: z.boolean().optional(),
  failFast: z.boolean().optional(),
  timeoutMs: z.number().optional(),
  autoHeal: z.boolean().optional(),
  browserExecutablePath: z.string().optional(),
  browserChannel: z.string().optional(),
});
export type SuiteConfig = z.infer<typeof SuiteConfigSchema>;

// ─── Tool I/O: runSuite ──────────────────────────────────────────────────────

export const RunSuiteInputSchema = z.object({
  suite: z.any(),
  baseUrl: z.string().optional(),
  artifactDir: z.string().optional(),
  /** Path to SQLite results database. When set, run results are persisted. */
  resultsDb: z.string().optional(),
  config: SuiteConfigSchema.optional(),
});
export type RunSuiteInput = z.infer<typeof RunSuiteInputSchema>;
export type RunSuiteOutput = ToolResponse<RunResult>;

// ─── Tool I/O: executeContract ───────────────────────────────────────────────

export const ExecuteContractInputSchema = z.object({
  traceId: z.string(),
  contract: z.any(),
  baseUrl: z.string().optional(),
  artifactDir: z.string().optional(),
  config: SuiteConfigSchema.optional(),
});
export type ExecuteContractInput = z.infer<typeof ExecuteContractInputSchema>;
export type ExecuteContractOutput = ToolResponse<ContractResult>;

// ─── Tool I/O: executeStep ───────────────────────────────────────────────────

export const ExecuteStepInputSchema = z.object({
  traceId: z.string(),
  step: StepInputSchema,
  artifactDir: z.string().optional(),
});
export type ExecuteStepInput = z.infer<typeof ExecuteStepInputSchema>;
export type ExecuteStepOutput = ToolResponse<StepResult>;

// ─── Tool I/O: generateFixHints ──────────────────────────────────────────────

export const GenerateFixHintsInputSchema = z.object({
  failure: z.any(),
});
export type GenerateFixHintsInput = z.infer<typeof GenerateFixHintsInputSchema>;
export type GenerateFixHintsOutput = ToolResponse<{
  hints: FixHint[];
}>;

// ─── Tool I/O: resolveUIElement ──────────────────────────────────────────────

export const ResolveUIElementInputSchema = z.object({
  locator: LocatorSpecSchema,
});
export type ResolveUIElementInput = z.infer<typeof ResolveUIElementInputSchema>;
export type ResolveUIElementOutput = ToolResponse<{
  selector: string;
  exists: boolean;
  description?: string;
}>;

// ─── Tool I/O: validateUIAssertion ───────────────────────────────────────────

export const ValidateUIAssertionInputSchema = z.object({
  traceId: z.string(),
  assertion: z.object({
    type: z.string(),
    locator: LocatorSpecSchema.optional(),
    value: z.string().optional(),
  }),
});
export type ValidateUIAssertionInput = z.infer<typeof ValidateUIAssertionInputSchema>;
export type ValidateUIAssertionOutput = ToolResponse<UIAssertionResult>;

// ─── Tool I/O: resolveAPIContract ────────────────────────────────────────────

export const ResolveAPIContractInputSchema = z.object({
  endpointRef: z.string().min(1),
});
export type ResolveAPIContractInput = z.infer<typeof ResolveAPIContractInputSchema>;
export type ResolveAPIContractOutput = ToolResponse<{
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  requestSchema?: any;
  responseSchema?: any;
}>;

// ─── Tool I/O: validateAPIResponse ───────────────────────────────────────────

export const ValidateAPIResponseInputSchema = z.object({
  endpointRef: z.string(),
  response: z.any(),
});
export type ValidateAPIResponseInput = z.infer<typeof ValidateAPIResponseInputSchema>;
export type ValidateAPIResponseOutput = ToolResponse<APIAssertionResult>;

// ─── Tool I/O: getStepArtifacts ──────────────────────────────────────────────

export const GetStepArtifactsInputSchema = z.object({
  traceId: z.string(),
  stepId: z.string(),
});
export type GetStepArtifactsInput = z.infer<typeof GetStepArtifactsInputSchema>;
export type GetStepArtifactsOutput = ToolResponse<{
  screenshot?: string;
  domSnapshot?: string;
  consoleLogs?: string[];
}>;
