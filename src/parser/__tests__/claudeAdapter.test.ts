import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchClaudeParse } from "../claudeAdapter";
import { LlmAuthError, LlmRateLimitError, LlmError, LlmSchemaError } from "../llm";

const validToolUseResponse = {
  content: [
    {
      type: "tool_use",
      name: "extract_signal",
      input: {
        pair: "BTCUSDT",
        direction: "long",
        entry: 70000,
        stopLoss: 69000,
        takeProfits: [71000, 72000],
        leverage: 10,
        multipleTrades: false,
        notes: null,
      },
    },
  ],
};

describe("fetchClaudeParse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ParsedSignal on happy path", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validToolUseResponse),
    });
    const out = await fetchClaudeParse("raw signal text", "sk-test");
    expect(out.pair).toBe("BTCUSDT");
    expect(out.direction).toBe("long");
    expect(out.source).toBe("claude");
    expect(out.rawText).toBe("raw signal text");
    expect(out.takeProfits).toEqual([71000, 72000]);
  });

  it("sends correct headers + body shape", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(validToolUseResponse),
    });
    vi.stubGlobal("fetch", mock);
    await fetchClaudeParse("hello", "sk-mykey");
    const url = mock.mock.calls[0][0] as string;
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-mykey");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.tools[0].name).toBe("extract_signal");
    expect(body.tool_choice).toEqual({ type: "tool", name: "extract_signal" });
    expect(body.messages[0].content).toBe("hello");
  });

  it("throws LlmAuthError on 401", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 401, text: () => Promise.resolve("invalid_api_key"),
    });
    await expect(fetchClaudeParse("x", "bad")).rejects.toBeInstanceOf(LlmAuthError);
  });

  it("throws LlmRateLimitError on 429", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 429, text: () => Promise.resolve("rate_limit"),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("throws LlmError on other HTTP failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 503, text: () => Promise.resolve("upstream"),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmError);
  });

  it("throws LlmSchemaError when response has no tool_use block", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({ content: [{ type: "text", text: "I refuse to answer" }] }),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("throws LlmSchemaError when tool_use input fails Zod", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      json: () => Promise.resolve({
        content: [{
          type: "tool_use",
          name: "extract_signal",
          input: { pair: "B", direction: "buy", entry: -1, stopLoss: 0, takeProfits: [] },
        }],
      }),
    });
    await expect(fetchClaudeParse("x", "k")).rejects.toBeInstanceOf(LlmSchemaError);
  });

  it("propagates abort signal to fetch", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(validToolUseResponse),
    });
    vi.stubGlobal("fetch", mock);
    const ac = new AbortController();
    await fetchClaudeParse("x", "k", ac.signal);
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ac.signal);
  });
});
