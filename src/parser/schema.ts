/**
 * ParsedSignal — single source of truth for the parser output shape.
 *
 * Extends SignalInput-compatible fields (consumed by the engine via
 * generateSignalVerification) with M4 display metadata that drives
 * ParsedSignalCard. Zod schema gives runtime validation for LLM responses
 * before they reach the UI.
 */

import { z } from "zod";

export const ParsedSignalSchema = z.object({
  // SignalInput-compatible fields:
  pair: z.string().min(2).max(20),
  direction: z.enum(["long", "short"]),
  entry: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfits: z.array(z.number().positive()).min(1).max(10),
  leverage: z.number().positive().nullable(),

  // M4 display metadata:
  source: z.enum(["regex", "claude", "gpt-4o-mini"]),
  rawText: z.string(),
  multipleTrades: z.boolean(),
  notes: z.string().nullable(),
  entryRange: z.tuple([z.number(), z.number()]).nullable(),
});

export type ParsedSignal = z.infer<typeof ParsedSignalSchema>;
