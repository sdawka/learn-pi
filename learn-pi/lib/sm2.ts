// GIFT: Pedagogical Module — memory_fluency LE (SM-2 grading, pure)
//
// Classic SM-2 (SuperMemo 2) — https://super-memory.com/english/ol/sm2.htm
// Kept deliberately tiny: ~30 lines, no dependencies.
//
// Scoped to the KLI memory_fluency Learning Event only. SM-2 `ease` measures
// scaffolded recall; it is NOT a mastery signal. For transfer measurement see
// `lib/mastery.ts` and the probe path in `spaced-queue.ts`.

export type Sm2State = {
  ease: number;        // E-factor, min 1.3
  interval: number;    // days until next review
  reps: number;        // successful reps in a row (resets on quality < 3)
  next_review: string; // ISO date
};

export function initSm2(now: Date = new Date()): Sm2State {
  return { ease: 2.5, interval: 0, reps: 0, next_review: now.toISOString() };
}

export function gradeSm2(
  state: Sm2State,
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  now: Date = new Date(),
): Sm2State {
  let { ease, interval, reps } = state;
  if (quality < 3) {
    reps = 0;
    interval = 1;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const next = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);
  return { ease, interval, reps, next_review: next.toISOString() };
}
