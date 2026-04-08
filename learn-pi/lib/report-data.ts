// GIFT: Learner Module — pure data extraction for the learning report
//
// Both the terminal report (scripts/learning-report.ts) and the HTML dashboard
// (scripts/dashboard.ts) depend on the same data. Putting the extraction here
// guarantees they can't drift apart — one source of truth, two renderers.
//
// Everything in this file is pure except `walkItems` and `readTurnEntries`,
// which hit the filesystem via Vault. They're the boundary; everything that
// consumes their output is pure and easy to test.

import path from "node:path";
import { Vault } from "./vault.ts";
import {
  aggregateByTopic,
  defaultMastery,
  isMasteryStale,
  type MasteryState,
  type TopicMastery,
} from "./mastery.ts";
import {
  costByDay,
  costByLeClass,
  costPerMasteredKc,
  sumUsage,
  type TurnUsage,
} from "./cost.ts";

export type KcType = "fact" | "skill" | "principle";
export type LeClass = "memory_fluency" | "induction" | "sense_making";

export type ItemFrontmatter = {
  lemma?: string;
  kc_type?: KcType;
  topics?: string[];
  sm2?: { ease?: number };
  mastery?: MasteryState;
};

export type Opportunity = {
  lemma: string;
  kind: "vocab" | "grammar";
  kc_type: KcType | null;
  topic: string | null;
  grade: 0 | 1 | 2 | 3 | 4 | 5 | null;
  probe: boolean;
  mastery_quality: 0 | 1 | 2 | 3 | 4 | 5 | null;
};

export type TurnEntry = {
  at?: string;
  rung?: string;
  subscore?: number;
  le_class?: LeClass | null;
  opportunities?: Opportunity[];
  usage?: TurnUsage | null;
  items_touched?: string[];
};

export type WalkedItem = {
  kind: "vocab" | "grammar";
  rel: string;
  data: ItemFrontmatter;
};

export type KcBucket = {
  count: number;
  avgEase: number;
  avgMastery: number;
  probedCount: number;
};

export type CurvePoint = { n: number; avgError: number; samples: number };

export type GapRow = {
  rel: string;
  lemma: string;
  ease: number;
  mastery: number;
  n_probes: number;
  severity: number; // expected - mastery.score
};

export type CostSummary = {
  hasUsage: boolean;
  total: TurnUsage;
  withUsageCount: number;
  byLeClass: Record<string, { cost_usd: number; n_turns: number; avg_usd: number }>;
  byDay: Array<{ date: string; cost_usd: number; n_turns: number }>;
  masteredCount: number;
  costPerMasteredKc: number;
};

export type ReportData = {
  vaultPath: string;
  lang: string;
  items: WalkedItem[];
  turns: TurnEntry[];
  kcBuckets: Record<string, KcBucket>;
  leMix: Record<string, number>;
  curves: Record<string, CurvePoint[]>;
  topicMastery: Record<string, TopicMastery>;
  gaps: GapRow[];
  cost: CostSummary;
  generatedAt: string;
};

export const MAX_OPPORTUNITY = 10;

// ── Filesystem boundary ────────────────────────────────────────────────────

export function walkItems(vault: Vault, lang: string): WalkedItem[] {
  const out: WalkedItem[] = [];
  for (const kind of ["vocab", "grammar"] as const) {
    const files = vault.list(`${kind}/${lang}`).filter((p) => p.endsWith(".md"));
    for (const rel of files) {
      const { data } = vault.readFrontmatter<ItemFrontmatter>(rel);
      out.push({ kind, rel, data });
    }
  }
  return out;
}

export function readTurnEntries(vault: Vault): TurnEntry[] {
  const turns: TurnEntry[] = [];
  const files = vault.list("sessions").filter((p) => p.endsWith(".md"));
  files.sort();
  for (const rel of files) {
    const raw = vault.read(rel);
    for (const candidate of extractJsonObjects(raw)) {
      try {
        const parsed = JSON.parse(candidate) as TurnEntry;
        if (parsed && (parsed.opportunities || parsed.items_touched)) {
          turns.push(parsed);
        }
      } catch {
        // Skip malformed blobs — better to under-count than to crash.
      }
    }
  }
  return turns;
}

// Walk a string and yield top-level balanced `{...}` substrings. Handles
// nested objects/arrays and ignores braces inside string literals.
export function extractJsonObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

// ── Pure derivations ───────────────────────────────────────────────────────

export function computeKcBuckets(items: WalkedItem[]): Record<string, KcBucket> {
  type Accum = { count: number; easeSum: number; masterySum: number; probedCount: number };
  const accum: Record<string, Accum> = {
    fact: { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 },
    skill: { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 },
    principle: { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 },
    "(missing kc_type)": { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 },
  };
  for (const { data } of items) {
    const key = data.kc_type ?? "(missing kc_type)";
    const a = accum[key] ?? { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 };
    accum[key] = a;
    a.count += 1;
    a.easeSum += data.sm2?.ease ?? 2.5;
    const m = data.mastery ?? defaultMastery();
    a.masterySum += m.score;
    if (m.n_probes > 0) a.probedCount += 1;
  }
  const out: Record<string, KcBucket> = {};
  for (const [key, a] of Object.entries(accum)) {
    if (a.count === 0) continue;
    out[key] = {
      count: a.count,
      avgEase: a.easeSum / a.count,
      avgMastery: a.masterySum / a.count,
      probedCount: a.probedCount,
    };
  }
  return out;
}

export function computeLeMix(turns: TurnEntry[]): Record<string, number> {
  const counts: Record<string, number> = {
    memory_fluency: 0,
    induction: 0,
    sense_making: 0,
    "(undeclared)": 0,
  };
  for (const t of turns) {
    const cls = t.le_class ?? "(undeclared)";
    counts[cls] = (counts[cls] ?? 0) + 1;
  }
  return counts;
}

// Per-KC learning curves: avg error rate at opportunity index n, bucketed by
// kc_type. Only graded opportunities and probes count — passive items_touched
// entries are not opportunities (KLI is strict about this).
export function computeCurves(
  turns: TurnEntry[],
): Record<string, CurvePoint[]> {
  const sequences = new Map<string, { kc_type: KcType | null; errors: number[] }>();
  for (const t of turns) {
    if (!t.opportunities) continue;
    for (const op of t.opportunities) {
      if (op.grade === null && !op.probe) continue;
      const key = `${op.kind}:${op.lemma}`;
      const seq = sequences.get(key) ?? { kc_type: op.kc_type, errors: [] };
      const quality = op.probe ? op.mastery_quality : op.grade;
      if (quality === null) continue;
      seq.errors.push(1 - quality / 5);
      seq.kc_type = seq.kc_type ?? op.kc_type;
      sequences.set(key, seq);
    }
  }
  const buckets: Record<string, Array<number[]>> = {
    fact: Array.from({ length: MAX_OPPORTUNITY }, () => []),
    skill: Array.from({ length: MAX_OPPORTUNITY }, () => []),
    principle: Array.from({ length: MAX_OPPORTUNITY }, () => []),
    "(missing kc_type)": Array.from({ length: MAX_OPPORTUNITY }, () => []),
  };
  for (const seq of sequences.values()) {
    const key = seq.kc_type ?? "(missing kc_type)";
    const slots = buckets[key];
    if (!slots) continue;
    for (let i = 0; i < seq.errors.length && i < MAX_OPPORTUNITY; i += 1) {
      slots[i].push(seq.errors[i]);
    }
  }
  const out: Record<string, CurvePoint[]> = {};
  for (const [key, slots] of Object.entries(buckets)) {
    const row: CurvePoint[] = slots.map((vals, i) => ({
      n: i + 1,
      avgError: vals.length === 0 ? NaN : vals.reduce((a, b) => a + b, 0) / vals.length,
      samples: vals.length,
    }));
    if (row.some((r) => r.samples > 0)) out[key] = row;
  }
  return out;
}

export function computeGaps(items: WalkedItem[]): GapRow[] {
  const gaps: GapRow[] = [];
  for (const { rel, data } of items) {
    const ease = data.sm2?.ease ?? 2.5;
    const m = data.mastery ?? defaultMastery();
    if (!isMasteryStale(m, ease)) continue;
    const expected = Math.min(1, Math.max(0, (ease - 1.3) / 1.7));
    const severity = expected - m.score;
    gaps.push({
      rel,
      lemma: data.lemma ?? path.basename(rel, ".md"),
      ease,
      mastery: m.score,
      n_probes: m.n_probes,
      severity,
    });
  }
  gaps.sort((a, b) => b.severity - a.severity);
  return gaps;
}

export function computeCostSummary(
  turns: TurnEntry[],
  items: WalkedItem[],
): CostSummary {
  const normalized = turns.map((t) => ({
    at: t.at ?? "",
    le_class: t.le_class ?? null,
    usage: t.usage ?? null,
  }));
  const withUsageCount = normalized.filter((t) => t.usage !== null).length;
  const total = sumUsage(normalized);
  const byLeClass = costByLeClass(normalized);
  const byDay = costByDay(normalized);
  const itemsForMastery = items.map((i) => ({ mastery: i.data.mastery ?? null }));
  const masteredCount = itemsForMastery.filter(
    (i) => i.mastery && i.mastery.n_probes > 0 && i.mastery.score >= 0.7,
  ).length;
  const cpmk = costPerMasteredKc(total.cost_usd, itemsForMastery);
  return {
    hasUsage: withUsageCount > 0,
    total,
    withUsageCount,
    byLeClass,
    byDay,
    masteredCount,
    costPerMasteredKc: cpmk,
  };
}

// ── Top-level assembly ─────────────────────────────────────────────────────

export function buildReportData(vault: Vault, vaultPath: string): ReportData {
  let lang = "es";
  if (vault.exists("profile.md")) {
    const { data } = vault.readFrontmatter<{ target_langs?: string[] }>(
      "profile.md",
    );
    if (data.target_langs?.[0]) lang = data.target_langs[0];
  }
  const items = walkItems(vault, lang);
  const turns = readTurnEntries(vault);
  return {
    vaultPath,
    lang,
    items,
    turns,
    kcBuckets: computeKcBuckets(items),
    leMix: computeLeMix(turns),
    curves: computeCurves(turns),
    topicMastery: aggregateByTopic(
      items.map((i) => ({ topics: i.data.topics, mastery: i.data.mastery })),
    ),
    gaps: computeGaps(items),
    cost: computeCostSummary(turns, items),
    generatedAt: new Date().toISOString(),
  };
}
