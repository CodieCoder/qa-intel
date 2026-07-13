import {
  CheckStepSchema,
  ClickStepSchema,
  ExistsAssertionSchema,
  NavigateStepSchema,
  NotVisibleAssertionSchema,
  RequestStepSchema,
  ResponseBodyContainsAssertionSchema,
  ResponseBodyEqualsAssertionSchema,
  ResponseHeaderContainsAssertionSchema,
  SelectStepSchema,
  StatusCodeAssertionSchema,
  TextContainsAssertionSchema,
  TextEqualsAssertionSchema,
  ToggleStepSchema,
  TraceIdPresentAssertionSchema,
  TypeStepSchema,
  UncheckStepSchema,
  UploadStepSchema,
  UrlContainsAssertionSchema,
  UrlEqualsAssertionSchema,
  VisibleAssertionSchema,
  WaitStepSchema,
} from "../dsl/schema.js";
import {
  ASSERTION_GHERKIN_PARSERS,
  STEP_GHERKIN_PARSERS,
} from "../dsl/gherkin-capability-parsers.js";
import { CapabilityRegistry } from "./registry.js";
import type { CapabilityDefinition, CapabilityExecutionRequest } from "./types.js";

const SCREENSHOT_ARTIFACTS = [
  "beforeScreenshot",
  "afterScreenshot",
  "domSnapshot",
] as const;

const PAGE_DEPENDENCY = [{ key: "page" }] as const;
const PAGE_WITH_OPTIONAL_HEALING = [
  { key: "page" },
  { key: "autoHealer", optional: true },
] as const;
const NETWORK_DEPENDENCY = [{ key: "networkLog" }] as const;

type BuiltInContext = {
  handlers?: Readonly<Record<string, (
    input: unknown,
    dependencies: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>>>;
};

function definition(
  input: Omit<CapabilityDefinition, "execute">,
): CapabilityDefinition {
  const parse = input.kind === "step"
    ? STEP_GHERKIN_PARSERS[input.discriminator as keyof typeof STEP_GHERKIN_PARSERS]
    : ASSERTION_GHERKIN_PARSERS[
        input.discriminator as keyof typeof ASSERTION_GHERKIN_PARSERS
      ];

  return {
    ...input,
    parser: input.parser ? { ...input.parser, parse } : undefined,
    execute: async (request: CapabilityExecutionRequest) => {
      const handler = (request.context as BuiltInContext).handlers?.[input.id];
      if (!handler) {
        throw new Error(`Capability runtime context has no handler for ${input.id}`);
      }
      return handler(request.input, request.dependencies);
    },
  };
}

export const BUILT_IN_CAPABILITIES: readonly CapabilityDefinition[] = Object.freeze([
  definition({
    id: "step.navigate",
    kind: "step",
    discriminator: "navigate",
    inputSchema: NavigateStepSchema,
    parser: { precedence: 10, collisionKeys: ["given:navigate"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "step.click",
    kind: "step",
    discriminator: "click",
    inputSchema: ClickStepSchema,
    parser: { precedence: 20, collisionKeys: ["when:click"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_WITH_OPTIONAL_HEALING,
  }),
  definition({
    id: "step.type",
    kind: "step",
    discriminator: "type",
    inputSchema: TypeStepSchema,
    parser: { precedence: 30, collisionKeys: ["when:type"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_WITH_OPTIONAL_HEALING,
  }),
  definition({
    id: "step.select",
    kind: "step",
    discriminator: "select",
    inputSchema: SelectStepSchema,
    parser: { precedence: 40, collisionKeys: ["when:select"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_WITH_OPTIONAL_HEALING,
  }),
  definition({
    id: "step.wait",
    kind: "step",
    discriminator: "wait",
    inputSchema: WaitStepSchema,
    parser: { precedence: 50, collisionKeys: ["when:wait"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "step.check",
    kind: "step",
    discriminator: "check",
    inputSchema: CheckStepSchema,
    parser: { precedence: 60, collisionKeys: ["when:check"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "step.uncheck",
    kind: "step",
    discriminator: "uncheck",
    inputSchema: UncheckStepSchema,
    parser: { precedence: 70, collisionKeys: ["when:uncheck"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "step.toggle",
    kind: "step",
    discriminator: "toggle",
    inputSchema: ToggleStepSchema,
    parser: { precedence: 80, collisionKeys: ["when:toggle"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "step.upload",
    kind: "step",
    discriminator: "upload",
    inputSchema: UploadStepSchema,
    parser: { precedence: 90, collisionKeys: ["when:upload"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "step.request",
    kind: "step",
    discriminator: "request",
    inputSchema: RequestStepSchema,
    parser: { precedence: 100, collisionKeys: ["when:request"] },
    resultDomain: "api",
    failureLayer: "api",
    artifacts: SCREENSHOT_ARTIFACTS,
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.url_equals",
    kind: "assertion",
    discriminator: "url_equals",
    inputSchema: UrlEqualsAssertionSchema,
    parser: { precedence: 10, collisionKeys: ["then:url_equals"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.url_contains",
    kind: "assertion",
    discriminator: "url_contains",
    inputSchema: UrlContainsAssertionSchema,
    parser: { precedence: 20, collisionKeys: ["then:url_contains"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.status_code",
    kind: "assertion",
    discriminator: "status_code",
    inputSchema: StatusCodeAssertionSchema,
    parser: { precedence: 30, collisionKeys: ["then:status_code"] },
    resultDomain: "api",
    failureLayer: "api",
    artifacts: [],
    dependencies: NETWORK_DEPENDENCY,
  }),
  definition({
    id: "assertion.response_body_contains",
    kind: "assertion",
    discriminator: "response_body_contains",
    inputSchema: ResponseBodyContainsAssertionSchema,
    parser: { precedence: 40, collisionKeys: ["then:response_body_contains"] },
    resultDomain: "api",
    failureLayer: "api",
    artifacts: [],
    dependencies: NETWORK_DEPENDENCY,
  }),
  definition({
    id: "assertion.response_body_equals",
    kind: "assertion",
    discriminator: "response_body_equals",
    inputSchema: ResponseBodyEqualsAssertionSchema,
    parser: { precedence: 50, collisionKeys: ["then:response_body_equals"] },
    resultDomain: "api",
    failureLayer: "api",
    artifacts: [],
    dependencies: NETWORK_DEPENDENCY,
  }),
  definition({
    id: "assertion.response_header_contains",
    kind: "assertion",
    discriminator: "response_header_contains",
    inputSchema: ResponseHeaderContainsAssertionSchema,
    parser: { precedence: 60, collisionKeys: ["then:response_header_contains"] },
    resultDomain: "api",
    failureLayer: "api",
    artifacts: [],
    dependencies: NETWORK_DEPENDENCY,
  }),
  definition({
    id: "assertion.trace_id_present",
    kind: "assertion",
    discriminator: "trace_id_present",
    inputSchema: TraceIdPresentAssertionSchema,
    parser: { precedence: 70, collisionKeys: ["then:trace_id_present"] },
    resultDomain: "api",
    failureLayer: "api",
    artifacts: [],
    dependencies: NETWORK_DEPENDENCY,
  }),
  definition({
    id: "assertion.visible",
    kind: "assertion",
    discriminator: "visible",
    inputSchema: VisibleAssertionSchema,
    parser: { precedence: 80, collisionKeys: ["then:visible"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.not_visible",
    kind: "assertion",
    discriminator: "not_visible",
    inputSchema: NotVisibleAssertionSchema,
    parser: { precedence: 90, collisionKeys: ["then:not_visible"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.text_equals",
    kind: "assertion",
    discriminator: "text_equals",
    inputSchema: TextEqualsAssertionSchema,
    parser: { precedence: 100, collisionKeys: ["then:text_equals"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.text_contains",
    kind: "assertion",
    discriminator: "text_contains",
    inputSchema: TextContainsAssertionSchema,
    parser: { precedence: 110, collisionKeys: ["then:text_contains"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
  definition({
    id: "assertion.exists",
    kind: "assertion",
    discriminator: "exists",
    inputSchema: ExistsAssertionSchema,
    parser: { precedence: 120, collisionKeys: ["then:exists"] },
    resultDomain: "ui",
    failureLayer: "ui",
    artifacts: [],
    dependencies: PAGE_DEPENDENCY,
  }),
]);

export function createDefaultCapabilityRegistry(): CapabilityRegistry {
  return new CapabilityRegistry(BUILT_IN_CAPABILITIES);
}
