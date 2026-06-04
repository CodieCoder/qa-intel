import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AutoHealer,
  OpenAIProvider,
} from "../dist/modules/auto-healing/index.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_OPENAI_API_URL = process.env.OPENAI_API_URL;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv("OPENAI_API_KEY", ORIGINAL_OPENAI_API_KEY);
  restoreEnv("OPENAI_API_URL", ORIGINAL_OPENAI_API_URL);
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const HEALING_CONTEXT = {
  stepType: "click",
  locator: { strategy: "role", role: "button", name: "Old button" },
  accessibilityTree: "button New button",
  screenshotBase64: "iVBORw0KGgo=",
  errorMessage: "locator timed out",
};

describe("AutoHealer", () => {
  it("returns a valid provider locator unchanged", async () => {
    const healer = new AutoHealer({
      async suggestFix(context) {
        assert.equal(context, HEALING_CONTEXT);
        return {
          locator: { strategy: "role", role: "button", name: "New button" },
          reasoning: "The new accessible name is present.",
        };
      },
    });

    const result = await healer.heal(HEALING_CONTEXT);

    assert.deepEqual(result, {
      locator: { strategy: "role", role: "button", name: "New button" },
      reasoning: "The new accessible name is present.",
    });
  });

  it("drops invalid provider locators and preserves diagnostic reasoning", async () => {
    const healer = new AutoHealer({
      async suggestFix() {
        return {
          locator: { strategy: "role", role: "not-a-real-role", name: "" },
          reasoning: "bad locator",
        };
      },
    });

    const result = await healer.heal(HEALING_CONTEXT);

    assert.equal(result.locator, undefined);
    assert.match(result.reasoning, /invalid locator/i);
  });

  it("turns provider throws into a non-throwing healing result", async () => {
    const healer = new AutoHealer({
      async suggestFix() {
        throw new Error("provider unavailable");
      },
    });

    const result = await healer.heal(HEALING_CONTEXT);

    assert.equal(result.locator, undefined);
    assert.match(result.reasoning, /provider unavailable/);
  });
});

describe("OpenAIProvider", () => {
  it("rejects when OPENAI_API_KEY is missing before calling fetch", async () => {
    delete process.env.OPENAI_API_KEY;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      throw new Error("should not be called");
    };

    await assert.rejects(
      () => new OpenAIProvider().suggestFix(HEALING_CONTEXT),
      /OPENAI_API_KEY/,
    );
    assert.equal(called, false);
  });

  it("surfaces non-OK provider responses", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    globalThis.fetch = async () => ({
      ok: false,
      statusText: "Bad Request",
      text: async () => "invalid request",
    });

    await assert.rejects(
      () => new OpenAIProvider().suggestFix(HEALING_CONTEXT),
      /OpenAI API Error: Bad Request - invalid request/,
    );
  });

  it("parses successful JSON responses and sends auth, custom URL, and screenshot payload", async () => {
    process.env.OPENAI_API_KEY = "sk-runtime-test";
    process.env.OPENAI_API_URL = "https://openai.test/custom/chat";
    const calls = [];

    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  locator: { strategy: "text", text: "Recovered target" },
                  reasoning: "The text is visible in the accessibility tree.",
                }),
              },
            },
          ],
        }),
      };
    };

    const result = await new OpenAIProvider().suggestFix(HEALING_CONTEXT);

    assert.deepEqual(result, {
      locator: { strategy: "text", text: "Recovered target" },
      reasoning: "The text is visible in the accessibility tree.",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://openai.test/custom/chat");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk-runtime-test");

    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.response_format.type, "json_object");
    assert.equal(payload.messages[0].role, "system");
    assert.equal(payload.messages[1].role, "user");
    assert.ok(
      payload.messages[1].content.some(
        (part) =>
          part.type === "image_url" &&
          part.image_url.url === `data:image/png;base64,${HEALING_CONTEXT.screenshotBase64}`,
      ),
      "screenshot should be sent as an image_url payload",
    );
  });

  it("uses the default OpenAI chat completions URL when no override is set", async () => {
    process.env.OPENAI_API_KEY = "sk-default-url";
    delete process.env.OPENAI_API_URL;
    let calledUrl;

    globalThis.fetch = async (url) => {
      calledUrl = url;
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  reasoning: "No locator needed.",
                }),
              },
            },
          ],
        }),
      };
    };

    const result = await new OpenAIProvider().suggestFix({
      ...HEALING_CONTEXT,
      screenshotBase64: undefined,
    });

    assert.equal(calledUrl, "https://api.openai.com/v1/chat/completions");
    assert.deepEqual(result, { locator: undefined, reasoning: "No locator needed." });
  });
});
