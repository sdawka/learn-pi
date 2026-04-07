// GIFT: Learner Module — mastery state (probe-updated, distinct from SM-2 ease)
//
// KLI draws a sharp line between *memory/fluency* practice (which SM-2 measures
// via `ease`) and *mastery* as demonstrated under unscaffolded probe conditions.
// A learner can ride scaffolds — rung concessions, inline glosses, weaving —
// and look fluent on SM-2 while failing a cold retrieval. The probe/mastery
// split is the diagnostic: high ease + low mastery = shallow learning.

export type MasteryState = {
  score: number;              // [0, 1]
  last_probed: string | null; // ISO timestamp
  n_probes: number;
};

export const defaultMastery = (): MasteryState => ({
  score: 0,
  last_probed: null,
  n_probes: 0,
});

// Grade an unscaffolded probe outcome. Quality uses the same 0..5 scale as
// SM-2 for authoring symmetry, but the update rule is pure mastery — no
// interval/ease machinery, just a moving average toward the observed quality.
export function gradeProbe(
  prev: MasteryState,
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  now: Date = new Date(),
): MasteryState {
  const target = quality / 5;
  // First probe: snap to the observed value (no prior signal to average with).
  // Subsequent probes: 0.4 new + 0.6 old moving average.
  const score = prev.n_probes === 0 ? target : 0.6 * prev.score + 0.4 * target;
  return {
    score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
    last_probed: now.toISOString(),
    n_probes: prev.n_probes + 1,
  };
}

// Is this item a candidate for a probe turn?
//
// Returns true when the SM-2 signal says the learner looks fluent (ease >= 2.5)
// but mastery either hasn't been measured or is meaningfully below what the
// SM-2 trajectory would predict. The threshold is heuristic — defensive, not
// load-bearing math.
export function isMasteryStale(
  mastery: MasteryState,
  sm2Ease: number,
): boolean {
  if (sm2Ease < 2.5) return false;
  if (mastery.n_probes === 0) return true;
  // sm2Ease runs ~1.3..3.0; map to a [0, 1] expectation and flag a gap > 0.3.
  const expected = Math.min(1, Math.max(0, (sm2Ease - 1.3) / 1.7));
  return mastery.score + 0.3 < expected;
}
