import type {
  AriaRole,
  Assertion,
  LocatorSpec,
  Step,
} from "./schema.js";

export interface ParsedCapabilityValue<TValue> {
  value: TValue;
  kind?: string;
}

export type GherkinCapabilityParser<TValue> = (
  text: string,
) => ParsedCapabilityValue<TValue> | null;

const NAVIGATE_PATTERN = /^(?:I )?navigate to ["'](.+?)["']$/i;
const WAIT_MS_PATTERN = /^(?:I )?wait (\d+)(?:ms)?$/i;
const CLICK_PATTERN = /^(?:I )?click (.+)$/i;
const TYPE_PATTERN = /^(?:I )?type ["'](.+?)["'] into (.+)$/i;
const SELECT_PATTERN = /^(?:I )?select ["'](.+?)["'] in (.+)$/i;
const WAIT_FOR_PATTERN = /^(?:I )?wait for (.+)$/i;
const CHECK_PATTERN = /^(?:I )?check (.+)$/i;
const UNCHECK_PATTERN = /^(?:I )?uncheck (.+)$/i;
const TOGGLE_PATTERN = /^(?:I )?toggle (.+)$/i;
const UPLOAD_PATTERN = /^(?:I )?upload ["'](.+?)["'] into (.+)$/i;
const REQUEST_NO_BODY_PATTERN = /^(?:I )?(GET|DELETE)\s+["'](.+?)["']$/i;
const REQUEST_WITH_BODY_PATTERN =
  /^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']$/i;
const REQUEST_WITH_BODY_AND_HEADERS_PATTERN =
  /^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']\s+and\s+headers\s+["'](.+?)["']$/i;

const VISIBLE_PATTERN = /^(?:I )?should see (.+)$/i;
const NOT_VISIBLE_PATTERN = /^(?:I )?should not see (.+)$/i;
const EXISTS_PATTERN = /^(.+) should exist$/i;
const TEXT_EQUALS_PATTERN = /^(.+) should have text ["'](.+?)["']$/i;
const TEXT_CONTAINS_PATTERN = /^(.+) should contain (?:text )?["'](.+?)["']$/i;
const NOT_VISIBLE_FULL_PATTERN = /^(.+) should not be visible$/i;
const URL_EQUALS_PATTERN = /^the url should (?:be|equal) ["'](.+?)["']$/i;
const URL_CONTAINS_PATTERN = /^the url should contain ["'](.+?)["']$/i;
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

export const STEP_GHERKIN_PARSERS: Record<
  Step["type"],
  GherkinCapabilityParser<Step>
> = {
  navigate(text) {
    const match = text.match(NAVIGATE_PATTERN);
    return match ? { value: { type: "navigate", url: match[1] } } : null;
  },
  click(text) {
    const match = text.match(CLICK_PATTERN);
    if (!match) return null;
    const target = parseLocator(match[1]);
    return target
      ? { value: { type: "click", locator: target.locator }, kind: target.kind }
      : null;
  },
  type(text) {
    const match = text.match(TYPE_PATTERN);
    if (!match) return null;
    const target = parseLocator(match[2]);
    return target
      ? {
          value: { type: "type", locator: target.locator, value: match[1] },
          kind: target.kind,
        }
      : null;
  },
  select(text) {
    const match = text.match(SELECT_PATTERN);
    if (!match) return null;
    const target = parseLocator(match[2]);
    return target
      ? {
          value: { type: "select", locator: target.locator, value: match[1] },
          kind: target.kind,
        }
      : null;
  },
  wait(text) {
    const locatorMatch = text.match(WAIT_FOR_PATTERN);
    if (locatorMatch) {
      const target = parseLocator(locatorMatch[1]);
      return target
        ? { value: { type: "wait", locator: target.locator }, kind: target.kind }
        : null;
    }

    const timeoutMatch = text.match(WAIT_MS_PATTERN);
    return timeoutMatch
      ? { value: { type: "wait", timeout: Number.parseInt(timeoutMatch[1], 10) } }
      : null;
  },
  check(text) {
    return parseLocatorStep(text, CHECK_PATTERN, "check");
  },
  uncheck(text) {
    return parseLocatorStep(text, UNCHECK_PATTERN, "uncheck");
  },
  toggle(text) {
    return parseLocatorStep(text, TOGGLE_PATTERN, "toggle");
  },
  upload(text) {
    const match = text.match(UPLOAD_PATTERN);
    if (!match) return null;
    const target = parseLocator(match[2]);
    return target
      ? {
          value: { type: "upload", locator: target.locator, value: match[1] },
          kind: target.kind,
        }
      : null;
  },
  request(text) {
    const withHeaders = text.match(REQUEST_WITH_BODY_AND_HEADERS_PATTERN);
    if (withHeaders) {
      const headers = tryParseStringRecord(withHeaders[4]);
      if (!headers) return null;
      return {
        value: {
          type: "request",
          method: withHeaders[1].toUpperCase() as RequestMethod,
          url: withHeaders[2],
          body: withHeaders[3],
          headers,
        },
      };
    }

    const withBody = text.match(REQUEST_WITH_BODY_PATTERN);
    if (withBody) {
      return {
        value: {
          type: "request",
          method: withBody[1].toUpperCase() as RequestMethod,
          url: withBody[2],
          body: withBody[3],
        },
      };
    }

    const withoutBody = text.match(REQUEST_NO_BODY_PATTERN);
    return withoutBody
      ? {
          value: {
            type: "request",
            method: withoutBody[1].toUpperCase() as "GET" | "DELETE",
            url: withoutBody[2],
          },
        }
      : null;
  },
};

export const ASSERTION_GHERKIN_PARSERS: Record<
  Assertion["type"],
  GherkinCapabilityParser<Assertion>
> = {
  url_equals(text) {
    const match = text.match(URL_EQUALS_PATTERN);
    return match ? { value: { type: "url_equals", value: match[1] } } : null;
  },
  url_contains(text) {
    const match = text.match(URL_CONTAINS_PATTERN);
    return match ? { value: { type: "url_contains", value: match[1] } } : null;
  },
  status_code(text) {
    const match = text.match(STATUS_CODE_PATTERN);
    return match
      ? {
          value: {
            type: "status_code",
            url: match[1],
            value: Number.parseInt(match[2], 10),
          },
        }
      : null;
  },
  response_body_contains(text) {
    const match = text.match(RESPONSE_BODY_CONTAINS_PATTERN);
    return match
      ? {
          value: {
            type: "response_body_contains",
            url: match[1],
            value: match[2],
          },
        }
      : null;
  },
  response_body_equals(text) {
    const match = text.match(RESPONSE_BODY_EQUALS_PATTERN);
    return match
      ? {
          value: {
            type: "response_body_equals",
            url: match[1],
            path: match[2],
            value: match[3],
          },
        }
      : null;
  },
  response_header_contains(text) {
    const match = text.match(RESPONSE_HEADER_CONTAINS_PATTERN);
    return match
      ? {
          value: {
            type: "response_header_contains",
            url: match[2],
            header: match[1],
            value: match[3],
          },
        }
      : null;
  },
  trace_id_present(text) {
    const match = text.match(TRACE_ID_PRESENT_PATTERN);
    return match
      ? { value: { type: "trace_id_present", url: match[1] } }
      : null;
  },
  visible(text) {
    return parseLocatorAssertion(text, VISIBLE_PATTERN, "visible");
  },
  not_visible(text) {
    return parseLocatorAssertion(
      text,
      NOT_VISIBLE_PATTERN,
      "not_visible",
    ) ?? parseLocatorAssertion(
      text,
      NOT_VISIBLE_FULL_PATTERN,
      "not_visible",
    );
  },
  text_equals(text) {
    const match = text.match(TEXT_EQUALS_PATTERN);
    if (!match) return null;
    const target = parseLocator(match[1]);
    return target
      ? {
          value: {
            type: "text_equals",
            locator: target.locator,
            value: match[2],
          },
          kind: target.kind,
        }
      : null;
  },
  text_contains(text) {
    const match = text.match(TEXT_CONTAINS_PATTERN);
    if (!match) return null;
    const target = parseLocator(match[1]);
    return target
      ? {
          value: {
            type: "text_contains",
            locator: target.locator,
            value: match[2],
          },
          kind: target.kind,
        }
      : null;
  },
  exists(text) {
    return parseLocatorAssertion(text, EXISTS_PATTERN, "exists");
  },
};

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type LocatorStepType = "check" | "uncheck" | "toggle";
type LocatorAssertionType = "visible" | "not_visible" | "exists";

function parseLocatorStep(
  text: string,
  pattern: RegExp,
  type: LocatorStepType,
): ParsedCapabilityValue<Step> | null {
  const match = text.match(pattern);
  if (!match) return null;
  const target = parseLocator(match[1]);
  return target
    ? { value: { type, locator: target.locator }, kind: target.kind }
    : null;
}

function parseLocatorAssertion(
  text: string,
  pattern: RegExp,
  type: LocatorAssertionType,
): ParsedCapabilityValue<Assertion> | null {
  const match = text.match(pattern);
  if (!match) return null;
  const target = parseLocator(match[1]);
  return target
    ? { value: { type, locator: target.locator }, kind: target.kind }
    : null;
}

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
    // Invalid JSON is reported by the compiler as an unparseable step.
  }
  return undefined;
}
