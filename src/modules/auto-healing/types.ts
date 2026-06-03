export interface HealingContext {
  stepType: string;
  targetRef: string;
  kind?: string;
  accessibilityTree: string;
  screenshotBase64?: string;
  errorMessage: string;
}

export interface HealingResult {
  selector?: string; // CSS selector or text/role string if appropriate
  reasoning: string;
}

export interface LLMProvider {
  suggestFix(context: HealingContext): Promise<HealingResult>;
}
