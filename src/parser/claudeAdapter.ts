/**
 * Claude Haiku adapter — calls Anthropic Messages API with a tool_use
 * request that pins output to ParsedSignalSchema. Returns a validated
 * ParsedSignal or throws an LlmError subclass.
 *
 * Endpoint: POST https://api.anthropic.com/v1/messages
 * Auth: x-api-key header (BYO key, never bundled)
 */

import { ParsedSignalSchema, type ParsedSignal } from "./schema";
import { LlmAuthError, LlmError, LlmRateLimitError, LlmSchemaError } from "./llm";

const URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    pair: {
      type: "string",
      description:
        "Trading pair like BTCUSDT, ETHUSDT, SOLUSDT — base+quote concatenated, no separators. If only the base is in the signal (e.g. just 'BTC' or '#ETH'), append 'USDT' as the quote convention.",
    },
    direction: { type: "string", enum: ["long", "short"] },
    entry: {
      type: "number",
      description: "Entry price; if signal gives a range like '70000-71000', return the midpoint.",
    },
    stopLoss: {
      type: "number",
      description:
        "Stop loss price; if signal gives a range, use the bound closer to the entry price (tighter stop).",
    },
    takeProfits: {
      type: "array",
      items: { type: "number" },
      minItems: 1,
      maxItems: 10,
      description:
        "Take profit prices in order from nearest to farthest from entry. If a TP is given as a range, use the bound closer to entry.",
    },
    leverage: {
      type: ["number", "null"],
      description:
        "Signal's stated leverage if mentioned (midpoint if range like '5-10x'); null if not stated.",
    },
    multipleTrades: {
      type: "boolean",
      description:
        "True if the message contains multiple distinct trade ideas (different entries/SLs). Extract only the first trade's fields if true.",
    },
    notes: {
      type: ["string", "null"],
      description:
        "Free-form execution notes from the signal (e.g. 'MARKET entry', 'SL-BE at TP1', 'wick entry'). Null if none.",
    },
  },
  required: ["pair", "direction", "entry", "stopLoss", "takeProfits", "multipleTrades"],
} as const;

interface ToolUseBlock {
  type: "tool_use";
  name: string;
  input: unknown;
  [k: string]: unknown;
}
interface AnthropicResponse {
  content?: Array<{ type: string; [k: string]: unknown }>;
}

export async function fetchClaudeParse(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ParsedSignal> {
  const body = {
    model: MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "extract_signal",
        description: "Extract structured trade signal fields from raw text",
        input_schema: TOOL_INPUT_SCHEMA,
      },
    ],
    tool_choice: { type: "tool", name: "extract_signal" },
    messages: [{ role: "user", content: rawText }],
  };

  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new LlmError(`Claude network error: ${(e as Error).message}`);
  }

  if (res.status === 401) throw new LlmAuthError("Claude API key invalid (HTTP 401)");
  if (res.status === 429) throw new LlmRateLimitError("Claude rate-limited (HTTP 429)");
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new LlmError(`Claude HTTP ${res.status}: ${bodyText.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as AnthropicResponse;
  const toolUse = json.content?.find(
    (b): b is ToolUseBlock => b.type === "tool_use" && (b as ToolUseBlock).name === "extract_signal",
  );
  if (!toolUse) {
    throw new LlmSchemaError("Claude response missing extract_signal tool_use block");
  }

  const candidate = {
    ...(toolUse.input as Record<string, unknown>),
    source: "claude" as const,
    rawText,
    entryRange: null,
    notes:
      (toolUse.input as Record<string, unknown>).notes !== undefined
        ? (toolUse.input as { notes: string | null }).notes
        : null,
  };

  const parsed = ParsedSignalSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new LlmSchemaError(`Claude returned schema-invalid object: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
