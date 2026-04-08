// GIFT: Learner Module — cost aggregation (pure)
//
// pi-ai owns the pricing and cost tracking. We aggregate per-turn usage across
// turns, bucket by learning event class, and compute cost-per-mastered-KC metrics
// for the learning report. All functions are pure: no I/O, no mutation.

export type TurnUsage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd: number;
  n_messages: number;
};

// Sum usage across a list of turns. Nulls are skipped. Returns zeros when
// input is empty or all null. `model` in the result is the most-frequent
// model across the input (ties broken by first-seen).
export function sumUsage(
  turns: Array<{ usage: TurnUsage | null }>,
): TurnUsage {
  const modelCounts: Record<string, number> = {};
  const modelOrder: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let totalNMessages = 0;
  let hasCacheRead = false;
  let totalCacheReadTokens = 0;
  let hasCacheWrite = false;
  let totalCacheWriteTokens = 0;

  for (const turn of turns) {
    if (turn.usage === null) continue;
    const u = turn.usage;

    if (!modelCounts[u.model]) {
      modelCounts[u.model] = 0;
      modelOrder.push(u.model);
    }
    modelCounts[u.model] += 1;

    totalInputTokens += u.input_tokens;
    totalOutputTokens += u.output_tokens;
    totalCostUsd += u.cost_usd;
    totalNMessages += u.n_messages;

    if (u.cache_read_tokens !== undefined) {
      hasCacheRead = true;
      totalCacheReadTokens += u.cache_read_tokens;
    }
    if (u.cache_write_tokens !== undefined) {
      hasCacheWrite = true;
      totalCacheWriteTokens += u.cache_write_tokens;
    }
  }

  // Pick the most-frequent model, breaking ties by first-seen order.
  let mostFrequentModel = "";
  let maxCount = 0;
  for (const model of modelOrder) {
    if (modelCounts[model] > maxCount) {
      maxCount = modelCounts[model];
      mostFrequentModel = model;
    }
  }

  const result: TurnUsage = {
    model: mostFrequentModel,
    input_tokens: totalInputTokens,
    output_tokens: totalOutputTokens,
    cost_usd: totalCostUsd,
    n_messages: totalNMessages,
  };

  if (hasCacheRead) {
    result.cache_read_tokens = totalCacheReadTokens;
  }
  if (hasCacheWrite) {
    result.cache_write_tokens = totalCacheWriteTokens;
  }

  return result;
}

// Group turns by LE class and compute per-class totals + averages.
// "(undeclared)" bucket captures turns where le_class is null.
// Turns with usage=null are still counted in n_turns but contribute 0 cost.
// avg_usd = cost_usd / n_turns (or 0 if n_turns === 0).
export function costByLeClass(
  turns: Array<{ usage: TurnUsage | null; le_class: "memory_fluency" | "induction" | "sense_making" | null }>,
): Record<string, { cost_usd: number; n_turns: number; avg_usd: number }> {
  const buckets: Record<string, { cost_usd: number; n_turns: number }> = {
    memory_fluency: { cost_usd: 0, n_turns: 0 },
    induction: { cost_usd: 0, n_turns: 0 },
    sense_making: { cost_usd: 0, n_turns: 0 },
    "(undeclared)": { cost_usd: 0, n_turns: 0 },
  };

  for (const turn of turns) {
    const key = turn.le_class ?? "(undeclared)";
    const b = buckets[key];
    if (b) {
      b.n_turns += 1;
      if (turn.usage !== null) {
        b.cost_usd += turn.usage.cost_usd;
      }
    }
  }

  const result: Record<string, { cost_usd: number; n_turns: number; avg_usd: number }> = {};
  for (const [key, b] of Object.entries(buckets)) {
    result[key] = {
      cost_usd: b.cost_usd,
      n_turns: b.n_turns,
      avg_usd: b.n_turns === 0 ? 0 : b.cost_usd / b.n_turns,
    };
  }
  return result;
}

// Group turns by ISO date (YYYY-MM-DD). Sort ascending. Skip turns with
// malformed `at` or missing usage. Dates with no matching turns are omitted.
export function costByDay(
  turns: Array<{ at: string; usage: TurnUsage | null }>,
): Array<{ date: string; cost_usd: number; n_turns: number }> {
  const buckets: Record<string, { cost_usd: number; n_turns: number }> = {};

  for (const turn of turns) {
    if (turn.usage === null) continue;
    const date = new Date(turn.at);
    if (Number.isNaN(date.getTime())) continue;
    const dateStr = date.toISOString().slice(0, 10);
    if (!buckets[dateStr]) {
      buckets[dateStr] = { cost_usd: 0, n_turns: 0 };
    }
    buckets[dateStr].cost_usd += turn.usage.cost_usd;
    buckets[dateStr].n_turns += 1;
  }

  const result = Object.entries(buckets)
    .map(([date, { cost_usd, n_turns }]) => ({
      date,
      cost_usd,
      n_turns,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

// cost-per-mastered-KC: total spend divided by the count of items whose
// mastery.score >= threshold AND mastery.n_probes > 0. A "mastered KC" is
// one we've actually measured as mastered, not one SM-2 thinks is fluent.
// Returns 0 when there are zero mastered items (don't divide by zero).
export function costPerMasteredKc(
  totalCostUsd: number,
  items: Array<{ mastery?: { score: number; n_probes: number } | null }>,
  threshold: number = 0.7,
): number {
  let masteredCount = 0;
  for (const item of items) {
    const m = item.mastery;
    if (m && m.score >= threshold && m.n_probes > 0) {
      masteredCount += 1;
    }
  }
  if (masteredCount === 0) return 0;
  return totalCostUsd / masteredCount;
}

// Format a TurnUsage as a one-line string for terminal display. Used by the
// report; pure so it's testable.
//   e.g. "claude-sonnet-4-5  1,240→512 tok  $0.0123  (2 msgs)"
export function formatUsage(u: TurnUsage | null): string {
  if (u === null) return "(no usage)";
  const modelPart = u.model || "(unknown)";
  const inputTokens = u.input_tokens.toLocaleString();
  const outputTokens = u.output_tokens.toLocaleString();
  const costPart = `$${u.cost_usd.toFixed(4)}`;
  const msgPart = `(${u.n_messages} msg${u.n_messages === 1 ? "" : "s"})`;
  return `${modelPart}  ${inputTokens}→${outputTokens} tok  ${costPart}  ${msgPart}`;
}
