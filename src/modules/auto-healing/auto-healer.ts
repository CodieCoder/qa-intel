import { HealingContext, HealingResult, LLMProvider } from "./types.js";
import { OpenAIProvider } from "./openai-provider.js";
import { LocatorSpecSchema } from "../dsl/index.js";

export class AutoHealer {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    // Default to OpenAI provider if none provided
    this.provider = provider || new OpenAIProvider();
  }

  async heal(context: HealingContext): Promise<HealingResult> {
    try {
      const result = await this.provider.suggestFix(context);
      if (!result.locator) return result;

      const parsed = LocatorSpecSchema.safeParse(result.locator);
      if (!parsed.success) {
        return {
          reasoning: `Auto-healing returned an invalid locator: ${parsed.error.message}`,
        };
      }

      return {
        locator: parsed.data,
        reasoning: result.reasoning,
      };
    } catch (error) {
      return {
        reasoning: `Auto-healing failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
