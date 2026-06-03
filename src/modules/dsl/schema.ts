import { z } from "zod";

// ─── Locator Types ──────────────────────────────────────────────────────────

export const ARIA_ROLES = [
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "meter",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
] as const;

export const AriaRoleSchema = z.enum(ARIA_ROLES);

export const RoleLocatorSchema = z.object({
  strategy: z.literal("role"),
  role: AriaRoleSchema,
  name: z.string().min(1),
});

export const LabelLocatorSchema = z.object({
  strategy: z.literal("label"),
  name: z.string().min(1),
});

export const PlaceholderLocatorSchema = z.object({
  strategy: z.literal("placeholder"),
  text: z.string().min(1),
});

export const TextLocatorSchema = z.object({
  strategy: z.literal("text"),
  text: z.string().min(1),
});

export const TestIdLocatorSchema = z.object({
  strategy: z.literal("testid"),
  id: z.string().min(1),
});

export const CssLocatorSchema = z.object({
  strategy: z.literal("css"),
  selector: z.string().min(1),
});

export const LocatorSpecSchema = z.discriminatedUnion("strategy", [
  RoleLocatorSchema,
  LabelLocatorSchema,
  PlaceholderLocatorSchema,
  TextLocatorSchema,
  TestIdLocatorSchema,
  CssLocatorSchema,
]);

// ─── Step Types ──────────────────────────────────────────────────────────────

export const NavigateStepSchema = z.object({
  type: z.literal("navigate"),
  url: z.string().min(1),
});

export const ClickStepSchema = z.object({
  type: z.literal("click"),
  locator: LocatorSpecSchema,
});

export const TypeStepSchema = z.object({
  type: z.literal("type"),
  locator: LocatorSpecSchema,
  value: z.string(),
});

export const SelectStepSchema = z.object({
  type: z.literal("select"),
  locator: LocatorSpecSchema,
  value: z.string(),
});

export const WaitStepSchema = z.object({
  type: z.literal("wait"),
  locator: LocatorSpecSchema.optional(),
  timeout: z.number().positive().optional(),
});

export const CheckStepSchema = z.object({
  type: z.literal("check"),
  locator: LocatorSpecSchema,
});

export const UncheckStepSchema = z.object({
  type: z.literal("uncheck"),
  locator: LocatorSpecSchema,
});

export const ToggleStepSchema = z.object({
  type: z.literal("toggle"),
  locator: LocatorSpecSchema,
});

export const UploadStepSchema = z.object({
  type: z.literal("upload"),
  locator: LocatorSpecSchema,
  /** File path to upload. */
  value: z.string().min(1),
});

export const RequestStepSchema = z.object({
  type: z.literal("request"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().min(1),
  body: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export const StepSchema = z.discriminatedUnion("type", [
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
]);

// ─── Assertion Types ─────────────────────────────────────────────────────────

export const VisibleAssertionSchema = z.object({
  type: z.literal("visible"),
  locator: LocatorSpecSchema,
});

export const TextEqualsAssertionSchema = z.object({
  type: z.literal("text_equals"),
  locator: LocatorSpecSchema,
  value: z.string(),
});

export const ExistsAssertionSchema = z.object({
  type: z.literal("exists"),
  locator: LocatorSpecSchema,
});

export const TextContainsAssertionSchema = z.object({
  type: z.literal("text_contains"),
  locator: LocatorSpecSchema,
  value: z.string(),
});

export const NotVisibleAssertionSchema = z.object({
  type: z.literal("not_visible"),
  locator: LocatorSpecSchema,
});

export const UrlEqualsAssertionSchema = z.object({
  type: z.literal("url_equals"),
  value: z.string().min(1),
});

export const UrlContainsAssertionSchema = z.object({
  type: z.literal("url_contains"),
  value: z.string().min(1),
});

// ─── API / Network Assertion Types ───────────────────────────────────────────

export const StatusCodeAssertionSchema = z.object({
  type: z.literal("status_code"),
  /** URL pattern to match against captured network requests (substring match) */
  url: z.string().min(1),
  /** Expected HTTP status code */
  value: z.number().int().positive(),
});

export const ResponseBodyContainsAssertionSchema = z.object({
  type: z.literal("response_body_contains"),
  /** URL pattern to match against captured network requests (substring match) */
  url: z.string().min(1),
  /** String that should be present in the JSON-stringified response body */
  value: z.string(),
});

export const ResponseBodyEqualsAssertionSchema = z.object({
  type: z.literal("response_body_equals"),
  /** URL pattern to match against captured network requests (substring match) */
  url: z.string().min(1),
  /** JSON path (dot-notation) to a field in the response body */
  path: z.string().min(1),
  /** Expected value (compared as string) */
  value: z.string(),
});

// ─── Response Header Assertion Types ─────────────────────────────────────────

export const ResponseHeaderContainsAssertionSchema = z.object({
  type: z.literal("response_header_contains"),
  /** URL pattern to match against captured network requests (substring match) */
  url: z.string().min(1),
  /** Header name (case-insensitive matching) */
  header: z.string().min(1),
  /** Expected substring in the header value */
  value: z.string(),
});

// ─── Backend Trace Assertion Types ───────────────────────────────────────────

export const TraceIdPresentAssertionSchema = z.object({
  type: z.literal("trace_id_present"),
  /** URL pattern to match against captured network requests (substring match) */
  url: z.string().min(1),
});

export const AssertionSchema = z.discriminatedUnion("type", [
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
]);

// ─── Test Contract ───────────────────────────────────────────────────────────

export const TestContractSchema = z.object({
  intent: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(StepSchema).min(1),
  assertions: z.array(AssertionSchema).min(1),
});

export const TestSuiteSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url().optional(),
  contracts: z.array(TestContractSchema).min(1),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type RoleLocator = z.infer<typeof RoleLocatorSchema>;
export type AriaRole = z.infer<typeof AriaRoleSchema>;
export type LabelLocator = z.infer<typeof LabelLocatorSchema>;
export type PlaceholderLocator = z.infer<typeof PlaceholderLocatorSchema>;
export type TextLocator = z.infer<typeof TextLocatorSchema>;
export type TestIdLocator = z.infer<typeof TestIdLocatorSchema>;
export type CssLocator = z.infer<typeof CssLocatorSchema>;
export type LocatorSpec = z.infer<typeof LocatorSpecSchema>;

export type NavigateStep = z.infer<typeof NavigateStepSchema>;
export type ClickStep = z.infer<typeof ClickStepSchema>;
export type TypeStep = z.infer<typeof TypeStepSchema>;
export type SelectStep = z.infer<typeof SelectStepSchema>;
export type WaitStep = z.infer<typeof WaitStepSchema>;
export type CheckStep = z.infer<typeof CheckStepSchema>;
export type UncheckStep = z.infer<typeof UncheckStepSchema>;
export type ToggleStep = z.infer<typeof ToggleStepSchema>;
export type UploadStep = z.infer<typeof UploadStepSchema>;
export type RequestStep = z.infer<typeof RequestStepSchema>;
export type Step = z.infer<typeof StepSchema>;

export type VisibleAssertion = z.infer<typeof VisibleAssertionSchema>;
export type TextEqualsAssertion = z.infer<typeof TextEqualsAssertionSchema>;
export type ExistsAssertion = z.infer<typeof ExistsAssertionSchema>;
export type TextContainsAssertion = z.infer<typeof TextContainsAssertionSchema>;
export type NotVisibleAssertion = z.infer<typeof NotVisibleAssertionSchema>;
export type UrlEqualsAssertion = z.infer<typeof UrlEqualsAssertionSchema>;
export type UrlContainsAssertion = z.infer<typeof UrlContainsAssertionSchema>;
export type StatusCodeAssertion = z.infer<typeof StatusCodeAssertionSchema>;
export type ResponseBodyContainsAssertion = z.infer<
  typeof ResponseBodyContainsAssertionSchema
>;
export type ResponseBodyEqualsAssertion = z.infer<
  typeof ResponseBodyEqualsAssertionSchema
>;
export type ResponseHeaderContainsAssertion = z.infer<
  typeof ResponseHeaderContainsAssertionSchema
>;
export type TraceIdPresentAssertion = z.infer<
  typeof TraceIdPresentAssertionSchema
>;
export type Assertion = z.infer<typeof AssertionSchema>;

export type TestContract = z.infer<typeof TestContractSchema>;
export type TestSuite = z.infer<typeof TestSuiteSchema>;

// ─── Legacy Aliases (for backward compatibility during migration) ────────────
// TODO: Remove once all consumers use the new names
export type NavigateAction = NavigateStep;
export type ClickAction = ClickStep;
export type TypeAction = TypeStep;
export type SelectAction = SelectStep;
export type WaitAction = WaitStep;
export type RequestAction = RequestStep;
