import { HealingContext, HealingResult, LLMProvider } from "./types.js";
import { OpenAIProvider } from "./openai-provider.js";

export class AutoHealer {
  private provider: LLMProvider;

  constructor(provider?: LLMProvider) {
    // Default to OpenAI provider if none provided
    this.provider = provider || new OpenAIProvider();
  }

  async heal(context: HealingContext): Promise<HealingResult> {
    try {
      return await this.provider.suggestFix(context);
    } catch (error) {
      return {
        reasoning: `Auto-healing failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
