// ─── QA Agents — Public API ─────────────────────────────────────────────────

// Types: Zod schemas for tool I/O, results (V2 output types)
export * from "./modules/types/index.js";

// DSL: Step/assertion schemas, Gherkin compiler
// Note: DSL has its own AssertionResult (internal engine result) which
// conflicts with the V2 AssertionResult from types. Re-export explicitly.
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

  // Utility functions
  parseContract,
  parseTestSuite,
  safeParseContract,
  safeParseTestSuite,

  // Gherkin compiler
  compileGherkin,
  type CompileResult,
  type CompilerError,
  type CompilerWarning,

  // Element-kind vocabulary
  ELEMENT_KINDS,
  RECOMMENDED_KINDS,
  ELEMENT_KIND_CATEGORIES,
  isRecommendedKind,
  suggestKinds,
  kindsByCategory,
  type ElementKindCategory,
  type ElementKindDef,
} from "./modules/dsl/index.js";

// DSL internal assertion result (re-exported with explicit name)
export {
  AssertionResultSchema as DslAssertionResultSchema,
  type AssertionResult as DslAssertionResult,
} from "./modules/dsl/index.js";


// Logger: TestLogger, structured event logging
export * from "./modules/logger/index.js";

// Store: Artifact storage (screenshots → disk) + ResultStore (SQLite persistence)
export * from "./modules/store/index.js";

// Assertions: AssertionEngine
export * from "./modules/assertions/index.js";

// Generators: Test data generators for {{gen.*}} placeholders
export * from "./modules/generators/index.js";

// Engine: ActionEngine + v2 tool functions
export * from "./modules/engine/index.js";

// Registry: static testid registry (scanner + lookup)
export {
  buildRegistry,
  buildRegistryFromEntries,
  scanSource,
  canonicalPath,
  relativeForReporting,
  type RegistryEntry,
  type TestidRegistry,
  type BuildRegistryOptions,
} from "./modules/registry/index.js";
