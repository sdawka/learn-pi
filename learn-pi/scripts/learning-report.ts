// GIFT observation script: reports per-KC indicators, LE mix, learning curves,
// per-topic mastery, and the probe-vs-practice gap.
//
//   npx tsx learn-pi/scripts/learning-report.ts ~/LearnVault
//
// Tolerant of vaults that don't yet have kc_type / mastery / topics / le_class
// fields — the first run's job is to show how much is missing. Reads turn
// entries written by learn-loop.ts agent_end (Stream A producer; this is the
// Stream B consumer). The TurnLogEntry shape is duplicated here intentionally;
// see plan §"Shared data contract" — must stay in sync with learn-loop.ts.

import path from "node:path";
import { Vault } from "../lib/vault.ts";
import {
  aggregateByTopic,
  defaultMastery,
  isMasteryStale,
  type MasteryState,
  type TopicMastery,
} from "../lib/mastery.ts";

type KcType = "fact" | "skill" | "principle";
type LeClass = "memory_fluency" | "induction" | "sense_making";

type ItemFrontmatter = {
  lemma?: string;
  kc_type?: KcType;
  topics?: string[];
  sm2?: { ease?: number };
  mastery?: MasteryState;
};

type Opportunity = {
  lemma: string;
  kind: "vocab" | "grammar";
  kc_type: KcType | null;
  topic: string | null;
  grade: 0 | 1 | 2 | 3 | 4 | 5 | null;
  probe: boolean;
  mastery_quality: 0 | 1 | 2 | 3 | 4 | 5 | null;
};

type TurnEntry = {
  at?: string;
  rung?: string;
  subscore?: number;
  le_class?: LeClass | null;
  opportunities?: Opportunity[];
  // Legacy shape from PR #1.
  items_touched?: string[];
};

type BucketStats = {
  count: number;
  easeSum: number;
  masterySum: number;
  probedCount: number;
};

const MAX_OPPORTUNITY = 10;

function emptyBucket(): BucketStats {
  return { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 };
}

function walkItems(
  vault: Vault,
  lang: string,
): Array<{ kind: "vocab" | "grammar"; rel: string; data: ItemFrontmatter }> {
  const out: Array<{
    kind: "vocab" | "grammar";
    rel: string;
    data: ItemFrontmatter;
  }> = [];
  for (const kind of ["vocab", "grammar"] as const) {
    const files = vault.list(`${kind}/${lang}`).filter((p) => p.endsWith(".md"));
    for (const rel of files) {
      const { data } = vault.readFrontmatter<ItemFrontmatter>(rel);
      out.push({ kind, rel, data });
    }
  }
  return out;
}

function kcBuckets(items: ReturnType<typeof walkItems>): Record<string, BucketStats> {
  const buckets: Record<string, BucketStats> = {
    fact: emptyBucket(),
    skill: emptyBucket(),
    principle: emptyBucket(),
    "(missing kc_type)": emptyBucket(),
  };
  for (const { data } of items) {
    const key = data.kc_type ?? "(missing kc_type)";
    const b = buckets[key] ?? emptyBucket();
    buckets[key] = b;
    b.count += 1;
    b.easeSum += data.sm2?.ease ?? 2.5;
    const m = data.mastery ?? defaultMastery();
    b.masterySum += m.score;
    if (m.n_probes > 0) b.probedCount += 1;
  }
  return buckets;
}

// Read every session file and pull out the structured `learn-pi-turn` entries.
// pi-mono's appendEntry writes one JSON object per line; we walk lines and try
// to parse each one. We also handle balanced braces across multiple lines as a
// fallback for pretty-printed entries.
function readTurnEntries(vault: Vault): TurnEntry[] {
  const turns: TurnEntry[] = [];
  const files = vault.list("sessions").filter((p) => p.endsWith(".md"));
  // Sort by filename — session files are ISO-timestamped, so this gives
  // chronological order, which the learning-curve calculator depends on.
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
        // Skip malformed blobs — better to under-count than to crash the report.
      }
    }
  }
  return turns;
}

// Walk a string and yield top-level balanced `{...}` substrings. Handles
// nested objects/arrays and ignores braces inside string literals.
function extractJsonObjects(text: string): string[] {
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

function leMixFromTurns(turns: TurnEntry[]): Record<string, number> {
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

// Build per-KC learning curves: average error rate at opportunity index n,
// bucketed by kc_type. An opportunity is any graded turn (vocab.grade) or
// probe (mastery.probe). Passive items_touched without grading are NOT
// opportunities — KLI is strict about this.
function learningCurves(
  turns: TurnEntry[],
): Record<string, Array<{ n: number; avgError: number; samples: number }>> {
  // Per-KC opportunity sequences keyed by `${kind}:${lemma}`.
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

  // Bucket by kc_type, then average across KCs at each opportunity index.
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

  const out: Record<string, Array<{ n: number; avgError: number; samples: number }>> = {};
  for (const [key, slots] of Object.entries(buckets)) {
    const row = slots.map((vals, i) => ({
      n: i + 1,
      avgError: vals.length === 0 ? NaN : vals.reduce((a, b) => a + b, 0) / vals.length,
      samples: vals.length,
    }));
    if (row.some((r) => r.samples > 0)) out[key] = row;
  }
  return out;
}

function gapList(
  items: ReturnType<typeof walkItems>,
): Array<{ rel: string; lemma: string; ease: number; mastery: number; n_probes: number }> {
  const gaps: Array<{
    rel: string;
    lemma: string;
    ease: number;
    mastery: number;
    n_probes: number;
    severity: number;
  }> = [];
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
  return gaps.map(({ severity: _s, ...rest }) => rest);
}

function formatBucketTable(buckets: Record<string, BucketStats>): string {
  const rows: string[] = [];
  rows.push("  kc_type           count   avgEase   avgMastery   probed");
  rows.push("  ----------------  ------  --------  -----------  ------");
  for (const [key, b] of Object.entries(buckets)) {
    if (b.count === 0) continue;
    const avgEase = (b.easeSum / b.count).toFixed(2);
    const avgMast = (b.masterySum / b.count).toFixed(2);
    rows.push(
      `  ${key.padEnd(16)}  ${String(b.count).padStart(6)}  ${avgEase.padStart(8)}  ${avgMast.padStart(11)}  ${String(b.probedCount).padStart(6)}`,
    );
  }
  return rows.join("\n");
}

function formatCurves(
  curves: Record<string, Array<{ n: number; avgError: number; samples: number }>>,
): string {
  if (Object.keys(curves).length === 0) {
    return "  (no graded opportunities yet — call vocab.grade or mastery.probe to populate)";
  }
  const header = ["  kc_type     "];
  for (let i = 1; i <= MAX_OPPORTUNITY; i += 1) header.push(`n=${i}  `.padStart(6));
  const rows: string[] = [header.join("")];
  rows.push(`  ${"-".repeat(11)}  ${Array.from({ length: MAX_OPPORTUNITY }, () => "----").join("  ")}`);
  for (const [key, row] of Object.entries(curves)) {
    const cells = row.map((r) =>
      Number.isNaN(r.avgError) ? "  -  ".padStart(6) : r.avgError.toFixed(2).padStart(6),
    );
    rows.push(`  ${key.padEnd(11)} ${cells.join("  ")}`);
  }
  rows.push("");
  rows.push("  flat = wrong LE class for this KC type; steep downward = good match");
  return rows.join("\n");
}

function formatTopicTable(agg: Record<string, TopicMastery>): string {
  const entries = Object.entries(agg);
  if (entries.length === 0) {
    return '  (no items have `topics:` set yet — tag items in vocab/grammar frontmatter to enable per-topic measurement)';
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const rows: string[] = [];
  rows.push("  topic                n_items   avg_score   n_probes");
  rows.push("  -------------------  -------   ---------   --------");
  for (const [topic, t] of entries) {
    rows.push(
      `  ${topic.padEnd(19)}  ${String(t.n_items).padStart(7)}   ${t.score.toFixed(2).padStart(9)}   ${String(t.n_probes).padStart(8)}`,
    );
  }
  return rows.join("\n");
}

function main(): void {
  const vaultPath = process.argv[2] ?? path.join(process.env.HOME ?? ".", "LearnVault");
  const vault = new Vault(vaultPath);

  let lang = "es";
  if (vault.exists("profile.md")) {
    const { data } = vault.readFrontmatter<{ target_langs?: string[] }>(
      "profile.md",
    );
    if (data.target_langs?.[0]) lang = data.target_langs[0];
  }

  const items = walkItems(vault, lang);
  const buckets = kcBuckets(items);
  const turns = readTurnEntries(vault);
  const leMix = leMixFromTurns(turns);
  const curves = learningCurves(turns);
  const gaps = gapList(items);
  const topicAgg = aggregateByTopic(
    items.map((i) => ({ topics: i.data.topics, mastery: i.data.mastery })),
  );

  console.log(`learn-pi learning report — vault=${vaultPath} lang=${lang}`);
  console.log(`items scanned: ${items.length}   turn entries: ${turns.length}`);
  console.log("");
  console.log("## Per-KC indicators");
  console.log(formatBucketTable(buckets));
  console.log("");
  console.log("## Learning Event mix (declared per turn)");
  for (const [cls, n] of Object.entries(leMix)) {
    if (n > 0) console.log(`  ${cls.padEnd(18)} ${n}`);
  }
  console.log("");
  console.log("## Learning curves (avg error rate by opportunity)");
  console.log(formatCurves(curves));
  console.log("");
  console.log("## Per-topic mastery");
  console.log(formatTopicTable(topicAgg));
  console.log("");
  console.log("## Probe-vs-practice gap");
  if (gaps.length === 0) {
    console.log("  (none — either mastery is tracked and matches SM-2, or probes haven't run yet)");
  } else {
    console.log("  lemma                    ease    mastery   probes");
    console.log("  -----------------------  ------  --------  ------");
    for (const g of gaps.slice(0, 20)) {
      console.log(
        `  ${g.lemma.padEnd(23)}  ${g.ease.toFixed(2).padStart(6)}  ${g.mastery.toFixed(2).padStart(8)}  ${String(g.n_probes).padStart(6)}`,
      );
    }
    if (gaps.length > 20) console.log(`  ... (${gaps.length - 20} more)`);
  }

  const missing = buckets["(missing kc_type)"]?.count ?? 0;
  if (missing > 0) {
    console.log("");
    console.log(
      `note: ${missing} item(s) lack kc_type. Run scripts/backfill-frontmatter.ts to fix.`,
    );
  }
  if ((leMix["(undeclared)"] ?? 0) > 0) {
    console.log(
      `note: ${leMix["(undeclared)"]} turn(s) had no le_class declared. Agent should call le.declare each turn.`,
    );
  }
}

main();
