import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../regex", () => ({
  parseWithRegex: vi.fn(),
}));
vi.mock("../llm", () => ({
  parseWithLlm: vi.fn(),
  LlmError: class extends Error {},
  LlmAuthError: class extends Error { name = "LlmAuthError"; },
  LlmRateLimitError: class extends Error { name = "LlmRateLimitError"; },
  LlmSchemaError: class extends Error { name = "LlmSchemaError"; },
}));
vi.mock("../../storage/secureSettings", () => ({
  getLlmConfig: vi.fn(),
}));

import { parseWithRegex } from "../regex";
import { parseWithLlm, LlmAuthError, LlmRateLimitError, LlmSchemaError } from "../llm";
import { getLlmConfig } from "../../storage/secureSettings";
import { parsePipeline, ParseError, type ParsePipelineResult } from "../pipeline";

const regexHit = {
  template: "B" as const,
  fields: {
    pair: "BTCUSDT",
    direction: "long" as const,
    entry: 70000,
    stopLoss: 69000,
    takeProfits: [71000, 72000],
    leverage: 10,
    notes: null,
  },
  complete: true,
};

const regexMiss = { template: null, fields: {}, complete: false };

const llmResult = {
  pair: "ETHUSDT",
  direction: "short" as const,
  entry: 2400,
  stopLoss: 2450,
  takeProfits: [2350],
  leverage: null,
  source: "claude" as const,
  rawText: "raw",
  multipleTrades: false,
  notes: null,
  entryRange: null,
};

describe("parsePipeline", () => {
  beforeEach(() => {
    vi.mocked(parseWithRegex).mockReset();
    vi.mocked(parseWithLlm).mockReset();
    vi.mocked(getLlmConfig).mockReset();
  });

  it("returns regex result when gate passes; LLM not called", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexHit);
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: true }>;
    expect(r.ok).toBe(true);
    expect(r.parsed.source).toBe("regex");
    expect(r.parsed.pair).toBe("BTCUSDT");
    expect(parseWithLlm).not.toHaveBeenCalled();
  });

  it("falls through to LLM when regex misses + key configured", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockResolvedValue(llmResult);
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: true }>;
    expect(r.ok).toBe(true);
    expect(r.parsed.source).toBe("claude");
    expect(parseWithLlm).toHaveBeenCalledOnce();
  });

  it("returns 'no LLM config' error when regex misses + no key", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue(null);
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ParseError.NoLlmConfig);
    expect(parseWithLlm).not.toHaveBeenCalled();
  });

  it("returns 'auth invalid' on LlmAuthError", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "bad" });
    vi.mocked(parseWithLlm).mockRejectedValue(new LlmAuthError("bad key"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.AuthInvalid);
  });

  it("returns 'rate limited' on LlmRateLimitError", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockRejectedValue(new LlmRateLimitError("slow down"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.RateLimited);
  });

  it("returns 'malformed' on LlmSchemaError", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockRejectedValue(new LlmSchemaError("bad shape"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.Malformed);
  });

  it("returns 'network' on generic Error from LLM", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockRejectedValue(new Error("ETIMEDOUT"));
    const r = (await parsePipeline("raw")) as Extract<ParsePipelineResult, { ok: false }>;
    expect(r.error).toBe(ParseError.Network);
  });

  it("propagates AbortSignal to LLM call", async () => {
    vi.mocked(parseWithRegex).mockReturnValue(regexMiss);
    vi.mocked(getLlmConfig).mockResolvedValue({ provider: "claude", apiKey: "k" });
    vi.mocked(parseWithLlm).mockResolvedValue(llmResult);
    const ac = new AbortController();
    await parsePipeline("raw", ac.signal);
    expect(vi.mocked(parseWithLlm)).toHaveBeenCalledWith("raw", { provider: "claude", apiKey: "k" }, ac.signal);
  });
});
