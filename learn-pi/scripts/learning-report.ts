// GIFT observation script: terminal report of per-KC indicators, LE mix,
// learning curves, cost, per-topic mastery, and the probe-vs-practice gap.
//
//   npx tsx learn-pi/scripts/learning-report.ts ~/LearnVault
//
// All data extraction lives in lib/report-data.ts — this file is pure
// formatting. The HTML dashboard at scripts/dashboard.ts reads the same
// data and renders it differently.

import path from "node:path";
import { Vault } from "../lib/vault.ts";
import {
  buildReportData,
  MAX_OPPORTUNITY,
  type CostSummary,
  type CurvePoint,
  type GapRow,
  type KcBucket,
  type ReportData,
} from "../lib/report-data.ts";
import { type TopicMastery } from "../lib/mastery.ts";

// ── Tiny layout helpers ────────────────────────────────────────────────────

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[38;5;209m";
const GREEN = "\x1b[38;5;108m";

// Disable color when piped (tsx sets process.stdout.isTTY correctly).
const useColor = process.stdout.isTTY === true;
const dim = (s: string) => (useColor ? `${DIM}${s}${RESET}` : s);
const bold = (s: string) => (useColor ? `${BOLD}${s}${RESET}` : s);
const warn = (s: string) => (useColor ? `${RED}${s}${RESET}` : s);
const good = (s: string) => (useColor ? `${GREEN}${s}${RESET}` : s);

const REPORT_WIDTH = 78;

function hr(ch = "─"): string {
  return dim(ch.repeat(REPORT_WIDTH));
}

function sectionHeading(n: number, title: string, subtitle?: string): string {
  const head = `${dim(`§${n}`)}  ${bold(title.toUpperCase())}`;
  if (!subtitle) return head;
  return `${head}  ${dim(`· ${subtitle}`)}`;
}

// Right-align a number to a fixed width, preserving a leading "$" sign when
// present without an extra space.
function pad(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}
function padr(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}
function money(n: number): string {
  return `$${n.toFixed(4)}`;
}

// ── Section renderers ──────────────────────────────────────────────────────

function renderMasthead(data: ReportData): string {
  const lines: string[] = [];
  lines.push(bold("LEARN-PI LEARNING REPORT"));
  lines.push(
    dim(
      `${data.vaultPath}  ·  lang=${data.lang}  ·  ${data.items.length} items · ${data.turns.length} turns  ·  generated ${data.generatedAt.slice(0, 19).replace("T", " ")}`,
    ),
  );
  return lines.join("\n");
}

function renderKcBuckets(buckets: Record<string, KcBucket>): string {
  if (Object.keys(buckets).length === 0) {
    return dim("  (no items yet)");
  }
  const rows: string[] = [];
  rows.push(
    dim("  kc_type        ") +
      dim("   count") +
      dim("   avg ease") +
      dim("   avg mastery") +
      dim("   probed"),
  );
  for (const [key, b] of Object.entries(buckets)) {
    const keyDisplay =
      key === "(missing kc_type)" ? warn(padr("(missing)", 14)) : padr(key, 14);
    rows.push(
      `  ${keyDisplay}  ${pad(String(b.count), 6)}   ${pad(b.avgEase.toFixed(2), 8)}   ${pad(b.avgMastery.toFixed(2), 11)}   ${pad(String(b.probedCount), 6)}`,
    );
  }
  return rows.join("\n");
}

function renderLeMix(leMix: Record<string, number>): string {
  const entries = Object.entries(leMix).filter(([, n]) => n > 0);
  if (entries.length === 0) return dim("  (no turns logged)");
  const total = entries.reduce((a, [, n]) => a + n, 0);
  const maxLabel = Math.max(...entries.map(([k]) => k.length));
  const rows: string[] = [];
  for (const [cls, n] of entries) {
    const pct = (n / total) * 100;
    const barWidth = Math.round((n / total) * 32);
    const bar = "▰".repeat(barWidth) + dim("▱".repeat(32 - barWidth));
    const label = cls === "(undeclared)" ? warn(padr(cls, maxLabel)) : padr(cls, maxLabel);
    rows.push(`  ${label}  ${bar}  ${pad(String(n), 4)}  ${dim(`${pct.toFixed(0).padStart(3)}%`)}`);
  }
  return rows.join("\n");
}

function renderCurves(curves: Record<string, CurvePoint[]>): string {
  if (Object.keys(curves).length === 0) {
    return dim("  (no graded opportunities yet — call vocab.grade or mastery.probe)");
  }
  const colWidth = 5;
  const labelWidth = 14;
  const header =
    dim(padr("  kc_type", labelWidth + 2)) +
    Array.from({ length: MAX_OPPORTUNITY }, (_, i) => dim(pad(`n${i + 1}`, colWidth))).join(" ");
  const rows: string[] = [header];
  rows.push(dim("  " + "─".repeat(labelWidth) + "  " + "─".repeat(MAX_OPPORTUNITY * (colWidth + 1) - 1)));
  for (const [key, row] of Object.entries(curves)) {
    const cells = row
      .map((r) =>
        Number.isNaN(r.avgError) ? dim(pad("·", colWidth)) : pad(r.avgError.toFixed(2), colWidth),
      )
      .join(" ");
    const label = key === "(missing kc_type)" ? warn(padr("(missing)", labelWidth)) : padr(key, labelWidth);
    rows.push(`  ${label}  ${cells}`);
  }
  rows.push("");
  rows.push(
    dim(
      `  ${good("↓ steep downward")} = LE class matches the KC type   ·   ${warn("— flat")} = mismatch`,
    ),
  );
  return rows.join("\n");
}

function renderCost(cost: CostSummary): string {
  if (!cost.hasUsage) {
    return dim(
      "  (no usage data recorded yet — turns pre-date cost tracking or message_end didn't fire)",
    );
  }
  const rows: string[] = [];
  const totalLine =
    bold(money(cost.total.cost_usd)) +
    dim(`  across ${cost.withUsageCount} turns   `) +
    dim(`${cost.total.input_tokens.toLocaleString()} in → ${cost.total.output_tokens.toLocaleString()} out   `) +
    dim(`model=${cost.total.model || "(unknown)"}`);
  rows.push("  " + totalLine);

  // Headline: cost per mastered KC (Principle 5 falsifiable metric)
  if (cost.masteredCount > 0) {
    rows.push(
      "  " +
        dim("cost / mastered KC  ") +
        bold(money(cost.costPerMasteredKc)) +
        dim(`   (${cost.masteredCount} mastered item${cost.masteredCount === 1 ? "" : "s"}, score ≥ 0.7)   `) +
        good("← lower is better"),
    );
  } else {
    rows.push(
      "  " +
        dim("cost / mastered KC  ") +
        warn("n/a  ⚠") +
        dim(`  ${money(cost.total.cost_usd)} spent, `) +
        warn("0 items mastered"),
    );
    rows.push(
      dim(
        '    zero here means "no probes yet", NOT "free" — run mastery.probe to measure mastery',
      ),
    );
  }
  rows.push("");

  // By LE class — with cost bars
  const leEntries = (["memory_fluency", "induction", "sense_making", "(undeclared)"] as const)
    .map((k) => [k, cost.byLeClass[k]] as const)
    .filter(([, b]) => b && b.n_turns > 0);
  if (leEntries.length > 0) {
    const maxTotal = Math.max(...leEntries.map(([, b]) => b!.cost_usd));
    rows.push(dim("  by Learning Event class"));
    rows.push(
      dim("    class              turns      total   avg/turn   "),
    );
    for (const [key, b] of leEntries) {
      if (!b) continue;
      const barWidth = maxTotal > 0 ? Math.round((b.cost_usd / maxTotal) * 18) : 0;
      const bar = dim("▬".repeat(barWidth));
      const label = key === "(undeclared)" ? warn(padr(key, 16)) : padr(key, 16);
      rows.push(
        `    ${label}  ${pad(String(b.n_turns), 5)}   ${pad(money(b.cost_usd), 8)}   ${pad(money(b.avg_usd), 8)}  ${bar}`,
      );
    }
    rows.push("");
  }

  // Last 7 days
  const recent = cost.byDay.slice(-7);
  if (recent.length > 0) {
    const maxDayTotal = Math.max(...recent.map((d) => d.cost_usd));
    rows.push(dim("  last 7 days"));
    rows.push(dim("    date         turns      total"));
    for (const d of recent) {
      const barWidth = maxDayTotal > 0 ? Math.round((d.cost_usd / maxDayTotal) * 22) : 0;
      const bar = dim("▬".repeat(barWidth));
      rows.push(
        `    ${d.date}  ${pad(String(d.n_turns), 5)}   ${pad(money(d.cost_usd), 8)}  ${bar}`,
      );
    }
    rows.push("");
  }

  rows.push(
    dim(
      "  interpretation: sense_making turns cost more by design. If they aren't",
    ),
  );
  rows.push(
    dim(
      "  bending the principle curve above, they're dead money.",
    ),
  );
  return rows.join("\n");
}

function renderTopicTable(agg: Record<string, TopicMastery>): string {
  const entries = Object.entries(agg);
  if (entries.length === 0) {
    return dim(
      '  (no items have `topics:` set yet — tag items in frontmatter to enable aggregation)',
    );
  }
  entries.sort((a, b) => b[1].score - a[1].score);
  const rows: string[] = [];
  rows.push(dim("  topic              items    score   probes"));
  for (const [topic, t] of entries) {
    const barWidth = Math.round(t.score * 20);
    const bar = "▰".repeat(barWidth) + dim("▱".repeat(20 - barWidth));
    rows.push(
      `  ${padr(topic, 17)}  ${pad(String(t.n_items), 5)}   ${bar}  ${pad(t.score.toFixed(2), 5)}   ${pad(String(t.n_probes), 5)}`,
    );
  }
  return rows.join("\n");
}

function renderGaps(gaps: GapRow[]): string {
  if (gaps.length === 0) {
    return good("  (none — mastery matches SM-2, or probes haven't revealed a gap)");
  }
  const rows: string[] = [];
  rows.push(dim("  lemma                   ease   mastery   probes   severity"));
  for (const g of gaps.slice(0, 15)) {
    const severityBar = "▬".repeat(Math.round(g.severity * 20));
    rows.push(
      `  ${padr(g.lemma, 22)}  ${pad(g.ease.toFixed(2), 4)}   ${pad(g.mastery.toFixed(2), 7)}   ${pad(String(g.n_probes), 6)}   ${warn(severityBar)}`,
    );
  }
  if (gaps.length > 15) {
    rows.push(dim(`  ... and ${gaps.length - 15} more`));
  }
  return rows.join("\n");
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const vaultPath =
    process.argv[2] ?? path.join(process.env.HOME ?? ".", "LearnVault");
  const vault = new Vault(vaultPath);
  const data = buildReportData(vault, vaultPath);

  const out: string[] = [];
  out.push(renderMasthead(data));
  out.push(hr());
  out.push("");
  out.push(sectionHeading(1, "Per-KC indicators", "what's in the vault"));
  out.push("");
  out.push(renderKcBuckets(data.kcBuckets));
  out.push("");
  out.push(hr());
  out.push("");
  out.push(sectionHeading(2, "Learning Event mix", "pedagogical intent, per turn"));
  out.push("");
  out.push(renderLeMix(data.leMix));
  out.push("");
  out.push(hr());
  out.push("");
  out.push(sectionHeading(3, "Learning curves", "avg error rate by opportunity · KLI signature"));
  out.push("");
  out.push(renderCurves(data.curves));
  out.push("");
  out.push(hr());
  out.push("");
  out.push(sectionHeading(4, "Cost", "pi-ai usage, aggregated"));
  out.push("");
  out.push(renderCost(data.cost));
  out.push("");
  out.push(hr());
  out.push("");
  out.push(sectionHeading(5, "Per-topic mastery", "unweighted mean of item scores"));
  out.push("");
  out.push(renderTopicTable(data.topicMastery));
  out.push("");
  out.push(hr());
  out.push("");
  out.push(sectionHeading(6, "Probe-vs-practice gap", "high SM-2 ease, low probe mastery"));
  out.push("");
  out.push(renderGaps(data.gaps));
  out.push("");
  out.push(hr());

  // Footer notes — only warn when there's something to warn about.
  const missing = data.kcBuckets["(missing kc_type)"]?.count ?? 0;
  if (missing > 0) {
    out.push("");
    out.push(
      dim("note: ") +
        warn(`${missing} item(s) lack kc_type`) +
        dim(". Run scripts/backfill-frontmatter.ts to fix."),
    );
  }
  if ((data.leMix["(undeclared)"] ?? 0) > 0) {
    out.push(
      dim("note: ") +
        warn(`${data.leMix["(undeclared)"]} turn(s) had no le_class declared`) +
        dim(". Agent should call le.declare each turn."),
    );
  }

  console.log(out.join("\n"));
}

main();
