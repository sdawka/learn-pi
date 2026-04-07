// Regenerates queue/<lang>-due.md from SM-2 frontmatter in vocab/ and grammar/.

import { Vault } from "./vault.ts";

export type DueItem = {
  kind: "vocab" | "grammar";
  lemma: string;
  next_review: string;
  ease: number;
  path: string;
};

const SOFT_CAP = 20;

type Sm2Frontmatter = {
  lemma?: string;
  sm2?: { ease?: number; interval?: number; next_review?: string };
};

function scanDir(vault: Vault, dir: string, kind: "vocab" | "grammar"): DueItem[] {
  const now = Date.now();
  const files = vault.list(dir).filter((p) => p.endsWith(".md"));
  const out: DueItem[] = [];
  for (const rel of files) {
    const { data } = vault.readFrontmatter<Sm2Frontmatter>(rel);
    const sm2 = data.sm2;
    if (!sm2?.next_review) continue;
    const due = Date.parse(sm2.next_review);
    if (Number.isNaN(due) || due > now) continue;
    out.push({
      kind,
      lemma: data.lemma ?? rel.split("/").pop()!.replace(/\.md$/, ""),
      next_review: sm2.next_review,
      ease: sm2.ease ?? 2.5,
      path: rel,
    });
  }
  return out;
}

export async function regenerateDueQueue(
  vault: Vault,
  lang: string,
): Promise<DueItem[]> {
  const vocab = scanDir(vault, `vocab/${lang}`, "vocab");
  const grammar = scanDir(vault, `grammar/${lang}`, "grammar");
  const all = [...vocab, ...grammar]
    .sort((a, b) => Date.parse(a.next_review) - Date.parse(b.next_review))
    .slice(0, SOFT_CAP);

  const body = [
    "",
    "## vocab",
    ...all.filter((i) => i.kind === "vocab").map((i) => `- ${i.lemma} — due ${i.next_review}`),
    "",
    "## grammar",
    ...all.filter((i) => i.kind === "grammar").map((i) => `- ${i.lemma} — due ${i.next_review}`),
    "",
  ].join("\n");

  vault.writeFrontmatter(
    `queue/${lang}-due.md`,
    { generated_at: new Date().toISOString(), count: all.length, lang },
    body,
  );
  return all;
}
