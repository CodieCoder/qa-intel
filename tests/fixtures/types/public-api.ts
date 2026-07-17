import {
  AssertionResultSchema,
  DslAssertionResultSchema,
  RunResultSchema,
  TestSuiteSchema,
  executeContractTool,
  runSuiteTool,
  type AssertionResult,
  type ClickAction,
  type DslAssertionResult,
  type ExecuteContractInput,
  type ExecuteContractOutput,
  type NavigateAction,
  type RequestAction,
  type RunResult,
  type RunSuiteInput,
  type RunSuiteOutput,
  type SelectAction,
  type TestSuite,
  type TypeAction,
  type WaitAction,
} from "@qutecoder/qa-intel";

const suite: TestSuite = TestSuiteSchema.parse({
  name: "public-type-contract",
  contracts: [
    {
      intent: "public_type_contract",
      steps: [{ type: "navigate", url: "https://example.test" }],
      assertions: [{ type: "url_contains", value: "example.test" }],
    },
  ],
});

const runResult: RunResult = RunResultSchema.parse({
  runId: "run",
  traceId: "trace",
  status: "passed",
  summary: { totalContracts: 0, passed: 0, failed: 0 },
  contracts: [],
  failures: [],
});

const publicAssertion: AssertionResult = AssertionResultSchema.parse({
  assertionId: "assertion",
  domain: "ui",
  type: "visible",
  status: "passed",
});

const internalAssertion: DslAssertionResult = DslAssertionResultSchema.parse({
  assertion: "visible",
  status: "passed",
});

const legacyActions: [
  NavigateAction,
  ClickAction,
  TypeAction,
  SelectAction,
  WaitAction,
  RequestAction,
] = [
  { type: "navigate", url: "/" },
  { type: "click", locator: { strategy: "text", text: "Save" } },
  { type: "type", locator: { strategy: "label", name: "Name" }, value: "Ada" },
  { type: "select", locator: { strategy: "label", name: "Role" }, value: "Admin" },
  { type: "wait", timeout: 10 },
  { type: "request", method: "GET", url: "/health" },
];

const runSuiteSignature: (input: RunSuiteInput) => Promise<RunSuiteOutput> = runSuiteTool;
const executeContractSignature: (
  input: ExecuteContractInput,
) => Promise<ExecuteContractOutput> = executeContractTool;

void [
  suite,
  runResult,
  publicAssertion,
  internalAssertion,
  legacyActions,
  runSuiteSignature,
  executeContractSignature,
];
