// GIFT observation script: reports per-KC learning indicators, LE mix, and
// the probe-vs-practice gap. Run against a vault:
//
//   npx tsx learn-pi/scripts/learning-report.ts ~/LearnVault
//
// Safe on vaults that don't yet have kc_type / mastery / le_class fields —
// the first run's job is to show how much is missing.

import path from "node:path";
import { Vault } from "../lib/vault.ts";
import {
  defaultMastery,
  isMasteryStale,
  type MasteryState,
} from "../lib/mastery.ts";

type KcType = "fact" | "skill" | "principle";
type LeClass = "memory_fluency" | "induction" | "sense_making";

type ItemFrontmatter = {
  lemma?: string;
  kc_type?: KcType;
  sm2?: { ease?: number };
  mastery?: MasteryState;
};

type BucketStats = {
  count: number;
  easeSum: number;
  masterySum: number;
  probedCount: number;
};

function emptyBucket(): BucketStats {
  return { count: 0, easeSum: 0, masterySum: 0, probedCount: 0 };
}

function walkItems(vault: Vault, lang: string): Array<{
  kind: "vocab" | "grammar";
  rel: string;
  data: ItemFrontmatter;
}> {
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

function leMixFromSessions(vault: Vault): Record<string, number> {
  const counts: Record<string, number> = {
    memory_fluency: 0,
    induction: 0,
    sense_making: 0,
    "(unset)": 0,
  };
  const files = vault.list("sessions").filter((p) => p.endsWith(".md"));
  for (const rel of files) {
    const raw = vault.read(rel);
    // Session files are append-only; each turn is a markdown block that
    // encodes le_class either in frontmatter or inline JSON. Count any
    // mention in either form — this is a reporting tool, be generous.
    const turnEntries = raw.match(/le_class["']?\s*[:=]\s*["']?([a-z_]+)/g) ?? [];
    if (turnEntries.length === 0) {
      counts["(unset)"] += 1;
      continue;
    }
    for (const entry of turnEntries) {
      const m = entry.match(/le_class["']?\s*[:=]\s*["']?([a-z_]+)/);
      const cls = m?.[1] ?? "(unset)";
      counts[cls] = (counts[cls] ?? 0) + 1;
    }
  }
  return counts;
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

function main(): void {
  const vaultPath = process.argv[2] ?? path.join(process.env.HOME ?? ".", "LearnVault");
  const vault = new Vault(vaultPath);

  // Language selection: profile.md's first target_lang, else "es".
  let lang = "es";
  if (vault.exists("profile.md")) {
    const { data } = vault.readFrontmatter<{ target_langs?: string[] }>(
      "profile.md",
    );
    if (data.target_langs?.[0]) lang = data.target_langs[0];
  }

  const items = walkItems(vault, lang);
  const buckets = kcBuckets(items);
  const leMix = leMixFromSessions(vault);
  const gaps = gapList(items);

  console.log(`learn-pi learning report — vault=${vaultPath} lang=${lang}`);
  console.log(`items scanned: ${items.length}`);
  console.log("");
  console.log("## Per-KC indicators");
  console.log(formatBucketTable(buckets));
  console.log("");
  console.log("## Learning Event mix (from sessions/)");
  for (const [cls, n] of Object.entries(leMix)) {
    if (n > 0) console.log(`  ${cls.padEnd(18)} ${n}`);
  }
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
      `note: ${missing} item(s) lack kc_type. New items default to fact; backfill older items by editing frontmatter.`,
    );
  }
  if (leMix["(unset)"] > 0) {
    console.log(
      `note: ${leMix["(unset)"]} session file(s) had no le_class entries. Turn planner may not be declaring le_class yet.`,
    );
  }
}

main();
