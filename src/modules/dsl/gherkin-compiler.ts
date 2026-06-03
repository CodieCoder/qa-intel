import type { TestContract, Step, Assertion } from "./schema.js";
import { isRecommendedKind, suggestKinds } from "./element-kinds.js";
import {
  buildRegistry as _buildRegistry,
  type TestidRegistry,
  relativeForReporting,
} from "../registry/index.js";

// Silence unused-import warning for the re-exported helper: we keep the
// import so `TestidRegistry` is the canonical type seen by consumers.
void _buildRegistry;

// ─── Gherkin → JSON DSL Compiler ─────────────────────────────────────────────
//
// Converts Gherkin feature files into structured TestContract JSON.
//
// TWO grammars are accepted, in order of precedence per compile attempt:
//
//   1. Declarative grammar (new, preferred for new work):
//        When I click the button login-submit
//        → { type: "click", targetRef: "login-submit", kind: "button" }
//
//   2. Bare grammar (legacy, still supported):
//        When I click login-submit
//        → { type: "click", targetRef: "login-submit", kind: undefined }
//
// In both grammars `targetRef` is the RAW testid — it is NOT concatenated
// with `kind`. The selector resolver emits `[data-testid=<targetRef>]`.
//
// See artifacts/analysis/qa-agent-grammar-migration-plan.md §6 for the
// authoritative pattern table and emission rule.

// ─── Step Patterns — Navigation / Wait(ms) / API ─────────────────────────────

const NAVIGATE_PATTERN = /^(?:I )?navigate to ["'](.+?)["']$/i;
const WAIT_MS_PATTERN = /^(?:I )?wait (\d+)(?:ms)?$/i;

// ─── Step Patterns — UI interactions (declarative first, bare fallback) ─────

const CLICK_DECLARATIVE_PATTERN = /^(?:I )?click the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const CLICK_BARE_PATTERN = /^(?:I )?click (?:["'](.+?)["']|(\S+))$/i;

const TYPE_DECLARATIVE_PATTERN =
  /^(?:I )?type ["'](.+?)["'] into the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const TYPE_BARE_PATTERN = /^(?:I )?type ["'](.+?)["'] into (?:["'](.+?)["']|(\S+))$/i;

const SELECT_DECLARATIVE_PATTERN =
  /^(?:I )?select ["'](.+?)["'] in the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const SELECT_BARE_PATTERN = /^(?:I )?select ["'](.+?)["'] in (?:["'](.+?)["']|(\S+))$/i;

const WAIT_DECLARATIVE_PATTERN = /^(?:I )?wait for the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const WAIT_BARE_PATTERN = /^(?:I )?wait for (?:["'](.+?)["']|(\S+))$/i;

// New declarative-only step forms (no bare equivalent).
const CHECK_DECLARATIVE_PATTERN = /^(?:I )?check the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const UNCHECK_DECLARATIVE_PATTERN = /^(?:I )?uncheck the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const TOGGLE_DECLARATIVE_PATTERN = /^(?:I )?toggle the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const UPLOAD_DECLARATIVE_PATTERN =
  /^(?:I )?upload ["'](.+?)["'] into the (\S+) (?:["'](.+?)["']|(\S+))$/i;

// ─── Direct API Request Step Patterns ────────────────────────────────────────

const REQUEST_NO_BODY_PATTERN = /^(?:I )?(GET|DELETE)\s+["'](.+?)["']$/i;
const REQUEST_WITH_BODY_PATTERN =
  /^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']$/i;
const REQUEST_WITH_BODY_AND_HEADERS_PATTERN =
  /^(?:I )?(GET|POST|PUT|PATCH|DELETE)\s+["'](.+?)["']\s+with\s+body\s+["'](.+?)["']\s+and\s+headers\s+["'](.+?)["']$/i;

// ─── Assertion Patterns ──────────────────────────────────────────────────────

// UI assertions — declarative forms first, bare forms second.
const VISIBLE_DECLARATIVE_PATTERN = /^(?:I )?should see the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const VISIBLE_BARE_PATTERN = /^(?:I )?should see (?:["'](.+?)["']|(\S+))$/i;

const NOT_VISIBLE_DECLARATIVE_PATTERN =
  /^(?:I )?should not see the (\S+) (?:["'](.+?)["']|(\S+))$/i;
const NOT_VISIBLE_BARE_PATTERN = /^(?:I )?should not see (?:["'](.+?)["']|(\S+))$/i;

const EXISTS_DECLARATIVE_PATTERN = /^the (\S+) (?:["'](.+?)["']|(\S+)) should exist$/i;
const EXISTS_BARE_PATTERN = /^(?:["'](.+?)["']|(\S+)) should exist$/i;

const TEXT_EQUALS_DECLARATIVE_PATTERN =
  /^the (\S+) (?:["'](.+?)["']|(\S+)) should have text ["'](.+?)["']$/i;
const TEXT_EQUALS_BARE_PATTERN = /^(?:["'](.+?)["']|(\S+)) should have text ["'](.+?)["']$/i;

const TEXT_CONTAINS_DECLARATIVE_PATTERN =
  /^the (\S+) (?:["'](.+?)["']|(\S+)) should contain (?:text )?["'](.+?)["']$/i;
const TEXT_CONTAINS_BARE_PATTERN =
  /^(?:["'](.+?)["']|(\S+)) should contain (?:text )?["'](.+?)["']$/i;

// Declarative-only: no bare equivalent for "should not be visible".
const NOT_VISIBLE_DECLARATIVE_FULL_PATTERN =
  /^the (\S+) (?:["'](.+?)["']|(\S+)) should not be visible$/i;

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
  /**
   * Distinguishes the two categories of compile-time advisory:
   *   - `unknown-element-kind`: a declarative step used a `{kind}` not in
   *     the recommended vocabulary (suggests nearest matches).
   *   - `unimplemented-step-type`: a step type was successfully parsed but
   *     the engine has no runtime handler for it yet (suites using such
   *     steps will fail at runtime). Covers `check`, `uncheck`, `toggle`,
   *     `upload` — schema-complete, engine-incomplete (§11 of the plan).
   */
  kind: "unknown-element-kind" | "unimplemented-step-type";
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
  /** Raw kind extracted from the declarative form, if any. */
  kind?: string;
}

// ─── Compile entry point ─────────────────────────────────────────────────────

/**
 * Compile a Gherkin feature string into TestContract(s).
 *
 * When `options.registry` is provided, every parsed `targetRef` is looked
 * up in the registry — misses produce compile errors with Levenshtein
 * suggestions (top 3 by distance). Legacy callers (no `options`) skip
 * registry verification entirely.
 */
export function compileGherkin(
  gherkin: string,
  options?: CompileOptions,
): CompileResult {
  const lines = gherkin.split("\n");
  const contracts: TestContract[] = [];
  const errors: CompilerError[] = [];
  const warnings: CompilerWarning[] = [];
  const sourceFile = options?.sourceFile ?? "<anonymous>";
  const registry = options?.registry;

  let currentScenario: string | null = null;
  let scenarioTags: string[] = [];
  let pendingTags: string[] = [];
  let currentSteps: Step[] = [];
  let currentAssertions: Assertion[] = [];
  // Parallel arrays: per-item source metadata for the current scenario.
  // Kept in lockstep with currentSteps / currentAssertions so we can
  // report accurate {line, stepText} for any compiled item — including
  // intermixed And-of-assertion / And-of-step sequences that a cursor-
  // based scheme mis-aligns.
  let currentStepLines: { line: number; raw: string }[] = [];
  let currentAssertionLines: { line: number; raw: string }[] = [];

  // Per-contract source metadata, in the same order as `contracts[]`.
  const contractSources: {
    stepLines: { line: number; raw: string }[];
    assertionLines: { line: number; raw: string }[];
  }[] = [];

  const flushCurrentScenario = (): void => {
    if (
      currentScenario &&
      currentSteps.length > 0 &&
      currentAssertions.length > 0
    ) {
      contracts.push({
        intent: toSnakeCase(currentScenario),
        description: currentScenario,
        tags: scenarioTags.length > 0 ? [...scenarioTags] : undefined,
        steps: [...currentSteps],
        assertions: [...currentAssertions],
      });
      contractSources.push({
        stepLines: [...currentStepLines],
        assertionLines: [...currentAssertionLines],
      });
    }
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
      if (
        currentScenario &&
        (currentSteps.length > 0 || currentAssertions.length > 0)
      ) {
        if (currentSteps.length > 0 && currentAssertions.length > 0) {
          flushCurrentScenario();
        } else if (currentSteps.length === 0) {
          errors.push({
            line: lineNumber,
            text: raw,
            message: "Scenario has no steps",
          });
        } else {
          errors.push({
            line: lineNumber,
            text: raw,
            message: "Scenario has no assertions",
          });
        }
      }

      currentScenario = raw.replace(/^Scenario(?: Outline)?:\s*/, "");
      scenarioTags = [...pendingTags];
      pendingTags = [];
      currentSteps = [];
      currentAssertions = [];
      currentStepLines = [];
      currentAssertionLines = [];
      continue;
    }

    const parsed = parseGherkinLine(raw, lineNumber);
    if (!parsed) {
      if (
        !raw.startsWith("Background:") &&
        !raw.startsWith("Examples:") &&
        !raw.startsWith("|")
      ) {
        errors.push({
          line: lineNumber,
          text: raw,
          message: "Unrecognized line",
        });
      }
      continue;
    }

    // Try step first, then assertion. Each returns (maybe) a kind as well.
    const stepResult = parseStep(parsed.text);
    if (stepResult && stepResult.step) {
      currentSteps.push(stepResult.step);
      currentStepLines.push({ line: lineNumber, raw });
      if (stepResult.kind !== undefined) {
        emitUnknownKindWarning(warnings, stepResult.kind, lineNumber, raw);
      }
      // Advisory: the grammar parses these step types but the engine
      // has no runtime handler yet. See action-engine.ts — the switch
      // arm throws "not yet implemented in the engine".
      if (isUnimplementedStepType(stepResult.step.type)) {
        emitUnimplementedStepTypeWarning(
          warnings,
          stepResult.step.type,
          lineNumber,
          raw,
        );
      }
      continue;
    }

    const assertionResult = parseAssertion(parsed.text);
    if (assertionResult && assertionResult.assertion) {
      currentAssertions.push(assertionResult.assertion);
      currentAssertionLines.push({ line: lineNumber, raw });
      if (assertionResult.kind !== undefined) {
        emitUnknownKindWarning(warnings, assertionResult.kind, lineNumber, raw);
      }
      continue;
    }

    errors.push({
      line: lineNumber,
      text: raw,
      message: `Could not parse "${parsed.keyword} ${parsed.text}" into a step or assertion`,
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
//
// For every UI step that has both a declarative and a bare form, try the
// declarative pattern FIRST. This matters because bare patterns like
// `click (\S+)` are permissive — without the declarative pre-check they
// would match `click the button foo` with `targetRef="the"`.

function parseStep(text: string): ParsedStepOrAssertion | null {
  let match: RegExpMatchArray | null;

  // Navigation (no kind).
  match = text.match(NAVIGATE_PATTERN);
  if (match) {
    return { step: { type: "navigate", url: match[1] } };
  }

  // ── Click ─────────────────────────────────────────────────────────────
  match = text.match(CLICK_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { step: { type: "click", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(CLICK_BARE_PATTERN);
  if (match) {
    return { step: { type: "click", targetRef: match[1] || match[2] } };
  }

  // ── Type ──────────────────────────────────────────────────────────────
  match = text.match(TYPE_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[2];
    return {
      step: { type: "type", targetRef: match[3] || match[4], value: match[1], kind },
      kind,
    };
  }
  match = text.match(TYPE_BARE_PATTERN);
  if (match) {
    return { step: { type: "type", targetRef: match[2] || match[3], value: match[1] } };
  }

  // ── Select ────────────────────────────────────────────────────────────
  match = text.match(SELECT_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[2];
    return {
      step: { type: "select", targetRef: match[3] || match[4], value: match[1], kind },
      kind,
    };
  }
  match = text.match(SELECT_BARE_PATTERN);
  if (match) {
    return { step: { type: "select", targetRef: match[2] || match[3], value: match[1] } };
  }

  // ── Wait for <target> ────────────────────────────────────────────────
  match = text.match(WAIT_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { step: { type: "wait", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(WAIT_BARE_PATTERN);
  if (match) {
    return { step: { type: "wait", targetRef: match[1] || match[2] } };
  }

  // ── Wait Nms (no target, no kind) ───────────────────────────────────
  match = text.match(WAIT_MS_PATTERN);
  if (match) {
    return { step: { type: "wait", timeout: parseInt(match[1], 10) } };
  }

  // ── Check / Uncheck / Toggle / Upload — declarative only ────────────
  match = text.match(CHECK_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { step: { type: "check", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(UNCHECK_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { step: { type: "uncheck", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(TOGGLE_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { step: { type: "toggle", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(UPLOAD_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[2];
    return {
      step: { type: "upload", targetRef: match[3] || match[4], value: match[1], kind },
      kind,
    };
  }

  // ── Direct API Request Steps — order: most specific first ────────────
  match = text.match(REQUEST_WITH_BODY_AND_HEADERS_PATTERN);
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
        headers: tryParseJSON(match[4]),
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

  // ── visible / "should see" ──────────────────────────────────────────
  match = text.match(VISIBLE_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { assertion: { type: "visible", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(VISIBLE_BARE_PATTERN);
  if (match) {
    return { assertion: { type: "visible", targetRef: match[1] || match[2] } };
  }

  // ── not visible / "should not see" ─────────────────────────────────
  match = text.match(NOT_VISIBLE_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return {
      assertion: { type: "not_visible", targetRef: match[2] || match[3], kind },
      kind,
    };
  }
  match = text.match(NOT_VISIBLE_BARE_PATTERN);
  if (match) {
    return { assertion: { type: "not_visible", targetRef: match[1] || match[2] } };
  }

  // ── "should not be visible" (declarative only) ─────────────────────
  match = text.match(NOT_VISIBLE_DECLARATIVE_FULL_PATTERN);
  if (match) {
    const kind = match[1];
    return {
      assertion: { type: "not_visible", targetRef: match[2] || match[3], kind },
      kind,
    };
  }

  // ── text_equals ─────────────────────────────────────────────────────
  match = text.match(TEXT_EQUALS_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return {
      assertion: {
        type: "text_equals",
        targetRef: match[2] || match[3],
        value: match[4],
        kind,
      },
      kind,
    };
  }
  match = text.match(TEXT_EQUALS_BARE_PATTERN);
  if (match) {
    return {
      assertion: { type: "text_equals", targetRef: match[1] || match[2], value: match[3] },
    };
  }

  // ── text_contains ───────────────────────────────────────────────────
  match = text.match(TEXT_CONTAINS_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return {
      assertion: {
        type: "text_contains",
        targetRef: match[2] || match[3],
        value: match[4],
        kind,
      },
      kind,
    };
  }
  match = text.match(TEXT_CONTAINS_BARE_PATTERN);
  if (match) {
    return {
      assertion: {
        type: "text_contains",
        targetRef: match[1] || match[2],
        value: match[3],
      },
    };
  }

  // ── exists ──────────────────────────────────────────────────────────
  match = text.match(EXISTS_DECLARATIVE_PATTERN);
  if (match) {
    const kind = match[1];
    return { assertion: { type: "exists", targetRef: match[2] || match[3], kind }, kind };
  }
  match = text.match(EXISTS_BARE_PATTERN);
  if (match) {
    return { assertion: { type: "exists", targetRef: match[1] || match[2] } };
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
    `If this is intentional, add it to packages/qa-agent/src/modules/dsl/element-kinds.ts ` +
    `and regenerate the docs.`;

  warnings.push({ line, text, kind: "unknown-element-kind", message });
}

// ─── Warnings: unimplemented-step-type ──────────────────────────────────────

/**
 * Step types that the grammar/schema support but the runtime engine does
 * not yet execute. Keep in sync with the `check | uncheck | toggle |
 * upload` arm in action-engine.ts::performAction.
 */
const UNIMPLEMENTED_STEP_TYPES = new Set<Step["type"]>([
  "check",
  "uncheck",
  "toggle",
  "upload",
]);

function isUnimplementedStepType(type: Step["type"]): boolean {
  return UNIMPLEMENTED_STEP_TYPES.has(type);
}

function emitUnimplementedStepTypeWarning(
  warnings: CompilerWarning[],
  stepType: Step["type"],
  line: number,
  text: string,
): void {
  const message =
    `step type "${stepType}" is parseable but not yet executable; ` +
    `suites using this step will fail at runtime. See ` +
    `artifacts/analysis/qa-agent-grammar-migration-plan.md §11.`;
  warnings.push({ line, text, kind: "unimplemented-step-type", message });
}

// ─── Registry verification (PR 7) ────────────────────────────────────────────

interface VerifyArgs {
  contracts: TestContract[];
  /**
   * Per-contract source metadata produced during parsing. `stepLines[i]`
   * is aligned with `contracts[i].steps[i]`, and likewise for
   * `assertionLines[i]` / `contracts[i].assertions[i]`. This sidesteps
   * the brittle cursor-over-source-lines scheme that mis-aligns when
   * `And` intermixes steps and assertions in a single scenario.
   */
  contractSources: {
    stepLines: { line: number; raw: string }[];
    assertionLines: { line: number; raw: string }[];
  }[];
  errors: CompilerError[];
  registry: TestidRegistry;
  sourceFile: string;
}
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
 * Returns undefined if parsing fails.
 */
function tryParseJSON(str: string): Record<string, string> | undefined {
  try {
    const parsed = JSON.parse(str);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Not valid JSON
  }
  return undefined;
}
