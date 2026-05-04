/**
 * OpenAI gpt-4o-mini adapter — calls Chat Completions API with function
 * calling that pins output to ParsedSignalSchema. Returns a validated
 * ParsedSignal or throws an LlmError subclass.
 *
 * Endpoint: POST https://api.openai.com/v1/chat/completions
 * Auth: Authorization: Bearer header (BYO key, never bundled)
 */

import { ParsedSignalSchema, type ParsedSignal } from "./schema";
import { LlmAuthError, LlmError, LlmRateLimitError, LlmSchemaError } from "./llm";

const URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const SYSTEM_PROMPT =
  "You extract structured trade signal fields from messy social-media text. Use the extract_signal function. If unsure about a field, prefer null over guessing wrong; for required fields, make your best guess.";

const FUNCTION_SCHEMA = {
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

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        type: string;
        function: { name: string; arguments: string };
        [k: string]: unknown;
      }>;
      [k: string]: unknown;
    };
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

export async function fetchOpenAiParse(
  rawText: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ParsedSignal> {
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "extract_signal",
          description: "Extract structured trade signal fields from raw text",
          parameters: FUNCTION_SCHEMA,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "extract_signal" } },
  };

  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    throw new LlmError(`OpenAI network error: ${(e as Error).message}`);
  }

  if (res.status === 401) throw new LlmAuthError("OpenAI API key invalid (HTTP 401)");
  if (res.status === 429) throw new LlmRateLimitError("OpenAI rate-limited (HTTP 429)");
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new LlmError(`OpenAI HTTP ${res.status}: ${bodyText.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as OpenAiResponse;
  const toolCall = json.choices?.[0]?.message?.tool_calls?.find(
    (tc) => tc.type === "function" && tc.function.name === "extract_signal",
  );
  if (!toolCall) {
    throw new LlmSchemaError("OpenAI response missing extract_signal tool_call");
  }

  let args: unknown;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    throw new LlmSchemaError(`OpenAI tool_call arguments not valid JSON: ${(e as Error).message}`);
  }

  const candidate = {
    ...(args as Record<string, unknown>),
    source: "gpt-4o-mini" as const,
    rawText,
    entryRange: null,
    notes:
      (args as Record<string, unknown>).notes !== undefined
        ? (args as { notes: string | null }).notes
        : null,
  };

  const parsed = ParsedSignalSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new LlmSchemaError(`OpenAI returned schema-invalid object: ${parsed.error.message.slice(0, 200)}`);
  }
  return parsed.data;
}
