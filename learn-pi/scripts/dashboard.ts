// HTML dashboard generator for learn-pi.
//
//   npx tsx learn-pi/scripts/dashboard.ts ~/LearnVault [output.html]
//
// Produces a single self-contained HTML file with all data and CSS inlined
// and SVG charts rendered server-side. The only external dependency is
// Google Fonts (Fraunces + JetBrains Mono) loaded via <link>; if the user is
// offline the page falls back to Georgia and the system monospace stack.
// No JS runtime, no server, no build step. Open the file.
//
// Aesthetic direction: editorial data-journalism with terminal heritage.
// Fraunces display serif paired with JetBrains Mono for data, warm near-black
// background, one strong accent for regression signals. See docs/PRINCIPLES.md
// — this dashboard is the GUI face of the same pure data the terminal report
// renders in lib/report-data.ts.

import fs from "node:fs";
import path from "node:path";
import { Vault } from "../lib/vault.ts";
import {
  buildReportData,
  MAX_OPPORTUNITY,
  type CurvePoint,
  type ReportData,
} from "../lib/report-data.ts";

// ── Design tokens (keep in one place for easy iteration) ──────────────────

const TOKENS = {
  bg: "#0f0e0c",
  bgSubtle: "#161410",
  bgPanel: "#1a1814",
  rule: "#2a2620",
  ruleBright: "#3a352c",
  ink: "#f4f1e8",
  inkDim: "#a39b89",
  inkFaint: "#6b6455",
  accent: "#e4572e", // burnt orange — regression / attention / warnings
  accentSoft: "#a8391d",
  good: "#7a8b6f", // sage — improvement / curves bending
  goodSoft: "#5a6953",
  // KC type colors — distinct but within the warm palette
  fact: "#c9a96e", // amber
  skill: "#7a8b6f", // sage
  principle: "#d2604f", // rust
  missing: "#6b6455", // faint ink
};

// ── SVG chart primitives ──────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function kcColor(kc: string): string {
  if (kc === "fact") return TOKENS.fact;
  if (kc === "skill") return TOKENS.skill;
  if (kc === "principle") return TOKENS.principle;
  return TOKENS.missing;
}

// Learning curves chart — line per kc_type, x = opportunity index, y = error
function renderCurvesChart(curves: Record<string, CurvePoint[]>): string {
  const W = 820;
  const H = 360;
  const PAD = { top: 24, right: 96, bottom: 48, left: 56 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  if (Object.keys(curves).length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" class="chart"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${TOKENS.inkFaint}" font-family="JetBrains Mono" font-size="14">no graded opportunities yet</text></svg>`;
  }

  const xScale = (n: number) => PAD.left + ((n - 1) / (MAX_OPPORTUNITY - 1)) * plotW;
  const yScale = (err: number) => PAD.top + (1 - err) * plotH;

  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" class="chart">`);

  // Background panel
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${TOKENS.bgPanel}" rx="2"/>`);

  // Horizontal gridlines at 0.0, 0.25, 0.5, 0.75, 1.0
  for (const err of [0, 0.25, 0.5, 0.75, 1]) {
    const y = yScale(err);
    parts.push(
      `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="${TOKENS.rule}" stroke-width="1" stroke-dasharray="${err === 0 || err === 1 ? "none" : "2 4"}"/>`,
    );
    parts.push(
      `<text x="${PAD.left - 10}" y="${y + 4}" text-anchor="end" fill="${TOKENS.inkFaint}" font-family="JetBrains Mono" font-size="10">${err.toFixed(2)}</text>`,
    );
  }
  // Y-axis label
  parts.push(
    `<text x="${PAD.left - 40}" y="${PAD.top + plotH / 2}" text-anchor="middle" fill="${TOKENS.inkDim}" font-family="Fraunces" font-size="11" font-style="italic" transform="rotate(-90 ${PAD.left - 40} ${PAD.top + plotH / 2})">avg error rate</text>`,
  );

  // X-axis ticks
  for (let n = 1; n <= MAX_OPPORTUNITY; n += 1) {
    const x = xScale(n);
    parts.push(
      `<line x1="${x}" y1="${PAD.top + plotH}" x2="${x}" y2="${PAD.top + plotH + 4}" stroke="${TOKENS.ruleBright}" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${x}" y="${PAD.top + plotH + 18}" text-anchor="middle" fill="${TOKENS.inkFaint}" font-family="JetBrains Mono" font-size="10">n${n}</text>`,
    );
  }
  parts.push(
    `<text x="${PAD.left + plotW / 2}" y="${H - 8}" text-anchor="middle" fill="${TOKENS.inkDim}" font-family="Fraunces" font-size="11" font-style="italic">opportunity number →</text>`,
  );

  // Lines per kc_type
  for (const [kc, row] of Object.entries(curves)) {
    const valid = row.filter((r) => !Number.isNaN(r.avgError));
    if (valid.length === 0) continue;
    const color = kcColor(kc);
    const points = valid.map((r) => `${xScale(r.n)},${yScale(r.avgError)}`).join(" ");
    // Line
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    // Glow layer behind
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.12"/>`,
    );
    // Dots
    for (const r of valid) {
      const cx = xScale(r.n);
      const cy = yScale(r.avgError);
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="3" fill="${TOKENS.bg}" stroke="${color}" stroke-width="1.5"/>`,
      );
    }
    // End label — anchored right of the last point
    const last = valid[valid.length - 1];
    const lx = xScale(last.n) + 10;
    const ly = yScale(last.avgError) + 4;
    parts.push(
      `<text x="${lx}" y="${ly}" fill="${color}" font-family="JetBrains Mono" font-size="11" font-weight="500">${kc === "(missing kc_type)" ? "missing" : kc}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join("");
}

// Horizontal stacked bar — used for LE mix
function renderStackedBar(
  data: Array<{ label: string; value: number; color: string; warn?: boolean }>,
): string {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (total === 0) return `<div class="muted">no turns logged yet</div>`;

  const segments: string[] = [];
  let left = 0;
  for (const d of data) {
    if (d.value === 0) continue;
    const pct = (d.value / total) * 100;
    segments.push(
      `<div class="stack-seg" style="width:${pct}%;background:${d.color}" title="${escapeHtml(d.label)}: ${d.value} (${pct.toFixed(0)}%)"></div>`,
    );
    left += pct;
  }
  const legend = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const pct = (d.value / total) * 100;
      const cls = d.warn ? "legend-row warn" : "legend-row";
      return `
        <div class="${cls}">
          <span class="swatch" style="background:${d.color}"></span>
          <span class="legend-label">${escapeHtml(d.label)}</span>
          <span class="legend-val">${d.value}</span>
          <span class="legend-pct">${pct.toFixed(0)}%</span>
        </div>`;
    })
    .join("");
  return `
    <div class="stack-bar">${segments.join("")}</div>
    <div class="stack-legend">${legend}</div>
  `;
}

// Cost-over-time bar chart
function renderCostSparkline(
  days: Array<{ date: string; cost_usd: number; n_turns: number }>,
): string {
  if (days.length === 0) return `<div class="muted">no dated turns</div>`;
  const W = 560;
  const H = 120;
  const PAD = { top: 12, right: 12, bottom: 28, left: 12 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(...days.map((d) => d.cost_usd), 0.0001);
  const barW = Math.max(4, (plotW / days.length) - 6);
  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${W} ${H}" class="chart-sm">`);
  days.forEach((d, i) => {
    const barH = (d.cost_usd / max) * plotH;
    const x = PAD.left + i * (barW + 6);
    const y = PAD.top + (plotH - barH);
    parts.push(
      `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${TOKENS.accent}" opacity="0.85" rx="1"/>`,
    );
    // Date label (show short MM-DD)
    const short = d.date.slice(5);
    parts.push(
      `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" fill="${TOKENS.inkFaint}" font-family="JetBrains Mono" font-size="9">${short}</text>`,
    );
  });
  parts.push(`</svg>`);
  return parts.join("");
}

// ── HTML template ─────────────────────────────────────────────────────────

function renderHtml(data: ReportData): string {
  const generated = data.generatedAt.slice(0, 19).replace("T", " ");
  const missing = data.kcBuckets["(missing kc_type)"]?.count ?? 0;
  const undeclared = data.leMix["(undeclared)"] ?? 0;

  const kcBucketRows = Object.entries(data.kcBuckets)
    .map(([key, b]) => {
      const isMissing = key === "(missing kc_type)";
      const labelCls = isMissing ? "kc-label warn" : "kc-label";
      const label = isMissing ? "missing" : key;
      return `
        <tr>
          <td class="${labelCls}"><span class="dot" style="background:${kcColor(key)}"></span>${escapeHtml(label)}</td>
          <td class="num">${b.count}</td>
          <td class="num">${b.avgEase.toFixed(2)}</td>
          <td class="num">${b.avgMastery.toFixed(2)}</td>
          <td class="num">${b.probedCount}</td>
        </tr>`;
    })
    .join("");

  const leMixData = [
    { label: "memory_fluency", value: data.leMix.memory_fluency ?? 0, color: TOKENS.fact },
    { label: "induction", value: data.leMix.induction ?? 0, color: TOKENS.skill },
    { label: "sense_making", value: data.leMix.sense_making ?? 0, color: TOKENS.principle },
    { label: "(undeclared)", value: data.leMix["(undeclared)"] ?? 0, color: TOKENS.accent, warn: true },
  ];

  // KPI strip
  const totalTurns = data.turns.length;
  const totalItems = data.items.length;
  const mastered = data.cost.masteredCount;
  const costTotal = data.cost.total.cost_usd;
  const cpmk = data.cost.costPerMasteredKc;
  const cpmkDisplay =
    mastered > 0
      ? `$${cpmk.toFixed(4)}`
      : `<span class="warn">n/a</span>`;

  // LE class cost breakdown
  const leClassCostRows = (["memory_fluency", "induction", "sense_making", "(undeclared)"] as const)
    .map((k) => {
      const b = data.cost.byLeClass[k];
      if (!b || b.n_turns === 0) return "";
      const max = Math.max(
        ...Object.values(data.cost.byLeClass).map((x) => x?.cost_usd ?? 0),
      );
      const barPct = max > 0 ? (b.cost_usd / max) * 100 : 0;
      const isUndec = k === "(undeclared)";
      const label = isUndec ? "undeclared" : k;
      return `
        <tr>
          <td class="${isUndec ? "kc-label warn" : "kc-label"}">${escapeHtml(label)}</td>
          <td class="num">${b.n_turns}</td>
          <td class="num">$${b.cost_usd.toFixed(4)}</td>
          <td class="num">$${b.avg_usd.toFixed(4)}</td>
          <td class="barcell"><div class="hbar" style="width:${barPct}%"></div></td>
        </tr>`;
    })
    .filter(Boolean)
    .join("");

  // Per-topic rows
  const topicEntries = Object.entries(data.topicMastery).sort(
    (a, b) => b[1].score - a[1].score,
  );
  const topicRows = topicEntries
    .map(([topic, t]) => {
      const scorePct = t.score * 100;
      return `
        <tr>
          <td class="topic-label">${escapeHtml(topic)}</td>
          <td class="num">${t.n_items}</td>
          <td class="scorecell"><div class="scorebar"><div class="scorefill" style="width:${scorePct}%"></div></div><span class="scorenum">${t.score.toFixed(2)}</span></td>
          <td class="num">${t.n_probes}</td>
        </tr>`;
    })
    .join("");

  // Gap rows
  const maxSeverity = data.gaps.length > 0 ? Math.max(...data.gaps.map((g) => g.severity)) : 1;
  const gapRows = data.gaps
    .slice(0, 20)
    .map((g) => {
      const sevPct = (g.severity / maxSeverity) * 100;
      return `
        <tr>
          <td class="gap-label">${escapeHtml(g.lemma)}</td>
          <td class="num">${g.ease.toFixed(2)}</td>
          <td class="num">${g.mastery.toFixed(2)}</td>
          <td class="num">${g.n_probes}</td>
          <td class="severitycell"><div class="severitybar" style="width:${sevPct}%"></div></td>
        </tr>`;
    })
    .join("");

  const notes: string[] = [];
  if (missing > 0) {
    notes.push(
      `<div class="note warn">${missing} item(s) lack <code>kc_type</code>. Run <code>scripts/backfill-frontmatter.ts</code> to fix.</div>`,
    );
  }
  if (undeclared > 0) {
    notes.push(
      `<div class="note warn">${undeclared} turn(s) had no <code>le_class</code> declared. Agent should call <code>le.declare</code> each turn.</div>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>learn-pi report · ${escapeHtml(path.basename(data.vaultPath))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: ${TOKENS.bg};
    --bg-subtle: ${TOKENS.bgSubtle};
    --bg-panel: ${TOKENS.bgPanel};
    --rule: ${TOKENS.rule};
    --rule-bright: ${TOKENS.ruleBright};
    --ink: ${TOKENS.ink};
    --ink-dim: ${TOKENS.inkDim};
    --ink-faint: ${TOKENS.inkFaint};
    --accent: ${TOKENS.accent};
    --accent-soft: ${TOKENS.accentSoft};
    --good: ${TOKENS.good};
    --good-soft: ${TOKENS.goodSoft};
    --fact: ${TOKENS.fact};
    --skill: ${TOKENS.skill};
    --principle: ${TOKENS.principle};
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: "Fraunces", Georgia, serif;
    font-optical-sizing: auto;
    font-feature-settings: "ss01", "ss02";
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  body {
    background-image:
      radial-gradient(ellipse at top left, rgba(228, 87, 46, 0.03), transparent 50%),
      radial-gradient(ellipse at bottom right, rgba(122, 139, 111, 0.03), transparent 50%);
    background-attachment: fixed;
    min-height: 100vh;
  }
  /* Grain overlay — subtle noise to avoid flat darkness */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.035;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    mix-blend-mode: overlay;
    z-index: 1;
  }
  .wrap {
    max-width: 1200px;
    margin: 0 auto;
    padding: 48px 56px 96px;
    position: relative;
    z-index: 2;
  }

  /* ── Masthead ── */
  .masthead {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 1px solid var(--rule-bright);
    padding-bottom: 20px;
    margin-bottom: 40px;
    animation: fadeSlide 0.6s ease-out both;
  }
  .masthead h1 {
    font-family: "Fraunces", serif;
    font-size: 48px;
    font-weight: 500;
    font-optical-sizing: auto;
    font-variation-settings: "opsz" 144, "SOFT" 0;
    line-height: 1;
    letter-spacing: -0.02em;
    margin: 0 0 10px 0;
  }
  .masthead .subtitle {
    font-family: "Fraunces", serif;
    font-style: italic;
    font-size: 17px;
    color: var(--ink-dim);
    letter-spacing: 0.01em;
    margin: 0;
  }
  .meta {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--ink-faint);
    text-align: right;
    line-height: 1.8;
  }
  .meta .vault-path { color: var(--ink-dim); word-break: break-all; max-width: 420px; }

  /* ── KPI strip ── */
  .kpis {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1px;
    background: var(--rule);
    border: 1px solid var(--rule);
    margin-bottom: 56px;
    animation: fadeSlide 0.6s ease-out 0.1s both;
  }
  .kpi {
    background: var(--bg);
    padding: 20px 24px;
  }
  .kpi-label {
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-bottom: 10px;
  }
  .kpi-value {
    font-family: "Fraunces", serif;
    font-size: 32px;
    font-weight: 500;
    font-variation-settings: "opsz" 72;
    line-height: 1;
    font-feature-settings: "tnum";
    color: var(--ink);
  }
  .kpi-value .unit {
    font-size: 14px;
    color: var(--ink-dim);
    font-weight: 400;
    margin-left: 4px;
  }
  .kpi.highlight .kpi-value { color: var(--accent); }
  .kpi .warn { color: var(--accent); }

  /* ── Sections ── */
  .section {
    margin-bottom: 72px;
    animation: fadeSlide 0.6s ease-out both;
  }
  .section:nth-of-type(3) { animation-delay: 0.15s; }
  .section:nth-of-type(4) { animation-delay: 0.2s; }
  .section:nth-of-type(5) { animation-delay: 0.25s; }
  .section:nth-of-type(6) { animation-delay: 0.3s; }
  .section:nth-of-type(7) { animation-delay: 0.35s; }

  .section-head {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }
  .section-num {
    font-family: "JetBrains Mono", monospace;
    font-size: 11px;
    color: var(--ink-faint);
    letter-spacing: 0.1em;
  }
  .section-title {
    font-family: "Fraunces", serif;
    font-size: 26px;
    font-weight: 500;
    font-optical-sizing: auto;
    font-variation-settings: "opsz" 72;
    letter-spacing: -0.01em;
    margin: 0;
  }
  .section-kicker {
    font-family: "Fraunces", serif;
    font-style: italic;
    font-size: 15px;
    color: var(--ink-dim);
    margin-left: auto;
  }

  /* ── Data table ── */
  table.data {
    width: 100%;
    border-collapse: collapse;
    font-family: "JetBrains Mono", monospace;
    font-size: 13px;
    font-feature-settings: "tnum";
  }
  table.data th {
    text-align: left;
    font-weight: 500;
    color: var(--ink-faint);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.1em;
    padding: 8px 12px;
    border-bottom: 1px solid var(--rule);
  }
  table.data th.num { text-align: right; }
  table.data td {
    padding: 12px;
    border-bottom: 1px solid var(--rule);
    color: var(--ink);
  }
  table.data td.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  table.data tr:hover td {
    background: var(--bg-subtle);
  }
  .kc-label {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
  }
  .kc-label.warn { color: var(--accent); }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .warn { color: var(--accent); }
  .muted { color: var(--ink-faint); font-style: italic; font-family: "Fraunces"; }

  /* ── Chart container ── */
  .chart-panel {
    background: var(--bg-panel);
    border: 1px solid var(--rule);
    padding: 24px;
    overflow: visible;
  }
  .chart { width: 100%; height: auto; display: block; }
  .chart-sm { width: 100%; height: auto; display: block; }
  .chart-caption {
    font-family: "Fraunces", serif;
    font-style: italic;
    font-size: 14px;
    color: var(--ink-dim);
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--rule);
  }
  .chart-caption .up { color: var(--good); font-style: normal; font-weight: 500; }
  .chart-caption .down { color: var(--accent); font-style: normal; font-weight: 500; }

  /* ── Stacked bar (LE mix) ── */
  .stack-bar {
    display: flex;
    height: 32px;
    border: 1px solid var(--rule);
    overflow: hidden;
    margin-bottom: 20px;
  }
  .stack-seg {
    height: 100%;
    transition: opacity 0.2s;
  }
  .stack-seg:hover { opacity: 0.75; cursor: help; }
  .stack-legend {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    color: var(--ink-dim);
  }
  .legend-row.warn .legend-label { color: var(--accent); }
  .swatch { width: 12px; height: 12px; display: inline-block; }
  .legend-label { flex: 1; }
  .legend-val { font-variant-numeric: tabular-nums; color: var(--ink); }
  .legend-pct { color: var(--ink-faint); font-size: 11px; }

  /* ── Two-column ── */
  .two-col {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 48px;
  }
  @media (max-width: 900px) {
    .two-col { grid-template-columns: 1fr; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .masthead { flex-direction: column; align-items: flex-start; gap: 16px; }
    .meta { text-align: left; }
  }

  /* ── Inline bars (LE cost, topic mastery, gap severity) ── */
  .barcell { width: 120px; }
  .hbar {
    height: 6px;
    background: var(--accent);
    border-radius: 1px;
  }
  .scorecell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 200px;
  }
  .scorebar {
    flex: 1;
    height: 6px;
    background: var(--rule);
    overflow: hidden;
  }
  .scorefill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent) 0%, var(--accent) 70%, var(--good) 100%);
  }
  .scorenum { font-variant-numeric: tabular-nums; color: var(--ink-dim); font-size: 12px; min-width: 32px; text-align: right; }
  .severitycell { width: 140px; }
  .severitybar {
    height: 6px;
    background: var(--accent);
    border-radius: 1px;
  }
  .topic-label { color: var(--ink); }
  .gap-label { color: var(--ink); font-weight: 500; }

  /* ── Notes ── */
  .notes { margin-top: 48px; }
  .note {
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    padding: 12px 16px;
    border-left: 2px solid var(--accent);
    background: rgba(228, 87, 46, 0.04);
    color: var(--ink-dim);
    margin-bottom: 8px;
  }
  .note code {
    background: var(--bg-subtle);
    padding: 1px 6px;
    color: var(--ink);
    font-size: 11px;
  }

  /* ── Footer ── */
  .footer {
    margin-top: 96px;
    padding-top: 24px;
    border-top: 1px solid var(--rule);
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-family: "Fraunces", serif;
    font-style: italic;
    font-size: 14px;
    color: var(--ink-faint);
  }
  .footer .principles {
    font-style: normal;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-faint);
    text-align: right;
    line-height: 1.9;
  }
  .footer .principles span { display: block; }

  @keyframes fadeSlide {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
</head>
<body>
  <div class="wrap">

    <!-- Masthead -->
    <header class="masthead">
      <div>
        <h1>Learn-Pi Report</h1>
        <p class="subtitle">A measurement-first view of what the tutor actually taught.</p>
      </div>
      <div class="meta">
        <div class="vault-path">${escapeHtml(data.vaultPath)}</div>
        <div>lang=${escapeHtml(data.lang)} · ${data.items.length} items · ${data.turns.length} turns</div>
        <div>generated ${generated}</div>
      </div>
    </header>

    <!-- KPI strip -->
    <section class="kpis">
      <div class="kpi">
        <div class="kpi-label">items</div>
        <div class="kpi-value">${totalItems}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">turns</div>
        <div class="kpi-value">${totalTurns}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">mastered</div>
        <div class="kpi-value">${mastered}<span class="unit">/${totalItems}</span></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">total spend</div>
        <div class="kpi-value">$${costTotal.toFixed(2)}</div>
      </div>
      <div class="kpi highlight">
        <div class="kpi-label">cost / mastered kc</div>
        <div class="kpi-value">${cpmkDisplay}</div>
      </div>
    </section>

    <!-- §1 Per-KC indicators -->
    <section class="section">
      <div class="section-head">
        <span class="section-num">§01</span>
        <h2 class="section-title">Per-KC indicators</h2>
        <span class="section-kicker">what's in the vault</span>
      </div>
      <table class="data">
        <thead>
          <tr>
            <th>kc_type</th>
            <th class="num">count</th>
            <th class="num">avg ease</th>
            <th class="num">avg mastery</th>
            <th class="num">probed</th>
          </tr>
        </thead>
        <tbody>${kcBucketRows}</tbody>
      </table>
    </section>

    <!-- §2 Learning curves (hero) -->
    <section class="section">
      <div class="section-head">
        <span class="section-num">§02</span>
        <h2 class="section-title">Learning curves</h2>
        <span class="section-kicker">avg error rate by opportunity — KLI's signature measurement</span>
      </div>
      <div class="chart-panel">
        ${renderCurvesChart(data.curves)}
        <div class="chart-caption">
          A <span class="up">steep downward slope</span> means the Learning Event class is matched to the Knowledge Component type.
          A <span class="down">flat curve</span> is the diagnostic: the pedagogy is wrong for this KC, no amount of repetition will fix it.
        </div>
      </div>
    </section>

    <!-- §3 LE mix + §4 Cost breakdown (two-col) -->
    <section class="section">
      <div class="section-head">
        <span class="section-num">§03</span>
        <h2 class="section-title">Pedagogical intent</h2>
        <span class="section-kicker">what kind of turn did the agent declare it was running</span>
      </div>
      <div class="two-col">
        <div>
          ${renderStackedBar(leMixData)}
        </div>
        <div class="muted" style="font-size: 15px; line-height: 1.6;">
          Every turn must declare its Learning Event class via <code style="font-family: JetBrains Mono; background: var(--bg-subtle); color: var(--ink); padding: 2px 6px; font-size: 12px;">le.declare</code>.
          Turns logged as <span class="warn">undeclared</span> are a signal the agent prompt isn't landing — they should trend toward zero as the directive stabilizes.
        </div>
      </div>
    </section>

    <!-- §4 Cost -->
    <section class="section">
      <div class="section-head">
        <span class="section-num">§04</span>
        <h2 class="section-title">Cost</h2>
        <span class="section-kicker">pi-ai usage, aggregated</span>
      </div>
      ${data.cost.hasUsage ? `
      <div class="two-col">
        <div>
          <table class="data">
            <thead>
              <tr>
                <th>le_class</th>
                <th class="num">turns</th>
                <th class="num">total</th>
                <th class="num">avg / turn</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${leClassCostRows}</tbody>
          </table>
        </div>
        <div>
          <div class="chart-panel">
            ${renderCostSparkline(data.cost.byDay.slice(-14))}
            <div class="chart-caption" style="margin-top: 12px; padding-top: 12px; font-size: 12px;">spend per day · last ${Math.min(14, data.cost.byDay.length)} days</div>
          </div>
        </div>
      </div>
      ${mastered === 0 ? `
        <div class="note warn" style="margin-top: 24px;">
          <strong>$${costTotal.toFixed(4)} spent, 0 items mastered.</strong> Zero in the headline means <em>no probes yet</em>, not <em>free</em>.
          Run <code>mastery.probe</code> on some high-ease lemmas to start measuring transfer.
        </div>` : ""}
      ` : `<div class="muted">No usage data recorded yet. Turns either pre-date cost tracking, or the <code style="font-family: JetBrains Mono; background: var(--bg-subtle); color: var(--ink); padding: 2px 6px;">message_end</code> event hasn't fired.</div>`}
    </section>

    <!-- §5 Per-topic mastery -->
    <section class="section">
      <div class="section-head">
        <span class="section-num">§05</span>
        <h2 class="section-title">Per-topic mastery</h2>
        <span class="section-kicker">unweighted mean of item scores, grouped by frontmatter topic</span>
      </div>
      ${topicEntries.length > 0 ? `
      <table class="data">
        <thead>
          <tr>
            <th>topic</th>
            <th class="num">items</th>
            <th>mastery</th>
            <th class="num">probes</th>
          </tr>
        </thead>
        <tbody>${topicRows}</tbody>
      </table>` : `<div class="muted">No items have <code style="font-family: JetBrains Mono; background: var(--bg-subtle); color: var(--ink); padding: 2px 6px;">topics:</code> set yet. Tag items in vocab/grammar frontmatter to enable per-topic aggregation.</div>`}
    </section>

    <!-- §6 Probe-vs-practice gap -->
    <section class="section">
      <div class="section-head">
        <span class="section-num">§06</span>
        <h2 class="section-title">Probe-vs-practice gap</h2>
        <span class="section-kicker">high SM-2 ease, low probe mastery — scaffolds hiding shallow learning</span>
      </div>
      ${data.gaps.length > 0 ? `
      <table class="data">
        <thead>
          <tr>
            <th>lemma</th>
            <th class="num">ease</th>
            <th class="num">mastery</th>
            <th class="num">probes</th>
            <th>severity</th>
          </tr>
        </thead>
        <tbody>${gapRows}</tbody>
      </table>
      ${data.gaps.length > 20 ? `<div class="muted" style="margin-top: 16px; font-size: 13px;">... and ${data.gaps.length - 20} more</div>` : ""}` : `<div class="muted">No gap detected. Either mastery matches SM-2 ease, or probes haven't surfaced a divergence yet.</div>`}
    </section>

    ${notes.length > 0 ? `<div class="notes">${notes.join("")}</div>` : ""}

    <footer class="footer">
      <div>A measurement-first tutor. Every number here is supposed to be able to go down.</div>
      <div class="principles">
        <span>§1 · measure without scaffolds</span>
        <span>§2 · match moves to KC types</span>
        <span>§3 · vault over database</span>
        <span>§4 · difficulty ⊥ pedagogy</span>
        <span>§5 · every metric falsifiable</span>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  const vaultPath =
    process.argv[2] ?? path.join(process.env.HOME ?? ".", "LearnVault");
  const outputPath =
    process.argv[3] ??
    path.join(vaultPath, "report.html");

  const vault = new Vault(vaultPath);
  const data = buildReportData(vault, vaultPath);
  const html = renderHtml(data);
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(
    `learn-pi dashboard written to ${outputPath}  (${(html.length / 1024).toFixed(1)} KB, ${data.items.length} items, ${data.turns.length} turns)`,
  );
}

main();
