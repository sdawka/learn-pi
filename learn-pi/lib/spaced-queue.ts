// GIFT: Pedagogical Module — due-item selection + probe selection
//
// Regenerates queue/<lang>-due.md from SM-2 frontmatter in vocab/ and grammar/.
//
// Emits two lanes:
//   - `lane: "review"` — SM-2 due items (memory_fluency LE)
//   - `lane: "probe"`  — mastery-stale items for unscaffolded probes
//     (assessment distinct from practice; see `lib/mastery.ts`)

import { Vault } from "./vault.ts";
import {
  defaultMastery,
  isMasteryStale,
  type MasteryState,
} from "./mastery.ts";

export type DueLane = "review" | "probe";

export type DueItem = {
  kind: "vocab" | "grammar";
  lane: DueLane;
  lemma: string;
  next_review: string;
  ease: number;
  path: string;
};

const SOFT_CAP = 20;
const PROBE_CAP = 2;

type Sm2Frontmatter = {
  lemma?: string;
  kc_type?: "fact" | "skill" | "principle";
  sm2?: { ease?: number; interval?: number; next_review?: string };
  mastery?: MasteryState;
};

type Scanned = {
  kind: "vocab" | "grammar";
  lemma: string;
  path: string;
  ease: number;
  next_review: string;
  mastery: MasteryState;
  dueNow: boolean;
};

function scanDir(
  vault: Vault,
  dir: string,
  kind: "vocab" | "grammar",
): Scanned[] {
  const now = Date.now();
  const files = vault.list(dir).filter((p) => p.endsWith(".md"));
  const out: Scanned[] = [];
  for (const rel of files) {
    const { data } = vault.readFrontmatter<Sm2Frontmatter>(rel);
    const sm2 = data.sm2;
    if (!sm2?.next_review) continue;
    const due = Date.parse(sm2.next_review);
    if (Number.isNaN(due)) continue;
    out.push({
      kind,
      lemma: data.lemma ?? rel.split("/").pop()!.replace(/\.md$/, ""),
      path: rel,
      ease: sm2.ease ?? 2.5,
      next_review: sm2.next_review,
      mastery: data.mastery ?? defaultMastery(),
      dueNow: due <= now,
    });
  }
  return out;
}

export async function regenerateDueQueue(
  vault: Vault,
  lang: string,
): Promise<DueItem[]> {
  const scanned = [
    ...scanDir(vault, `vocab/${lang}`, "vocab"),
    ...scanDir(vault, `grammar/${lang}`, "grammar"),
  ];

  const review: DueItem[] = scanned
    .filter((s) => s.dueNow)
    .sort((a, b) => Date.parse(a.next_review) - Date.parse(b.next_review))
    .slice(0, SOFT_CAP)
    .map((s) => ({
      kind: s.kind,
      lane: "review",
      lemma: s.lemma,
      next_review: s.next_review,
      ease: s.ease,
      path: s.path,
    }));

  // Probe lane: items that look fluent on SM-2 but haven't been probed, or
  // whose mastery has meaningfully drifted below the SM-2 expectation.
  const reviewPaths = new Set(review.map((r) => r.path));
  const probe: DueItem[] = scanned
    .filter((s) => !reviewPaths.has(s.path) && isMasteryStale(s.mastery, s.ease))
    .sort((a, b) => {
      // Prefer never-probed first, then larger gaps.
      if (a.mastery.n_probes !== b.mastery.n_probes) {
        return a.mastery.n_probes - b.mastery.n_probes;
      }
      return a.mastery.score - b.mastery.score;
    })
    .slice(0, PROBE_CAP)
    .map((s) => ({
      kind: s.kind,
      lane: "probe",
      lemma: s.lemma,
      next_review: s.next_review,
      ease: s.ease,
      path: s.path,
    }));

  const all = [...review, ...probe];

  const body = [
    "",
    "## review (memory_fluency)",
    ...review
      .filter((i) => i.kind === "vocab")
      .map((i) => `- vocab: ${i.lemma} — due ${i.next_review}`),
    ...review
      .filter((i) => i.kind === "grammar")
      .map((i) => `- grammar: ${i.lemma} — due ${i.next_review}`),
    "",
    "## probe (unscaffolded mastery check)",
    ...probe.map((i) => `- ${i.kind}: ${i.lemma} — ease ${i.ease.toFixed(2)}`),
    "",
  ].join("\n");

  vault.writeFrontmatter(
    `queue/${lang}-due.md`,
    {
      generated_at: new Date().toISOString(),
      count: all.length,
      review_count: review.length,
      probe_count: probe.length,
      lang,
    },
    body,
  );
  return all;
}
