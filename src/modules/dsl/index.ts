export {
  // Step schemas
  NavigateStepSchema,
  ClickStepSchema,
  TypeStepSchema,
  SelectStepSchema,
  WaitStepSchema,
  CheckStepSchema,
  UncheckStepSchema,
  ToggleStepSchema,
  UploadStepSchema,
  RequestStepSchema,
  StepSchema,

  // Assertion schemas
  VisibleAssertionSchema,
  TextEqualsAssertionSchema,
  ExistsAssertionSchema,
  TextContainsAssertionSchema,
  NotVisibleAssertionSchema,
  UrlEqualsAssertionSchema,
  UrlContainsAssertionSchema,
  StatusCodeAssertionSchema,
  ResponseBodyContainsAssertionSchema,
  ResponseBodyEqualsAssertionSchema,
  ResponseHeaderContainsAssertionSchema,
  TraceIdPresentAssertionSchema,
  AssertionSchema,

  // Contract schemas
  TestContractSchema,
  TestSuiteSchema,

  // Types
  type NavigateStep,
  type ClickStep,
  type TypeStep,
  type SelectStep,
  type WaitStep,
  type CheckStep,
  type UncheckStep,
  type ToggleStep,
  type UploadStep,
  type RequestStep,
  type Step,
  type VisibleAssertion,
  type TextEqualsAssertion,
  type ExistsAssertion,
  type TextContainsAssertion,
  type NotVisibleAssertion,
  type UrlEqualsAssertion,
  type UrlContainsAssertion,
  type StatusCodeAssertion,
  type ResponseBodyContainsAssertion,
  type ResponseBodyEqualsAssertion,
  type ResponseHeaderContainsAssertion,
  type TraceIdPresentAssertion,
  type Assertion,
  type TestContract,
  type TestSuite,

  // Legacy aliases
  type NavigateAction,
  type ClickAction,
  type TypeAction,
  type SelectAction,
  type WaitAction,
  type RequestAction,
} from "./schema.js";

export { AssertionResultSchema, type AssertionResult } from "./results.js";

// ─── Utility: Parse & Validate ───────────────────────────────────────────────

import { TestContractSchema, TestSuiteSchema } from "./schema.js";

export function parseContract(input: unknown) {
  return TestContractSchema.parse(input);
}

export function parseTestSuite(input: unknown) {
  return TestSuiteSchema.parse(input);
}

export function safeParseContract(input: unknown) {
  return TestContractSchema.safeParse(input);
}

export function safeParseTestSuite(input: unknown) {
  return TestSuiteSchema.safeParse(input);
}

// ─── Gherkin Compiler ────────────────────────────────────────────────────────

export {
  compileGherkin,
  type CompileResult,
  type CompilerError,
  type CompilerWarning,
} from "./gherkin-compiler.js";

// ─── Element-Kind Vocabulary ────────────────────────────────────────────────

export {
  ELEMENT_KINDS,
  RECOMMENDED_KINDS,
  ELEMENT_KIND_CATEGORIES,
  isRecommendedKind,
  suggestKinds,
  kindsByCategory,
  type ElementKindCategory,
  type ElementKindDef,
} from "./element-kinds.js";
