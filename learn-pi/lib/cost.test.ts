// Unit tests for the cost module. Run with `npm test` (vitest).
// Covers sumUsage, costByLeClass, costByDay, costPerMasteredKc, and formatUsage.

import { describe, expect, it } from "vitest";
import {
  costByDay,
  costByLeClass,
  costPerMasteredKc,
  formatUsage,
  sumUsage,
  type TurnUsage,
} from "./cost.ts";

const NOW = new Date("2026-04-07T12:00:00.000Z");

describe("sumUsage", () => {
  it("empty input returns zeros", () => {
    const result = sumUsage([]);
    expect(result).toEqual({
      model: "",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      n_messages: 0,
    });
  });

  it("all-null input returns zeros", () => {
    const result = sumUsage([{ usage: null }, { usage: null }]);
    expect(result).toEqual({
      model: "",
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      n_messages: 0,
    });
  });

  it("single populated turn returns its own values verbatim", () => {
    const turn: TurnUsage = {
      model: "claude-sonnet-4-5",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.01,
      n_messages: 1,
    };
    const result = sumUsage([{ usage: turn }]);
    expect(result).toEqual(turn);
  });

  it("three populated turns sum correctly across all numeric fields", () => {
    const turns = [
      {
        usage: {
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.01,
          n_messages: 1,
        },
      },
      {
        usage: {
          model: "claude-opus-4-1",
          input_tokens: 200,
          output_tokens: 100,
          cost_usd: 0.02,
          n_messages: 2,
        },
      },
      {
        usage: {
          model: "claude-sonnet-4-5",
          input_tokens: 300,
          output_tokens: 150,
          cost_usd: 0.03,
          n_messages: 1,
        },
      },
    ];
    const result = sumUsage(turns);
    expect(result.input_tokens).toBe(600);
    expect(result.output_tokens).toBe(300);
    expect(result.cost_usd).toBe(0.06);
    expect(result.n_messages).toBe(4);
    expect(result.model).toBe("claude-sonnet-4-5"); // Most frequent
  });

  it("model voting: two claude-sonnet-4-5 and one claude-opus-4-1 picks sonnet", () => {
    const turns = [
      { usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.01, n_messages: 1 } },
      { usage: { model: "claude-opus-4-1", input_tokens: 200, output_tokens: 100, cost_usd: 0.02, n_messages: 1 } },
      { usage: { model: "claude-sonnet-4-5", input_tokens: 300, output_tokens: 150, cost_usd: 0.03, n_messages: 1 } },
    ];
    const result = sumUsage(turns);
    expect(result.model).toBe("claude-sonnet-4-5");
  });

  it("model tie picks the first-seen model", () => {
    const turns = [
      { usage: { model: "claude-opus-4-1", input_tokens: 100, output_tokens: 50, cost_usd: 0.01, n_messages: 1 } },
      { usage: { model: "claude-sonnet-4-5", input_tokens: 200, output_tokens: 100, cost_usd: 0.02, n_messages: 1 } },
    ];
    const result = sumUsage(turns);
    expect(result.model).toBe("claude-opus-4-1");
  });

  it("cache token fields: mix of defined and undefined includes them in result", () => {
    const turns = [
      {
        usage: {
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 50,
          cache_read_tokens: 10,
          cost_usd: 0.01,
          n_messages: 1,
        },
      },
      {
        usage: {
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 50,
          cache_write_tokens: 20,
          cost_usd: 0.01,
          n_messages: 1,
        },
      },
    ];
    const result = sumUsage(turns);
    expect(result.cache_read_tokens).toBe(10);
    expect(result.cache_write_tokens).toBe(20);
  });

  it("cache token fields: all undefined omits them from result", () => {
    const turns = [
      {
        usage: {
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.01,
          n_messages: 1,
        },
      },
      {
        usage: {
          model: "claude-sonnet-4-5",
          input_tokens: 100,
          output_tokens: 50,
          cost_usd: 0.01,
          n_messages: 1,
        },
      },
    ];
    const result = sumUsage(turns);
    expect(result.cache_read_tokens).toBeUndefined();
    expect(result.cache_write_tokens).toBeUndefined();
  });
});

describe("costByLeClass", () => {
  it("empty input returns all four keys with zeros", () => {
    const result = costByLeClass([]);
    expect(result).toEqual({
      memory_fluency: { cost_usd: 0, n_turns: 0, avg_usd: 0 },
      induction: { cost_usd: 0, n_turns: 0, avg_usd: 0 },
      sense_making: { cost_usd: 0, n_turns: 0, avg_usd: 0 },
      "(undeclared)": { cost_usd: 0, n_turns: 0, avg_usd: 0 },
    });
  });

  it("single memory_fluency turn populates only that bucket; others stay zero", () => {
    const turns = [
      {
        le_class: "memory_fluency" as const,
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
    ];
    const result = costByLeClass(turns);
    expect(result.memory_fluency).toEqual({ cost_usd: 0.10, n_turns: 1, avg_usd: 0.10 });
    expect(result.induction.cost_usd).toBe(0);
    expect(result.sense_making.cost_usd).toBe(0);
  });

  it("null le_class goes to (undeclared) bucket", () => {
    const turns = [
      {
        le_class: null,
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.05, n_messages: 1 },
      },
    ];
    const result = costByLeClass(turns);
    expect(result["(undeclared)"].cost_usd).toBe(0.05);
    expect(result["(undeclared)"].n_turns).toBe(1);
  });

  it("multiple turns: averages compute correctly (2 turns at $0.10 and $0.20 => avg $0.15)", () => {
    const turns = [
      {
        le_class: "memory_fluency" as const,
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
      {
        le_class: "memory_fluency" as const,
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.20, n_messages: 1 },
      },
    ];
    const result = costByLeClass(turns);
    expect(result.memory_fluency.cost_usd).toBeCloseTo(0.30, 5);
    expect(result.memory_fluency.n_turns).toBe(2);
    expect(result.memory_fluency.avg_usd).toBeCloseTo(0.15, 5);
  });

  it("turn with usage=null still increments n_turns but contributes 0 cost", () => {
    const turns = [
      {
        le_class: "induction" as const,
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
      {
        le_class: "induction" as const,
        usage: null,
      },
    ];
    const result = costByLeClass(turns);
    expect(result.induction.cost_usd).toBe(0.10);
    expect(result.induction.n_turns).toBe(2);
    expect(result.induction.avg_usd).toBe(0.05);
  });
});

describe("costByDay", () => {
  it("empty input returns empty array", () => {
    const result = costByDay([]);
    expect(result).toEqual([]);
  });

  it("two turns on same day => one row with summed cost and n_turns=2", () => {
    const turns = [
      {
        at: "2026-04-07T10:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
      {
        at: "2026-04-07T14:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.20, n_messages: 1 },
      },
    ];
    const result = costByDay(turns);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-04-07");
    expect(result[0].n_turns).toBe(2);
    expect(result[0].cost_usd).toBeCloseTo(0.30, 5);
  });

  it("three turns across two days => two rows in chronological order", () => {
    const turns = [
      {
        at: "2026-04-08T10:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
      {
        at: "2026-04-07T14:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.20, n_messages: 1 },
      },
      {
        at: "2026-04-07T20:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.15, n_messages: 1 },
      },
    ];
    const result = costByDay(turns);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-04-07");
    expect(result[0].cost_usd).toBeCloseTo(0.35, 5);
    expect(result[0].n_turns).toBe(2);
    expect(result[1].date).toBe("2026-04-08");
    expect(result[1].cost_usd).toBeCloseTo(0.10, 5);
    expect(result[1].n_turns).toBe(1);
  });

  it("malformed at string is skipped (not added to any day)", () => {
    const turns = [
      {
        at: "not-a-date",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
      {
        at: "2026-04-07T10:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.20, n_messages: 1 },
      },
    ];
    const result = costByDay(turns);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-04-07");
  });

  it("turn with usage=null is skipped entirely", () => {
    const turns = [
      {
        at: "2026-04-07T10:00:00.000Z",
        usage: null,
      },
      {
        at: "2026-04-07T14:00:00.000Z",
        usage: { model: "claude-sonnet-4-5", input_tokens: 100, output_tokens: 50, cost_usd: 0.10, n_messages: 1 },
      },
    ];
    const result = costByDay(turns);
    expect(result).toHaveLength(1);
    expect(result[0].n_turns).toBe(1);
  });
});

describe("costPerMasteredKc", () => {
  it("zero items => returns 0 (no divide-by-zero)", () => {
    const result = costPerMasteredKc(10, []);
    expect(result).toBe(0);
  });

  it("zero mastered items (all below threshold) => returns 0", () => {
    const items = [
      { mastery: { score: 0.5, n_probes: 5 } },
      { mastery: { score: 0.6, n_probes: 3 } },
    ];
    const result = costPerMasteredKc(10, items, 0.7);
    expect(result).toBe(0);
  });

  it("single mastered item, cost $10 => returns 10", () => {
    const items = [{ mastery: { score: 0.8, n_probes: 2 } }];
    const result = costPerMasteredKc(10, items);
    expect(result).toBe(10);
  });

  it("mixed items (1 mastered + 2 not) with cost $6 => returns 6", () => {
    const items = [
      { mastery: { score: 0.8, n_probes: 2 } },
      { mastery: { score: 0.5, n_probes: 1 } },
      { mastery: { score: 0.6, n_probes: 1 } },
    ];
    const result = costPerMasteredKc(6, items);
    expect(result).toBe(6);
  });

  it("custom threshold: item with score 0.6 is mastered at threshold 0.5 but not at 0.7", () => {
    const items = [{ mastery: { score: 0.6, n_probes: 1 } }];
    const result1 = costPerMasteredKc(10, items, 0.5);
    const result2 = costPerMasteredKc(10, items, 0.7);
    expect(result1).toBe(10);
    expect(result2).toBe(0);
  });

  it("item with n_probes=0 is NOT mastered even if score is high", () => {
    const items = [{ mastery: { score: 0.9, n_probes: 0 } }];
    const result = costPerMasteredKc(10, items);
    expect(result).toBe(0);
  });

  it("item with mastery=undefined is NOT mastered", () => {
    const items = [{ mastery: undefined }, { mastery: { score: 0.8, n_probes: 1 } }];
    const result = costPerMasteredKc(10, items);
    expect(result).toBe(10);
  });
});

describe("formatUsage", () => {
  it("null input => (no usage)", () => {
    const result = formatUsage(null);
    expect(result).toBe("(no usage)");
  });

  it("populated input contains model name, both token counts, and a cost", () => {
    const u: TurnUsage = {
      model: "claude-sonnet-4-5",
      input_tokens: 1240,
      output_tokens: 512,
      cost_usd: 0.0123,
      n_messages: 2,
    };
    const result = formatUsage(u);
    expect(result).toContain("claude-sonnet-4-5");
    expect(result).toContain("1,240");
    expect(result).toContain("512");
    expect(result).toContain("$0.0123");
    expect(result).toContain("2");
  });

  it("exact format check: model, tokens with arrow, cost, message count", () => {
    const u: TurnUsage = {
      model: "claude-sonnet-4-5",
      input_tokens: 100,
      output_tokens: 50,
      cost_usd: 0.01,
      n_messages: 1,
    };
    const result = formatUsage(u);
    // Expected: "claude-sonnet-4-5  100→50 tok  $0.0100  (1 msg)"
    expect(result).toMatch(/^claude-sonnet-4-5\s+100→50 tok\s+\$0\.0100\s+\(1 msg\)$/);
  });

  it("message count pluralization: 1 msg vs 2 msgs", () => {
    const u1: TurnUsage = {
      model: "test",
      input_tokens: 10,
      output_tokens: 5,
      cost_usd: 0.01,
      n_messages: 1,
    };
    const u2: TurnUsage = {
      model: "test",
      input_tokens: 10,
      output_tokens: 5,
      cost_usd: 0.01,
      n_messages: 2,
    };
    expect(formatUsage(u1)).toContain("1 msg)");
    expect(formatUsage(u2)).toContain("2 msgs)");
  });
});
