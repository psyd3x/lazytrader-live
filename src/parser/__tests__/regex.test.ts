import { describe, expect, it } from "vitest";
import { parseWithRegex, type RegexResult } from "../regex";
import { RAW_SIGNALS } from "./__fixtures__/rawSignals";

describe("parseWithRegex (per-fixture replay)", () => {
  for (const fixture of RAW_SIGNALS) {
    if (fixture.regexShouldHit) {
      it(`${fixture.id} → template ${fixture.expectedTemplate}, fields match`, () => {
        const result = parseWithRegex(fixture.rawText);
        expect(result.complete).toBe(true);
        expect(result.template).toBe(fixture.expectedTemplate);
        expect(result.fields.pair).toBe(fixture.parsed.pair);
        expect(result.fields.direction).toBe(fixture.parsed.direction);
        expect(result.fields.entry).toBeCloseTo(fixture.parsed.entry, 5);
        expect(result.fields.stopLoss).toBeCloseTo(fixture.parsed.stopLoss, 5);
        expect(result.fields.takeProfits).toHaveLength(fixture.parsed.takeProfits.length);
        for (let i = 0; i < fixture.parsed.takeProfits.length; i++) {
          expect(result.fields.takeProfits![i]).toBeCloseTo(fixture.parsed.takeProfits[i], 5);
        }
        expect(result.fields.leverage).toBe(fixture.parsed.leverage);
      });
    } else {
      it(`${fixture.id} → regex falls through (LLM-only edge case)`, () => {
        const result = parseWithRegex(fixture.rawText);
        expect(result.complete).toBe(false);
      });
    }
  }
});

describe("parseWithRegex (degenerate inputs)", () => {
  it("returns incomplete on empty string", () => {
    const r = parseWithRegex("");
    expect(r.complete).toBe(false);
    expect(r.template).toBeNull();
  });
  it("returns incomplete on garbage", () => {
    const r = parseWithRegex("not a signal at all just random text");
    expect(r.complete).toBe(false);
  });
});
