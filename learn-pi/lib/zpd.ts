// ZPD state: rung + subscore, stored as YAML frontmatter in zpd/<lang>.md.

import { Vault } from "./vault.ts";

export const RUNGS = ["L0", "L1", "L2", "L3", "L4"] as const;
export type Rung = typeof RUNGS[number];

export type ZpdState = {
  lang: string;
  rung: Rung;
  subscore: number;
  updated_at: string;
  per_topic: Record<string, { rung: Rung; subscore: number }>;
};

function defaultState(lang: string): ZpdState {
  return {
    lang,
    rung: "L1",
    subscore: 0.3,
    updated_at: new Date().toISOString(),
    per_topic: {},
  };
}

export function getZpd(vault: Vault, lang: string): ZpdState {
  const rel = `zpd/${lang}.md`;
  if (!vault.exists(rel)) return defaultState(lang);
  const { data } = vault.readFrontmatter<Partial<ZpdState>>(rel);
  return { ...defaultState(lang), ...data } as ZpdState;
}

export function adjustZpd(
  vault: Vault,
  lang: string,
  delta: number,
  reason: string,
): ZpdState {
  const rel = `zpd/${lang}.md`;
  const prior = getZpd(vault, lang);
  let idx = RUNGS.indexOf(prior.rung);
  let sub = prior.subscore + delta;

  while (sub > 1 && idx < RUNGS.length - 1) { idx += 1; sub -= 0.8; }
  while (sub < 0 && idx > 0)                 { idx -= 1; sub += 0.6; }
  sub = Math.max(0, Math.min(1, sub));

  const next: ZpdState = {
    ...prior,
    rung: RUNGS[idx],
    subscore: Math.round(sub * 100) / 100,
    updated_at: new Date().toISOString(),
  };

  // Preserve existing body (rung legend + change log) and append a log line.
  let body = "";
  if (vault.exists(rel)) {
    const { body: prevBody } = vault.readFrontmatter(rel);
    body = prevBody;
    if (!body.includes("## change log")) body += "\n\n## change log\n";
  } else {
    body = "\n## change log\n";
  }
  const sign = delta >= 0 ? "+" : "";
  body += `- ${next.updated_at}: ${sign}${delta} → ${next.rung}@${next.subscore} (${reason})\n`;

  vault.writeFrontmatter(rel, next, body);
  return next;
}
