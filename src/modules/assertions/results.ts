import { z } from "zod";

/** Internal assertion-engine evaluation result; distinct from public UI/API results. */
export const AssertionResultSchema = z.object({
  assertion: z.string(),
  status: z.enum(["passed", "failed"]),
  reason: z.string().optional(),
  expected: z.any().optional(),
  actual: z.any().optional(),
  diagnostics: z.record(z.any()).optional(),
});

export type AssertionResult = z.infer<typeof AssertionResultSchema>;
