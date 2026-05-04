import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOpenAiParse } from "../openaiAdapter";
import { LlmAuthError, LlmRateLimitError, LlmError, LlmSchemaError } from "../llm";

const validToolCallResponse = {
  choices: [
    {
      message: {
        tool_calls: [
          {
            type: "function",
            function: {
              name: "extract_signal",
              arguments: JSON.stringify({
                pair: "BTCUSDT",
                direction: "long",
                entry: 70000,
                stopLoss: 69000,
                takeProfits: [71000, 72000],
                leverage: 10,
                multipleTrades: false,
                notes: null,
              }),
            },
          },
        ],
      },
    },
  ],
};

describe("fetchOpenAiParse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ParsedSignal on happy path", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200, json: () => Promise.resolve(validToolCallResponse),
    });
    const out = await fetchOpenAiParse("raw signal text", "sk-test");
    expect(out.pair).toBe("BTCUSDT");
    expect(out.direction).toBe("long");
    expect(out.source).toBe("gpt-4o-mini");
    expect(out.rawText).toBe("raw signal text");
  });

  it("sends correct headers + body shape", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(validToolCallResponse),
    });
    vi.stubGlobal("fetch", mock);
    await fetchOpenAiParse("hello", "sk-mykey");
    const url = mock.mock.calls[0][0] as string;
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer sk-mykey");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.tools[0].function.name).toBe("extract_signal");
    expect(body.tool_choice).toEqual({ type: "function", function: { name: "extract_signal" } });
    expect(body.messages[1].content).toBe("hello");
  });

  it("throws LlmAuthError on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 401, text: () => Promise.resolve("invalid_api_key"),
    });
    await expect(fetchOpenAiParse("x", "bad")).rejects.toBeInstanceOf(LlmAuthError);
  });

  it("throws LlmRateLimitError on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 429, text: () => Promise.resolve("rate_limit"),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("throws LlmError on other HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 503, text: () => Promise.resolve("upstream"),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmSchemaError when no tool_calls in response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: "I refuse" } }] }),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("throws LlmSchemaError when arguments JSON.parse fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { tool_calls: [{ type: "function", function: { name: "extract_signal", arguments: "not valid json {{{" } }] } }],
      }),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("throws LlmSchemaError when arguments fail Zod", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { tool_calls: [{
          type: "function",
          function: { name: "extract_signal", arguments: JSON.stringify({ pair: "B", direction: "buy", entry: -1, stopLoss: 0, takeProfits: [] }) },
        }] } }],
      }),
    });
    await expect(fetchOpenAiParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("propagates abort signal to fetch", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(validToolCallResponse),
    });
    vi.stubGlobal("fetch", mock);
    const ac = new AbortController();
    await fetchOpenAiParse("x", "k", ac.signal);
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ac.signal);
  });
});
