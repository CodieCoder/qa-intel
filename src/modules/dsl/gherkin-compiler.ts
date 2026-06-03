import type {
  TestContract,
  Step,
  Assertion,
  LocatorSpec,
  AriaRole,
} from "./schema.js";
import { isRecommendedKind, suggestKinds } from "./element-kinds.js";

// ─── Gherkin → JSON DSL Compiler ─────────────────────────────────────────────
//
// Converts Gherkin feature files into structured TestContract JSON.
//
// Gherkin is intentionally strict: UI targets compile to structured
// LocatorSpec values. Raw legacy testids are accepted only through the
// explicit `testid:` prefix, and CSS is accepted only through `css:`.

// ─── Step Patterns — Navigation / Wait(ms) / API ─────────────────────────────

const NAVIGATE_PATTERN = /^(?:I )?navigate to ["'](.+?)["']$/i;
const WAIT_MS_PATTERN = /^(?:I )?wait (\d+)(?:ms)?$/i;

// ─── Step Patterns — UI interactions ────────────────────────────────────────

const CLICK_PATTERN = /^(?:I )?click (.+)$/i;
const TYPE_PATTERN = /^(?:I )?type ["'](.+?)["'] into (.+)$/i;
const SELECT_PATTERN = /^(?:I )?select ["'](.+?)["'] in (.+)$/i;
const WAIT_FOR_PATTERN = /^(?:I )?wait for (.+)$/i;
const CHECK_PATTERN = /^(?:I )?check (.+)$/i;
const UNCHECK_PATTERN = /^(?:I )?uncheck (.+)$/i;
const TOGGLE_PATTERN = /^(?:I )?toggle (.+)$/i;
const UPLOAD_DECLARATIVE_PATTERN =
  /^(?:I )?upload ["'](.+?)["'] into (.+)$/i;

// ─── Direct API Request Step Patterns ────────────────────────────────────────

const REQUEST_NO_BODY_PATTERN = /^(?:I )?(GET|DELETE)\s+["'](.+?)["']$/i;
const REQUEST_WITH_BODY_PATTERN =
  /^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']$/i;
const REQUEST_WITH_BODY_AND_HEADERS_PATTERN =
  /^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']\s+and\s+headers\s+["'](.+?)["']$/i;

// ─── Assertion Patterns ──────────────────────────────────────────────────────

const VISIBLE_PATTERN = /^(?:I )?should see (.+)$/i;
const NOT_VISIBLE_PATTERN = /^(?:I )?should not see (.+)$/i;
const EXISTS_PATTERN = /^(.+) should exist$/i;
const TEXT_EQUALS_PATTERN = /^(.+) should have text ["'](.+?)["']$/i;
const TEXT_CONTAINS_PATTERN = /^(.+) should contain (?:text )?["'](.+?)["']$/i;
const NOT_VISIBLE_FULL_PATTERN = /^(.+) should not be visible$/i;

const URL_EQUALS_PATTERN = /^the url should (?:be|equal) ["'](.+?)["']$/i;
const URL_CONTAINS_PATTERN = /^the url should contain ["'](.+?)["']$/i;

// ─── API / Network Assertion Patterns ────────────────────────────────────────

const STATUS_CODE_PATTERN =
  /^the (?:API )?response to ["'](.+?)["'] should have status (\d+)$/i;
const RESPONSE_BODY_CONTAINS_PATTERN =
  /^the (?:API )?response to ["'](.+?)["'] should contain ["'](.+?)["']$/i;
const RESPONSE_BODY_EQUALS_PATTERN =
  /^the (?:API )?response to ["'](.+?)["'] field ["'](.+?)["'] should (?:be|equal) ["'](.+?)["']$/i;
const RESPONSE_HEADER_CONTAINS_PATTERN =
  /^the response header ["'](.+?)["'] from ["'](.+?)["'] should contain ["'](.+?)["']$/i;
const TRACE_ID_PRESENT_PATTERN =
  /^requests to ["'](.+?)["'] should include trace ID$/i;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GherkinLine {
  keyword: string;
  text: string;
  lineNumber: number;
}

export interface CompilerError {
  line: number;
  text: string;
  message: string;
}

export interface CompilerWarning {
  line: number;
  text: string;
  kind: "unknown-element-kind";
  message: string;
}

export interface CompileResult {
  contracts: TestContract[];
  errors: CompilerError[];
  warnings: CompilerWarning[];
}

export interface CompileOptions {
  /**
   * Display path for the feature file being compiled. Used in error
   * messages (the `at <file>:<line>` locator). Defaults to `<anonymous>`.
   */
  sourceFile?: string;
}

// ─── Internal parsing scratchpad ─────────────────────────────────────────────

interface ParsedStepOrAssertion {
  step?: Step;
  assertion?: Assertion;
  kind?: string;
}

// ─── Compile entry point ─────────────────────────────────────────────────────

/** Compile a strict Gherkin feature string into TestContract(s). */
export function compileGherkin(
  gherkin: string,
  options?: CompileOptions,
): CompileResult {
  const lines = gherkin.split("\n");
  const contracts: TestContract[] = [];
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  void options?.sourceFile;

  let currentScenario: string | null = null;
  let currentScenarioLine: number | null = null;
  let currentScenarioRaw: string | null = null;
  let scenarioTags: string[] = [];
  let pendingTags: string[] = [];
  let currentSteps: Step[] = [];
  let currentAssertions: Assertion[] = [];
  let currentScenarioHasErrors = false;

  const addError = (error: CompilerError): void => {
    errors.push(error);
    if (currentScenario) {
      currentScenarioHasErrors = true;
    }
  };

  const flushCurrentScenario = (): void => {
    if (!currentScenario) return;

    if (
      currentScenarioHasErrors &&
      (currentSteps.length === 0 || currentAssertions.length === 0)
    ) {
      return;
    }

    if (currentSteps.length === 0) {
      addError({
        line: currentScenarioLine ?? 1,
        text: currentScenarioRaw ?? `Scenario: ${currentScenario}`,
        message: "Scenario has no steps",
      });
      return;
    }

    if (currentAssertions.length === 0) {
      addError({
        line: currentScenarioLine ?? 1,
        text: currentScenarioRaw ?? `Scenario: ${currentScenario}`,
        message: "Scenario has no assertions",
      });
      return;
    }

    contracts.push({
      intent: toSnakeCase(currentScenario),
      description: currentScenario,
      tags: scenarioTags.length > 0 ? [...scenarioTags] : undefined,
      steps: [...currentSteps],
      assertions: [...currentAssertions],
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const lineNumber = i + 1;

    if (!raw || raw.startsWith("#")) continue;

    if (raw.startsWith("@")) {
      pendingTags = raw
        .split(/\s+/)
        .filter((t) => t.startsWith("@"))
        .map((t) => t.slice(1));
      continue;
    }

    if (raw.startsWith("Feature:")) {
      pendingTags = [];
      continue;
    }

    if (raw.startsWith("Scenario:") || raw.startsWith("Scenario Outline:")) {
      flushCurrentScenario();

      currentScenario = raw.replace(/^Scenario(?: Outline)?:\s*/, "");
      currentScenarioLine = lineNumber;
      currentScenarioRaw = raw;
      scenarioTags = [...pendingTags];
      pendingTags = [];
      currentSteps = [];
      currentAssertions = [];
      currentScenarioHasErrors = false;
      continue;
    }

    const parsed = parseGherkinLine(raw, lineNumber);
    if (!parsed) {
      if (
        !raw.startsWith("Background:") &&
        !raw.startsWith("Examples:") &&
        !raw.startsWith("|")
      ) {
        addError({
          line: lineNumber,
          text: raw,
          message: "Unrecognized line",
        });
      }
      continue;
    }

    if (!currentScenario) {
      addError({
        line: lineNumber,
        text: raw,
        message: `"${parsed.keyword}" step appears before any Scenario`,
      });
      continue;
    }

    // Try step first, then assertion. Each returns (maybe) a kind as well.
    const stepResult = parseStep(parsed.text);
    if (stepResult && stepResult.step) {
      currentSteps.push(stepResult.step);
      if (stepResult.kind !== undefined) {
        emitUnknownKindWarning(warnings, stepResult.kind, lineNumber, raw);
      }
      continue;
    }

    const assertionResult = parseAssertion(parsed.text);
    if (assertionResult && assertionResult.assertion) {
      currentAssertions.push(assertionResult.assertion);
      if (assertionResult.kind !== undefined) {
        emitUnknownKindWarning(warnings, assertionResult.kind, lineNumber, raw);
      }
      continue;
    }

    addError({
      line: lineNumber,
      text: raw,
      message: legacyTargetHint(parsed.text) ??
        `Could not parse "${parsed.keyword} ${parsed.text}" into a step or assertion`,
    });
  }

  // Save final scenario.
  flushCurrentScenario();

  return { contracts, errors, warnings };
}

// ─── Line Parser ─────────────────────────────────────────────────────────────

function parseGherkinLine(raw: string, lineNumber: number): GherkinLine | null {
  const keywords = ["Given", "When", "Then", "And", "But"];
  for (const kw of keywords) {
    if (raw.startsWith(kw + " ")) {
      return {
        keyword: kw,
        text: raw.slice(kw.length + 1).trim(),
        lineNumber,
      };
    }
  }
  return null;
}

// ─── Step Parser ─────────────────────────────────────────────────────────────

function parseStep(text: string): ParsedStepOrAssertion | null {
  let match: RegExpMatchArray | null;

  // Navigation (no kind).
  match = text.match(NAVIGATE_PATTERN);
  if (match) {
    return { step: { type: "navigate", url: match[1] } };
  }

  match = text.match(CLICK_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { step: { type: "click", locator: target.locator }, kind: target.kind };
  }

  match = text.match(TYPE_PATTERN);
  if (match) {
    const target = parseLocator(match[2]);
    if (!target) return null;
    return {
      step: { type: "type", locator: target.locator, value: match[1] },
      kind: target.kind,
    };
  }

  match = text.match(SELECT_PATTERN);
  if (match) {
    const target = parseLocator(match[2]);
    if (!target) return null;
    return {
      step: { type: "select", locator: target.locator, value: match[1] },
      kind: target.kind,
    };
  }

  match = text.match(WAIT_FOR_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { step: { type: "wait", locator: target.locator }, kind: target.kind };
  }

  match = text.match(WAIT_MS_PATTERN);
  if (match) {
    return { step: { type: "wait", timeout: parseInt(match[1], 10) } };
  }

  match = text.match(CHECK_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { step: { type: "check", locator: target.locator }, kind: target.kind };
  }

  match = text.match(UNCHECK_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { step: { type: "uncheck", locator: target.locator }, kind: target.kind };
  }

  match = text.match(TOGGLE_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { step: { type: "toggle", locator: target.locator }, kind: target.kind };
  }

  match = text.match(UPLOAD_DECLARATIVE_PATTERN);
  if (match) {
    const target = parseLocator(match[2]);
    if (!target) return null;
    return {
      step: { type: "upload", locator: target.locator, value: match[1] },
      kind: target.kind,
    };
  }

  // ── Direct API Request Steps — order: most specific first ────────────
  match = text.match(REQUEST_WITH_BODY_AND_HEADERS_PATTERN);
  if (match) {
    const headers = tryParseStringRecord(match[4]);
    if (!headers) return null;

    return {
      step: {
        type: "request",
        method: match[1].toUpperCase() as
          | "GET"
          | "POST"
          | "PUT"
          | "PATCH"
          | "DELETE",
        url: match[2],
        body: match[3],
        headers,
      },
    };
  }

  match = text.match(REQUEST_WITH_BODY_PATTERN);
  if (match) {
    return {
      step: {
        type: "request",
        method: match[1].toUpperCase() as
          | "GET"
          | "POST"
          | "PUT"
          | "PATCH"
          | "DELETE",
        url: match[2],
        body: match[3],
      },
    };
  }

  match = text.match(REQUEST_NO_BODY_PATTERN);
  if (match) {
    return {
      step: {
        type: "request",
        method: match[1].toUpperCase() as "GET" | "DELETE",
        url: match[2],
      },
    };
  }

  return null;
}

// ─── Assertion Parser ────────────────────────────────────────────────────────

function parseAssertion(text: string): ParsedStepOrAssertion | null {
  let match: RegExpMatchArray | null;

  const nonUiAssertion = parseNonUiAssertion(text);
  if (nonUiAssertion) return nonUiAssertion;

  match = text.match(VISIBLE_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { assertion: { type: "visible", locator: target.locator }, kind: target.kind };
  }

  match = text.match(NOT_VISIBLE_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { assertion: { type: "not_visible", locator: target.locator }, kind: target.kind };
  }

  match = text.match(NOT_VISIBLE_FULL_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { assertion: { type: "not_visible", locator: target.locator }, kind: target.kind };
  }

  match = text.match(TEXT_EQUALS_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return {
      assertion: {
        type: "text_equals",
        locator: target.locator,
        value: match[2],
      },
      kind: target.kind,
    };
  }

  match = text.match(TEXT_CONTAINS_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return {
      assertion: {
        type: "text_contains",
        locator: target.locator,
        value: match[2],
      },
      kind: target.kind,
    };
  }

  match = text.match(EXISTS_PATTERN);
  if (match) {
    const target = parseLocator(match[1]);
    if (!target) return null;
    return { assertion: { type: "exists", locator: target.locator }, kind: target.kind };
  }

  // ── URL assertions (no kind) ───────────────────────────────────────
  match = text.match(URL_EQUALS_PATTERN);
  if (match) {
    return { assertion: { type: "url_equals", value: match[1] } };
  }

  match = text.match(URL_CONTAINS_PATTERN);
  if (match) {
    return { assertion: { type: "url_contains", value: match[1] } };
  }

  // ── API / Network assertions (no kind) ─────────────────────────────
  match = text.match(STATUS_CODE_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "status_code",
        url: match[1],
        value: parseInt(match[2], 10),
      },
    };
  }

  match = text.match(RESPONSE_BODY_CONTAINS_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "response_body_contains",
        url: match[1],
        value: match[2],
      },
    };
  }

  match = text.match(RESPONSE_BODY_EQUALS_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "response_body_equals",
        url: match[1],
        path: match[2],
        value: match[3],
      },
    };
  }

  match = text.match(RESPONSE_HEADER_CONTAINS_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "response_header_contains",
        url: match[2],
        header: match[1],
        value: match[3],
      },
    };
  }

  match = text.match(TRACE_ID_PRESENT_PATTERN);
  if (match) {
    return { assertion: { type: "trace_id_present", url: match[1] } };
  }

  return null;
}

function parseNonUiAssertion(text: string): ParsedStepOrAssertion | null {
  let match: RegExpMatchArray | null;

  match = text.match(URL_EQUALS_PATTERN);
  if (match) {
    return { assertion: { type: "url_equals", value: match[1] } };
  }

  match = text.match(URL_CONTAINS_PATTERN);
  if (match) {
    return { assertion: { type: "url_contains", value: match[1] } };
  }

  match = text.match(STATUS_CODE_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "status_code",
        url: match[1],
        value: parseInt(match[2], 10),
      },
    };
  }

  match = text.match(RESPONSE_BODY_CONTAINS_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "response_body_contains",
        url: match[1],
        value: match[2],
      },
    };
  }

  match = text.match(RESPONSE_BODY_EQUALS_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "response_body_equals",
        url: match[1],
        path: match[2],
        value: match[3],
      },
    };
  }

  match = text.match(RESPONSE_HEADER_CONTAINS_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "response_header_contains",
        url: match[2],
        header: match[1],
        value: match[3],
      },
    };
  }

  match = text.match(TRACE_ID_PRESENT_PATTERN);
  if (match) {
    return { assertion: { type: "trace_id_present", url: match[1] } };
  }

  return null;
}

// ─── Locator Parser ─────────────────────────────────────────────────────────

interface ParsedLocator {
  locator: LocatorSpec;
  kind?: string;
}

const ROLE_BY_KIND: Record<string, AriaRole> = {
  button: "button",
  submit: "button",
  "icon-button": "button",
  link: "link",
  heading: "heading",
  checkbox: "checkbox",
  radio: "radio",
  toggle: "switch",
  tab: "tab",
  menu: "menu",
  "menu-item": "menuitem",
  dialog: "dialog",
  alert: "alert",
  table: "table",
  row: "row",
  cell: "cell",
  list: "list",
  form: "form",
};

const LABEL_KINDS = new Set(["field", "input", "select", "file-input"]);
const TEXT_KINDS = new Set([
  "text",
  "label",
  "page",
  "section",
  "panel",
  "card",
  "sidebar",
  "header",
  "footer",
  "container",
  "breadcrumb",
  "badge",
  "value",
  "toast",
  "error",
  "spinner",
  "skeleton",
  "empty",
  "image",
  "icon",
  "avatar",
]);

function parseLocator(raw: string): ParsedLocator | null {
  const text = raw.trim();
  if (!text) return null;

  if (text.startsWith("testid:")) {
    const id = text.slice("testid:".length).trim();
    return id ? { locator: { strategy: "testid", id } } : null;
  }

  if (text.startsWith("css:")) {
    const selector = text.slice("css:".length).trim();
    return selector ? { locator: { strategy: "css", selector } } : null;
  }

  const quoted = text.match(/^["'](.+?)["']$/);
  if (quoted) {
    return { locator: { strategy: "text", text: quoted[1] } };
  }

  const semantic = text.match(/^(?:the\s+)?([a-z][a-z0-9-]*)\s+["'](.+?)["']$/i);
  if (!semantic) return null;

  const kind = semantic[1].toLowerCase();
  const name = semantic[2];

  if (LABEL_KINDS.has(kind)) {
    return { locator: { strategy: "label", name }, kind };
  }

  if (kind === "placeholder") {
    return { locator: { strategy: "placeholder", text: name }, kind };
  }

  const role = ROLE_BY_KIND[kind];
  if (role) {
    return { locator: { strategy: "role", role, name }, kind };
  }

  if (TEXT_KINDS.has(kind)) {
    return { locator: { strategy: "text", text: name }, kind };
  }

  return { locator: { strategy: "text", text: name }, kind };
}

function legacyTargetHint(text: string): string | null {
  const legacyAction = text.match(/^(?:I )?(click|wait for|check|uncheck|toggle)\s+([A-Za-z0-9_-]+)$/i);
  if (legacyAction) {
    return `Legacy raw target "${legacyAction[2]}" is no longer accepted. Use semantic Gherkin like ` +
      `"${legacyAction[1]} the button "Visible name"" or an explicit fallback like ` +
      `"${legacyAction[1]} testid:${legacyAction[2]}".`;
  }

  const legacyType = text.match(/^(?:I )?(type|select)\s+["'](.+?)["']\s+(?:into|in)\s+([A-Za-z0-9_-]+)$/i);
  if (legacyType) {
    return `Legacy raw target "${legacyType[3]}" is no longer accepted. Use a semantic target like ` +
      `"${legacyType[1]} "${legacyType[2]}" into the field "Visible label"" or ` +
      `an explicit fallback like "${legacyType[1]} "${legacyType[2]}" into testid:${legacyType[3]}".`;
  }

  const legacyAssertion = text.match(/^(?:I )?should (?:not )?see\s+([A-Za-z0-9_-]+)$/i) ??
    text.match(/^([A-Za-z0-9_-]+) should (?:exist|have text|contain|not be visible)/i);
  if (legacyAssertion) {
    return `Legacy raw target "${legacyAssertion[1]}" is no longer accepted. Use semantic Gherkin like ` +
      `"Then I should see the heading "Visible name"" or an explicit fallback like ` +
      `"Then I should see testid:${legacyAssertion[1]}".`;
  }

  return null;
}

// ─── Warnings: unknown-element-kind ─────────────────────────────────────────

function emitUnknownKindWarning(
  warnings: CompilerWarning[],
  kind: string,
  line: number,
  text: string,
): void {
  if (isRecommendedKind(kind)) return;

  const suggestions = suggestKinds(kind, 2);
  const suggestionText = suggestions.length
    ? suggestions
        .map((s) => `  - "${s.kind}" (${s.category}) — ${s.description}`)
        .join("\n")
    : "  (no close matches found in the recommended vocabulary)";

  const message =
    `Unknown element kind "${kind}" — not in the recommended vocabulary. ` +
    `Did you mean:\n${suggestionText}\n` +
    `If this is intentional, add it to src/modules/dsl/element-kinds.ts ` +
    `and regenerate the docs.`;

  warnings.push({ line, text, kind: "unknown-element-kind", message });
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Try to parse a JSON string into a Record<string, string>.
 * Returns undefined if parsing fails or any value is not a string.
 */
function tryParseStringRecord(str: string): Record<string, string> | undefined {
  try {
    const parsed = JSON.parse(str);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((value) => typeof value === "string")
    ) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Not valid JSON
  }
  return undefined;
}
