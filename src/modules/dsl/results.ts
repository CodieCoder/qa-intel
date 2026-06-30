import { z } from "zod";

// ─── Assertion Result (internal) ─────────────────────────────────────────────
// Used by AssertionEngine.evaluate() as the return type.
// This is the internal assertion result — the V2 output types are in @qa/types.

export const AssertionResultSchema = z.object({
  assertion: z.string(),
  status: z.enum(["passed", "failed"]),
  reason: z.string().optional(),
  expected: z.any().optional(),
  actual: z.any().optional(),
  diagnostics: z.record(z.any()).optional(),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;
