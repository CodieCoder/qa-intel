import type { LocatorSpec } from "../dsl/index.js";

export interface HealingContext {
  stepType: string;
  locator: LocatorSpec;
  accessibilityTree: string;
  screenshotBase64?: string;
  errorMessage: string;
}

export interface HealingResult {
  locator?: LocatorSpec;
  reasoning: string;
}

export interface LLMProvider {
  suggestFix(context: HealingContext): Promise<HealingResult>;
}
