// One-shot migration: backfill kc_type and mastery on legacy vault items.
//
//   npx tsx learn-pi/scripts/backfill-frontmatter.ts --vault ~/LearnVault [--lang es] [--dry-run]
//
// Defaults:
//   - vocab/<lang>/*.md without kc_type     → kc_type: fact
//   - grammar/<lang>/*.md without kc_type   → kc_type: principle
//   - any item without mastery              → mastery: defaultMastery()
//   - topics:                                → never inferred (user must set)
//
// Runs in WRITE mode by default. Pass --dry-run for a preview.

import path from "node:path";
import { Vault } from "../lib/vault.ts";
import { defaultMastery, type MasteryState } from "../lib/mastery.ts";

type ItemFrontmatter = {
  lemma?: string;
  lang?: string;
  kc_type?: "fact" | "skill" | "principle";
  topics?: string[];
  sm2?: Record<string, unknown>;
  mastery?: MasteryState;
  [key: string]: unknown;
};

type Args = { vault: string; lang?: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  let vault = path.join(process.env.HOME ?? ".", "LearnVault");
  let lang: string | undefined;
  let dryRun = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--vault") vault = argv[++i];
    else if (a === "--lang") lang = argv[++i];
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: backfill-frontmatter.ts --vault <path> [--lang <code>] [--dry-run]",
      );
      process.exit(0);
    }
  }
  return { vault, lang, dryRun };
}

function detectLang(vault: Vault, override?: string): string {
  if (override) return override;
  if (vault.exists("profile.md")) {
    const { data } = vault.readFrontmatter<{ target_langs?: string[] }>(
      "profile.md",
    );
    if (data.target_langs?.[0]) return data.target_langs[0];
  }
  return "es";
}

type Diff = { rel: string; added: string[] };

function planForDir(
  vault: Vault,
  dir: string,
  defaultKcType: "fact" | "principle",
): { diffs: Diff[]; apply: () => void } {
  const diffs: Diff[] = [];
  const writes: Array<() => void> = [];
  const files = vault.list(dir).filter((f) => f.endsWith(".md"));
  for (const rel of files) {
    const { data, body } = vault.readFrontmatter<ItemFrontmatter>(rel);
    const added: string[] = [];
    const next: ItemFrontmatter = { ...data };
    if (!next.kc_type) {
      next.kc_type = defaultKcType;
      added.push(`kc_type: ${defaultKcType}`);
    }
    if (!next.mastery) {
      next.mastery = defaultMastery();
      added.push("mastery: defaults");
    }
    if (added.length > 0) {
      diffs.push({ rel, added });
      writes.push(() => vault.writeFrontmatter(rel, next, body));
    }
  }
  return {
    diffs,
    apply: () => {
      for (const w of writes) w();
    },
  };
}

function main(): void {
  const args = parseArgs(process.argv);
  const vault = new Vault(args.vault);
  const lang = detectLang(vault, args.lang);

  const vocabPlan = planForDir(vault, `vocab/${lang}`, "fact");
  const grammarPlan = planForDir(vault, `grammar/${lang}`, "principle");
  const allDiffs = [...vocabPlan.diffs, ...grammarPlan.diffs];

  console.log(
    `backfill — vault=${args.vault} lang=${lang} mode=${args.dryRun ? "dry-run" : "WRITE"}`,
  );
  console.log(
    `vocab files: ${vault.list(`vocab/${lang}`).filter((f) => f.endsWith(".md")).length} (${vocabPlan.diffs.length} need changes)`,
  );
  console.log(
    `grammar files: ${vault.list(`grammar/${lang}`).filter((f) => f.endsWith(".md")).length} (${grammarPlan.diffs.length} need changes)`,
  );

  if (allDiffs.length === 0) {
    console.log("nothing to backfill — all items already have kc_type and mastery");
    return;
  }

  console.log("");
  console.log("planned changes:");
  for (const d of allDiffs) {
    console.log(`  ${d.rel}`);
    for (const a of d.added) console.log(`    + ${a}`);
  }

  if (args.dryRun) {
    console.log("");
    console.log("(dry-run — no files written. re-run without --dry-run to apply.)");
    return;
  }

  vocabPlan.apply();
  grammarPlan.apply();
  console.log("");
  console.log(`wrote ${allDiffs.length} file(s).`);
}

main();
