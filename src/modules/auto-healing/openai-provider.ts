import { HealingContext, HealingResult, LLMProvider } from "./types.js";

export class OpenAIProvider implements LLMProvider {
  async suggestFix(context: HealingContext): Promise<HealingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is missing.");
    }

    const prompt = `You are a self-healing QA agent. A Playwright UI test step failed.
The step tried to perform: "${context.stepType}" with this locator:
${JSON.stringify(context.locator, null, 2)}
Error: ${context.errorMessage}

Here is the accessibility tree of the page:
${context.accessibilityTree}

Please analyze the accessibility tree and screenshot and provide an updated LocatorSpec that matches the intended target.
Respond strictly in JSON format with two keys:
1. "locator": one of:
   - {"strategy":"role","role":"button","name":"Visible name"}
   - {"strategy":"label","name":"Visible label"}
   - {"strategy":"placeholder","text":"Placeholder text"}
   - {"strategy":"text","text":"Visible text"}
   - {"strategy":"testid","id":"stable-id"}
   - {"strategy":"css","selector":"CSS selector"}
2. "reasoning": Brief explanation of why this matches the intended target.`;

    const body: any = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that fixes broken UI test locators. Output only JSON.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt }
          ]
        }
      ],
      response_format: { type: "json_object" },
    };

    if (context.screenshotBase64) {
      body.messages[1].content.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${context.screenshotBase64}`
        }
      });
    }

    const response = await fetch(process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API Error: ${response.statusText} - ${text}`);
    }

    const json = await response.json() as any;
    const content = json.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      locator: parsed.locator,
      reasoning: parsed.reasoning,
    };
  }
}
