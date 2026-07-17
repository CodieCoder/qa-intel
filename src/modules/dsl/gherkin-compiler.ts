import type { Assertion, Step, TestContract } from "./schema.js";
import { isRecommendedKind, suggestKinds } from "./element-kinds.js";
import { createDefaultCapabilityRegistry } from "../capabilities/builtins.js";

// Gherkin stays strict: the registry only orders built-in parsers whose output
// is validated by the canonical DSL schema before it reaches suite assembly.
const CAPABILITY_REGISTRY = createDefaultCapabilityRegistry();

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
  /** Display path retained for compatibility with compiler callers. */
  sourceFile?: string;
}

interface ParsedStepOrAssertion {
  step?: Step;
  assertion?: Assertion;
  kind?: string;
}

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
    if (currentScenario) currentScenarioHasErrors = true;
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
        .filter((tag) => tag.startsWith("@"))
        .map((tag) => tag.slice(1));
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
        addError({ line: lineNumber, text: raw, message: "Unrecognized line" });
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

    const stepResult = parseRegisteredStep(parsed.text);
    if (stepResult?.step) {
      currentSteps.push(stepResult.step);
      if (stepResult.kind !== undefined) {
        emitUnknownKindWarning(warnings, stepResult.kind, lineNumber, raw);
      }
      continue;
    }

    const assertionResult = parseRegisteredAssertion(parsed.text);
    if (assertionResult?.assertion) {
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

  flushCurrentScenario();
  return { contracts, errors, warnings };
}

function parseGherkinLine(raw: string, lineNumber: number): GherkinLine | null {
  const keywords = ["Given", "When", "Then", "And", "But"];
  for (const keyword of keywords) {
    if (raw.startsWith(keyword + " ")) {
      return {
        keyword,
        text: raw.slice(keyword.length + 1).trim(),
        lineNumber,
      };
    }
  }
  return null;
}

function parseRegisteredStep(text: string): ParsedStepOrAssertion | null {
  for (const definition of CAPABILITY_REGISTRY.parsers("step")) {
    const match = definition.parser?.parse?.(text);
    if (!match) continue;

    const parsed = definition.inputSchema.safeParse(match.value);
    if (!parsed.success) return null;
    return { step: parsed.data as Step, kind: match.kind };
  }
  return null;
}

function parseRegisteredAssertion(text: string): ParsedStepOrAssertion | null {
  for (const definition of CAPABILITY_REGISTRY.parsers("assertion")) {
    const match = definition.parser?.parse?.(text);
    if (!match) continue;

    const parsed = definition.inputSchema.safeParse(match.value);
    if (!parsed.success) return null;
    return { assertion: parsed.data as Assertion, kind: match.kind };
  }
  return null;
}

function legacyTargetHint(text: string): string | null {
  const legacyAction = text.match(
    /^(?:I )?(click|wait for|check|uncheck|toggle)\s+([A-Za-z0-9_-]+)$/i,
  );
  if (legacyAction) {
    return `Legacy raw target "${legacyAction[2]}" is no longer accepted. Use semantic Gherkin like ` +
      `"${legacyAction[1]} the button "Visible name"" or an explicit fallback like ` +
      `"${legacyAction[1]} testid:${legacyAction[2]}".`;
  }

  const legacyType = text.match(
    /^(?:I )?(type|select)\s+["'](.+?)["']\s+(?:into|in)\s+([A-Za-z0-9_-]+)$/i,
  );
  if (legacyType) {
    return `Legacy raw target "${legacyType[3]}" is no longer accepted. Use a semantic target like ` +
      `"${legacyType[1]} "${legacyType[2]}" into the field "Visible label"" or ` +
      `an explicit fallback like "${legacyType[1]} "${legacyType[2]}" into testid:${legacyType[3]}".`;
  }

  const legacyAssertion = text.match(
    /^(?:I )?should (?:not )?see\s+([A-Za-z0-9_-]+)$/i,
  ) ?? text.match(
    /^([A-Za-z0-9_-]+) should (?:exist|have text|contain|not be visible)/i,
  );
  if (legacyAssertion) {
    return `Legacy raw target "${legacyAssertion[1]}" is no longer accepted. Use semantic Gherkin like ` +
      `"Then I should see the heading "Visible name"" or an explicit fallback like ` +
      `"Then I should see testid:${legacyAssertion[1]}".`;
  }

  return null;
}

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
        .map(
          (suggestion) =>
            `  - "${suggestion.kind}" (${suggestion.category}) — ${suggestion.description}`,
        )
        .join("\n")
    : "  (no close matches found in the recommended vocabulary)";

  const message =
    `Unknown element kind "${kind}" — not in the recommended vocabulary. ` +
    `Did you mean:\n${suggestionText}\n` +
    `If this is intentional, add it to src/modules/dsl/element-kinds.ts ` +
    `and regenerate the docs.`;

  warnings.push({ line, text, kind: "unknown-element-kind", message });
}

function toSnakeCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
