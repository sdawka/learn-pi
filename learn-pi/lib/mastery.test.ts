// Unit tests for the mastery module. Run with `npm test` (vitest).
// Covers gradeProbe edges, isMasteryStale thresholds, and aggregateByTopic.

import { describe, expect, it } from "vitest";
import {
  aggregateByTopic,
  defaultMastery,
  gradeProbe,
  isMasteryStale,
  type MasteryState,
} from "./mastery.ts";

const NOW = new Date("2026-04-07T12:00:00.000Z");

describe("defaultMastery", () => {
  it("returns a fresh zero state", () => {
    expect(defaultMastery()).toEqual({
      score: 0,
      last_probed: null,
      n_probes: 0,
    });
  });
});

describe("gradeProbe", () => {
  it("first probe snaps to quality/5", () => {
    const next = gradeProbe(defaultMastery(), 4, NOW);
    expect(next.score).toBe(0.8);
    expect(next.n_probes).toBe(1);
    expect(next.last_probed).toBe(NOW.toISOString());
  });

  it("second probe is 0.6*old + 0.4*new", () => {
    const after1 = gradeProbe(defaultMastery(), 5, NOW); // score 1.0
    const after2 = gradeProbe(after1, 0, NOW);           // 0.6*1.0 + 0.4*0 = 0.6
    expect(after2.score).toBe(0.6);
    expect(after2.n_probes).toBe(2);
  });

  it("rounds score to 2 decimals", () => {
    const prior: MasteryState = { score: 0.333, last_probed: null, n_probes: 1 };
    const next = gradeProbe(prior, 2, NOW); // 0.6*0.333 + 0.4*0.4 = 0.3598
    expect(next.score).toBe(0.36);
  });

  it("clamps score to [0, 1]", () => {
    // Synthetic prior outside the range to verify the clamp.
    const wild: MasteryState = { score: 5, last_probed: null, n_probes: 1 };
    const next = gradeProbe(wild, 5, NOW); // 0.6*5 + 0.4*1 = 3.4 → clamp 1
    expect(next.score).toBe(1);
  });

  it("quality 0 first probe is exactly 0", () => {
    expect(gradeProbe(defaultMastery(), 0, NOW).score).toBe(0);
  });

  it("quality 5 first probe is exactly 1", () => {
    expect(gradeProbe(defaultMastery(), 5, NOW).score).toBe(1);
  });

  it("increments n_probes monotonically", () => {
    let m = defaultMastery();
    for (let i = 0; i < 5; i += 1) m = gradeProbe(m, 3, NOW);
    expect(m.n_probes).toBe(5);
  });
});

describe("isMasteryStale", () => {
  it("returns false when SM-2 ease is below 2.5", () => {
    expect(isMasteryStale(defaultMastery(), 2.4)).toBe(false);
  });

  it("returns true when ease is high and item has never been probed", () => {
    expect(isMasteryStale(defaultMastery(), 2.6)).toBe(true);
  });

  it("returns false when probed mastery matches the ease-derived expectation", () => {
    // ease 2.8 → expected ≈ (2.8 - 1.3) / 1.7 ≈ 0.882. Score 0.85 is within 0.3.
    const probed: MasteryState = { score: 0.85, last_probed: NOW.toISOString(), n_probes: 3 };
    expect(isMasteryStale(probed, 2.8)).toBe(false);
  });

  it("returns true when probed mastery is well below expectation", () => {
    // ease 2.8 → expected ≈ 0.882. Score 0.3 is more than 0.3 below.
    const probed: MasteryState = { score: 0.3, last_probed: NOW.toISOString(), n_probes: 3 };
    expect(isMasteryStale(probed, 2.8)).toBe(true);
  });
});

describe("aggregateByTopic", () => {
  it("returns empty object for empty input", () => {
    expect(aggregateByTopic([])).toEqual({});
  });

  it("buckets a single item into its single topic", () => {
    const out = aggregateByTopic([
      {
        topics: ["copula"],
        mastery: { score: 0.5, last_probed: null, n_probes: 2 },
      },
    ]);
    expect(out).toEqual({
      copula: { score: 0.5, n_items: 1, n_probes: 2 },
    });
  });

  it("counts multi-topic items in every bucket they belong to", () => {
    const out = aggregateByTopic([
      {
        topics: ["ser_estar", "copula"],
        mastery: { score: 0.8, last_probed: null, n_probes: 4 },
      },
    ]);
    expect(out.ser_estar).toEqual({ score: 0.8, n_items: 1, n_probes: 4 });
    expect(out.copula).toEqual({ score: 0.8, n_items: 1, n_probes: 4 });
  });

  it("excludes items without topics", () => {
    const out = aggregateByTopic([
      { topics: [], mastery: { score: 0.9, last_probed: null, n_probes: 1 } },
      { mastery: { score: 0.9, last_probed: null, n_probes: 1 } },
    ]);
    expect(out).toEqual({});
  });

  it("computes unweighted mean across items in a topic", () => {
    const out = aggregateByTopic([
      { topics: ["t"], mastery: { score: 0.2, last_probed: null, n_probes: 1 } },
      { topics: ["t"], mastery: { score: 0.6, last_probed: null, n_probes: 2 } },
      { topics: ["t"], mastery: { score: 1.0, last_probed: null, n_probes: 3 } },
    ]);
    expect(out.t).toEqual({ score: 0.6, n_items: 3, n_probes: 6 });
  });

  it("treats missing mastery as defaultMastery (score 0)", () => {
    const out = aggregateByTopic([{ topics: ["t"] }]);
    expect(out.t).toEqual({ score: 0, n_items: 1, n_probes: 0 });
  });
});
