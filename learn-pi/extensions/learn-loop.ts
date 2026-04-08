// GIFT: Pedagogical Module (turn planner) + Sensor Module (signal detection on user turns)
//
// learn-loop.ts — main pi-mono lifecycle extension for learn-pi.
//
// Pi-mono loads this via jiti (no build step). Default export is a function
// that receives `pi: ExtensionAPI`. Lifecycle hooks are subscribed via
// `pi.on("event", handler)`. Tools are registered via `pi.registerTool(...)`
// with TypeBox schemas.
//
// Events used: session_start, before_agent_start, input, agent_end.
//
// KLI overlay: turns are tagged with an `le_class` (memory_fluency / induction
// / sense_making). New vocab entries default to `kc_type: "fact"`. See
// `docs/plan.md` "Learning science frame" for the full taxonomy.

import path from "node:path";
import { simpleGit } from "simple-git";
import { Type } from "@sinclair/typebox";
import { Vault } from "../lib/vault.ts";
import { ConceptsDb } from "../lib/concepts-db.ts";
import { regenerateDueQueue } from "../lib/spaced-queue.ts";
import { getZpd, adjustZpd } from "../lib/zpd.ts";
import { initSm2, gradeSm2, type Sm2State } from "../lib/sm2.ts";
import {
  defaultMastery,
  gradeProbe,
  type MasteryState,
} from "../lib/mastery.ts";

// --- minimal ambient types for the pi-mono API we use ---------------------
// We code against the documented shape; jiti resolves the real types at
// runtime. Keep this block the only speculative surface.
type ExtensionAPI = {
  on(event: string, handler: (event: any, ctx: any) => any): void;
  registerTool(tool: {
    name: string;
    label: string;
    description: string;
    parameters: any;
    execute(
      toolCallId: string,
      params: any,
      signal: AbortSignal,
      onUpdate: (u: unknown) => void,
      ctx: any,
    ): Promise<{ content: Array<{ type: "text"; text: string }>; details?: any }>;
  }): void;
  registerCommand(
    name: string,
    spec: { description: string; handler: (args: string, ctx: any) => any },
  ): void;
  appendEntry(type: string, data: any): void;
};
// --------------------------------------------------------------------------

type LeClass = "memory_fluency" | "induction" | "sense_making";
type KcType = "fact" | "skill" | "principle";

// Per-turn opportunity log entry — see plan §"Shared data contract".
// Stream A (this file) is the producer; Stream B (learning-report.ts)
// duplicates this type and must stay in sync.
type Opportunity = {
  lemma: string;
  kind: "vocab" | "grammar";
  kc_type: KcType | null;
  topic: string | null;
  grade: 0 | 1 | 2 | 3 | 4 | 5 | null;
  probe: boolean;
  mastery_quality: 0 | 1 | 2 | 3 | 4 | 5 | null;
};

type SessionState = {
  vault: Vault;
  dbPath: string;
  lang: string;
  itemsTouched: Set<string>;
  turnsSinceProbe: number;
  turnsSinceMasteryProbe: number;
  knownLemmas: Set<string>;
  stagedConceptId?: number;
  // KLI Learning Event class the agent declared for the *current* turn via
  // `le.declare`. null = not declared yet (logged as "(undeclared)" so the
  // report can surface the bug instead of silently defaulting).
  leClass: LeClass | null;
  // Opportunities recorded by tool calls during the current turn. Reset on
  // before_agent_start, flushed in agent_end.
  turnOpportunities: Opportunity[];
};

function loadKnownLemmas(vault: Vault, lang: string): Set<string> {
  const files = vault.list(`vocab/${lang}`).filter((p) => p.endsWith(".md"));
  return new Set(files.map((f) => path.basename(f, ".md").toLowerCase()));
}

// Look up KC type + first topic for a lemma. Searches vocab/ first, then
// grammar/. Returns null if the lemma file doesn't exist (avoids crashing
// the turn-end log on a stale itemsTouched entry).
function readItemMeta(
  vault: Vault,
  lang: string,
  lemma: string,
): { kind: "vocab" | "grammar"; kc_type?: KcType; topic: string | null } | null {
  for (const kind of ["vocab", "grammar"] as const) {
    const rel = `${kind}/${lang}/${lemma}.md`;
    if (!vault.exists(rel)) continue;
    const { data } = vault.readFrontmatter<{
      kc_type?: KcType;
      topics?: string[];
    }>(rel);
    return {
      kind,
      kc_type: data.kc_type,
      topic: data.topics?.[0] ?? null,
    };
  }
  return null;
}

function detectConfusion(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length <= 2 && /^[?¿]+$/.test(trimmed)) return true;
  if (/^(huh|what|qué|que)\??$/i.test(trimmed)) return true;
  return false;
}

function detectFluentReply(message: string, lemmas: Set<string>): boolean {
  if (message.length < 40) return false;
  let hits = 0;
  for (const word of message.toLowerCase().split(/[^\p{L}]+/u)) {
    if (word && lemmas.has(word)) hits += 1;
    if (hits >= 3) return true;
  }
  return false;
}

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });
const jsonResult = (value: unknown) => textResult(JSON.stringify(value));

export default function learnLoop(pi: ExtensionAPI): void {
  let state: SessionState | null = null;
  const requireState = (): SessionState => {
    if (!state) throw new Error("learn-pi: session not started yet");
    return state;
  };

  // ── lifecycle ───────────────────────────────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    const vaultPath = ctx.cwd;
    const vault = new Vault(vaultPath);
    const lang =
      (vault.exists("profile.md")
        ? (vault.readFrontmatter<{ target_langs?: string[] }>("profile.md").data.target_langs ?? [])[0]
        : undefined) ?? "es";

    try { await simpleGit(vaultPath).pull(); } catch { /* offline or no remote */ }

    await regenerateDueQueue(vault, lang);

    state = {
      vault,
      dbPath: path.join(vaultPath, "concepts.db"),
      lang,
      itemsTouched: new Set(),
      turnsSinceProbe: 99,
      turnsSinceMasteryProbe: 99,
      knownLemmas: loadKnownLemmas(vault, lang),
      leClass: null,
      turnOpportunities: [],
    };
    pi.appendEntry("learn-pi-session", { lang, started: new Date().toISOString() });
  });

  pi.on("before_agent_start", async (event: { systemPrompt: string }, _ctx) => {
    if (!state) return;
    // Lazy reset for the new turn — agent must call le.declare before composing.
    state.leClass = null;
    state.turnOpportunities = [];
    state.turnsSinceProbe += 1;
    state.turnsSinceMasteryProbe += 1;

    const { vault, lang, dbPath } = state;
    const zpd = getZpd(vault, lang);
    const due = await regenerateDueQueue(vault, lang);
    const reviewItems = due.filter((d) => d.lane === "review");
    const probeItems = due.filter((d) => d.lane === "probe");
    const probeAllowed = state.turnsSinceMasteryProbe >= 4;

    const db = new ConceptsDb(dbPath);
    const counts: Record<string, number> = {};
    for (const t of db.query({})) counts[t.subject] = (counts[t.subject] ?? 0) + 1;
    db.close();
    const topSubjects = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s, n]) => `${s}(${n})`);

    const directive = [
      `# learn-pi directive`,
      `lang=${lang}  rung=${zpd.rung}  subscore=${zpd.subscore}`,
      `due_quota=${reviewItems.length}${reviewItems.length ? ` — weave 1–2 of [${reviewItems.slice(0, 5).map((d) => d.lemma).join(", ")}] invisibly` : ""}`,
      probeItems.length && probeAllowed
        ? `probe_quota=${probeItems.length} — within this turn or the next, run ONE of [${probeItems.map((d) => d.lemma).join(", ")}] as a cold-retrieval probe in the base language. Do NOT scaffold. Then call mastery.probe(lemma, quality 0–5). Probes are SEPARATE turns from weaving — never mix the two in one utterance.`
        : probeItems.length
          ? `probe_quota=${probeItems.length} (cooldown — last probe too recent; defer)`
          : `probe_quota=0`,
      `top_subjects=[${topSubjects.join(", ") || "(none)"}]`,
      ``,
      `## Mandatory pre-turn ritual`,
      `1. Consult skill "zpd-calibrate" for the style directive.`,
      `2. Call le.declare exactly once with one of memory_fluency | induction | sense_making. Match the dominant KC type the turn engages:`,
      `   - memory_fluency → fact retrieval (use "recall-weave" to weave due items)`,
      `   - induction      → skills via varied examples + contrast (surface 2 contrasting sentences, ask the learner to produce a third)`,
      `   - sense_making   → principles via rationale (ask the learner to explain *why* before confirming)`,
      `3. If you skip le.declare the turn is logged as "(undeclared)" and the report flags it.`,
      ``,
      `If the user reply was "?" or similar, use skill "simplify-ladder".`,
      `Two-map rule: ANY write to the concept graph MUST be confirmed by the user IN THE BASE LANGUAGE via skill "concept-commit". Refuse to call concepts.commit otherwise — it will throw.`,
    ].join("\n");

    return { systemPrompt: event.systemPrompt + "\n\n" + directive };
  });

  pi.on("input", async (event: { text: string }, _ctx) => {
    if (!state) return;
    const msg = event.text ?? "";
    if (detectConfusion(msg)) {
      adjustZpd(state.vault, state.lang, -0.4, "user signaled confusion");
      pi.appendEntry("learn-pi-confusion", {
        at: new Date().toISOString(),
        prior_items: [...state.itemsTouched],
      });
      return;
    }
    if (detectFluentReply(msg, state.knownLemmas)) {
      adjustZpd(state.vault, state.lang, +0.15, "fluent target-language reply");
    }
    for (const word of msg.toLowerCase().split(/[^\p{L}]+/u)) {
      if (word && state.knownLemmas.has(word)) state.itemsTouched.add(word);
    }
    state.turnsSinceProbe += 1;
  });

  pi.on("agent_end", async (_event, _ctx) => {
    if (!state) return;
    const zpd = getZpd(state.vault, state.lang);

    // Add passive opportunities for items_touched not already represented
    // (i.e., touched but not graded or probed this turn).
    const recordedLemmas = new Set(state.turnOpportunities.map((o) => o.lemma));
    for (const lemma of state.itemsTouched) {
      if (recordedLemmas.has(lemma)) continue;
      const meta = readItemMeta(state.vault, state.lang, lemma);
      if (!meta) continue;
      state.turnOpportunities.push({
        lemma,
        kind: meta.kind,
        kc_type: meta.kc_type ?? null,
        topic: meta.topic,
        grade: null,
        probe: false,
        mastery_quality: null,
      });
    }

    pi.appendEntry("learn-pi-turn", {
      at: new Date().toISOString(),
      rung: zpd.rung,
      subscore: zpd.subscore,
      le_class: state.leClass,
      opportunities: state.turnOpportunities,
    });
    // Clear per-turn state. Next turn re-declares via le.declare on entry.
    state.itemsTouched.clear();
    state.turnOpportunities = [];
    try {
      const git = simpleGit(state.vault.root);
      await git.add(".");
      const status = await git.status();
      if (!status.isClean()) {
        await git.commit(`learn-pi turn ${new Date().toISOString()}`);
        try { await git.push(); } catch { /* no remote */ }
      }
    } catch { /* ignore */ }
  });

  // ── commands ────────────────────────────────────────────────────────────
  pi.registerCommand("tired", {
    description: "Signal tiredness; drop rung and shorten turns for the rest of the session.",
    handler: async (_args, ctx) => {
      const s = requireState();
      const next = adjustZpd(s.vault, s.lang, -0.3, "user said tired");
      ctx.ui?.notify?.(`rung → ${next.rung}@${next.subscore}`, "info");
    },
  });

  // ── tools ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "vault_read",
    label: "vault.read",
    description: "Read a file from the learn-pi vault (scoped to the session vault root).",
    parameters: Type.Object({ path: Type.String() }),
    async execute(_id, { path: p }) {
      return textResult(requireState().vault.read(p));
    },
  });

  pi.registerTool({
    name: "vault_write",
    label: "vault.write",
    description: "Write a file to the learn-pi vault (scoped to the session vault root).",
    parameters: Type.Object({ path: Type.String(), content: Type.String() }),
    async execute(_id, { path: p, content }) {
      requireState().vault.write(p, content);
      return textResult(`wrote ${p}`);
    },
  });

  pi.registerTool({
    name: "concepts_query",
    label: "concepts.query",
    description: "Query committed triples from the belief/concept graph.",
    parameters: Type.Object({
      subject: Type.Optional(Type.String()),
      predicate: Type.Optional(Type.String()),
      object: Type.Optional(Type.String()),
    }),
    async execute(_id, args) {
      const s = requireState();
      const db = new ConceptsDb(s.dbPath);
      try { return jsonResult(db.query(args ?? {})); } finally { db.close(); }
    },
  });

  pi.registerTool({
    name: "concepts_propose",
    label: "concepts.propose",
    description:
      "Stage a belief triple. Does NOT commit — follow up with concepts.commit only after base-language confirmation.",
    parameters: Type.Object({
      subject: Type.String(),
      predicate: Type.String(),
      object: Type.String(),
      lang: Type.String(),
    }),
    async execute(_id, args) {
      const s = requireState();
      const db = new ConceptsDb(s.dbPath);
      try {
        const id = db.propose({ ...args, source_turn: new Date().toISOString() });
        s.stagedConceptId = id;
        return jsonResult({ staged_id: id });
      } finally { db.close(); }
    },
  });

  pi.registerTool({
    name: "concepts_commit",
    label: "concepts.commit",
    description:
      "Commit a previously staged belief triple. REQUIRES baseLangConfirmed=true; throws otherwise. Only call after the user has confirmed in the BASE language in the immediately preceding turn.",
    parameters: Type.Object({
      staged_id: Type.Number(),
      baseLangConfirmed: Type.Boolean(),
    }),
    async execute(_id, { staged_id, baseLangConfirmed }) {
      const s = requireState();
      const db = new ConceptsDb(s.dbPath);
      try {
        db.commit(staged_id, baseLangConfirmed);
        return textResult(`committed ${staged_id}`);
      } finally { db.close(); }
    },
  });

  pi.registerTool({
    name: "vocab_introduce",
    label: "vocab.introduce",
    description:
      "Register a new target-language lemma with initial SM-2 state. Pass kc_type explicitly: single-meaning word → fact, inflectable verb/pronoun set → skill. Pass topics to enable per-topic mastery aggregation.",
    parameters: Type.Object({
      lemma: Type.String(),
      lang: Type.String(),
      gloss: Type.String(),
      example: Type.Optional(Type.String()),
      kc_type: Type.Optional(
        Type.Union([
          Type.Literal("fact"),
          Type.Literal("skill"),
          Type.Literal("principle"),
        ]),
      ),
      topics: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, { lemma, lang, gloss, example, kc_type, topics }) {
      const s = requireState();
      const rel = `vocab/${lang}/${lemma}.md`;
      if (s.vault.exists(rel)) return textResult(`already known: ${lemma}`);
      const sm2 = initSm2();
      s.vault.writeFrontmatter(
        rel,
        {
          lemma,
          lang,
          gloss,
          kc_type: kc_type ?? "fact",
          topics: topics ?? [],
          sm2,
          mastery: defaultMastery(),
          last_seen: new Date().toISOString(),
        },
        `\n## examples\n- ${example ?? ""}\n`,
      );
      s.knownLemmas.add(lemma.toLowerCase());
      return textResult(`introduced ${lemma} (kc_type=${kc_type ?? "fact"})`);
    },
  });

  pi.registerTool({
    name: "grammar_introduce",
    label: "grammar.introduce",
    description:
      "Register a new grammar item (rule/pattern with rationale). Defaults kc_type to principle. Pass topics to enable aggregation. Mirror of vocab.introduce but writes under grammar/<lang>/.",
    parameters: Type.Object({
      lemma: Type.String(),
      lang: Type.String(),
      gloss: Type.String(),
      example: Type.Optional(Type.String()),
      kc_type: Type.Optional(
        Type.Union([Type.Literal("skill"), Type.Literal("principle")]),
      ),
      topics: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, { lemma, lang, gloss, example, kc_type, topics }) {
      const s = requireState();
      const rel = `grammar/${lang}/${lemma}.md`;
      if (s.vault.exists(rel)) return textResult(`already known: ${lemma}`);
      const sm2 = initSm2();
      s.vault.writeFrontmatter(
        rel,
        {
          lemma,
          lang,
          gloss,
          kc_type: kc_type ?? "principle",
          topics: topics ?? [],
          sm2,
          mastery: defaultMastery(),
          last_seen: new Date().toISOString(),
        },
        `\n## examples\n- ${example ?? ""}\n`,
      );
      return textResult(
        `introduced grammar ${lemma} (kc_type=${kc_type ?? "principle"})`,
      );
    },
  });

  pi.registerTool({
    name: "vocab_grade",
    label: "vocab.grade",
    description: "Update SM-2 state for a lemma with a 0–5 quality score.",
    parameters: Type.Object({
      lemma: Type.String(),
      quality: Type.Number(),
    }),
    async execute(_id, { lemma, quality }) {
      const s = requireState();
      const rel = `vocab/${s.lang}/${lemma}.md`;
      if (!s.vault.exists(rel)) return textResult(`no such lemma: ${lemma}`);
      const { data, body } = s.vault.readFrontmatter<{
        sm2?: Sm2State;
        kc_type?: KcType;
        topics?: string[];
      }>(rel);
      const prior = data.sm2 ?? initSm2();
      const q = Math.max(0, Math.min(5, Math.round(quality))) as 0 | 1 | 2 | 3 | 4 | 5;
      const next = gradeSm2(prior, q);
      s.vault.writeFrontmatter(
        rel,
        { ...data, sm2: next, last_seen: new Date().toISOString() },
        body,
      );
      // Record an opportunity for the per-turn log.
      s.turnOpportunities.push({
        lemma,
        kind: "vocab",
        kc_type: data.kc_type ?? null,
        topic: data.topics?.[0] ?? null,
        grade: q,
        probe: false,
        mastery_quality: null,
      });
      return jsonResult({ lemma, sm2: next });
    },
  });

  pi.registerTool({
    name: "zpd_get",
    label: "zpd.get",
    description: "Read current ZPD rung and subscore for a language.",
    parameters: Type.Object({ lang: Type.String() }),
    async execute(_id, { lang }) {
      return jsonResult(getZpd(requireState().vault, lang));
    },
  });

  pi.registerTool({
    name: "zpd_adjust",
    label: "zpd.adjust",
    description: "Adjust subscore by a delta, crossing rungs on under/overflow.",
    parameters: Type.Object({
      lang: Type.String(),
      delta: Type.Number(),
      reason: Type.String(),
    }),
    async execute(_id, { lang, delta, reason }) {
      return jsonResult(adjustZpd(requireState().vault, lang, delta, reason));
    },
  });

  pi.registerTool({
    name: "le_declare",
    label: "le.declare",
    description:
      "Declare the KLI Learning Event class the next assistant turn is targeting. One of: memory_fluency, induction, sense_making. Logged to session metadata at turn end.",
    parameters: Type.Object({
      le_class: Type.Union([
        Type.Literal("memory_fluency"),
        Type.Literal("induction"),
        Type.Literal("sense_making"),
      ]),
    }),
    async execute(_id, { le_class }) {
      requireState().leClass = le_class as LeClass;
      return textResult(`le_class=${le_class}`);
    },
  });

  pi.registerTool({
    name: "mastery_get",
    label: "mastery.get",
    description:
      "Read mastery state for a lemma (probe-updated, distinct from SM-2 ease).",
    parameters: Type.Object({ lemma: Type.String() }),
    async execute(_id, { lemma }) {
      const s = requireState();
      const rel = `vocab/${s.lang}/${lemma}.md`;
      if (!s.vault.exists(rel)) return textResult(`no such lemma: ${lemma}`);
      const { data } = s.vault.readFrontmatter<{ mastery?: MasteryState }>(rel);
      return jsonResult({ lemma, mastery: data.mastery ?? defaultMastery() });
    },
  });

  pi.registerTool({
    name: "mastery_probe",
    label: "mastery.probe",
    description:
      "Record the outcome of an unscaffolded probe on a lemma. Updates mastery state only — does NOT touch SM-2 ease. Quality 0–5 (0 = blank, 5 = cold spontaneous production).",
    parameters: Type.Object({
      lemma: Type.String(),
      quality: Type.Number(),
    }),
    async execute(_id, { lemma, quality }) {
      const s = requireState();
      const rel = `vocab/${s.lang}/${lemma}.md`;
      if (!s.vault.exists(rel)) return textResult(`no such lemma: ${lemma}`);
      const { data, body } = s.vault.readFrontmatter<{
        mastery?: MasteryState;
        kc_type?: KcType;
        topics?: string[];
      }>(rel);
      const prior = data.mastery ?? defaultMastery();
      const q = Math.max(0, Math.min(5, Math.round(quality))) as
        | 0
        | 1
        | 2
        | 3
        | 4
        | 5;
      const next = gradeProbe(prior, q);
      s.vault.writeFrontmatter(
        rel,
        { ...data, mastery: next },
        body,
      );
      // Record an unscaffolded probe opportunity. Reset the throttle.
      s.turnOpportunities.push({
        lemma,
        kind: "vocab",
        kc_type: data.kc_type ?? null,
        topic: data.topics?.[0] ?? null,
        grade: null,
        probe: true,
        mastery_quality: q,
      });
      s.turnsSinceMasteryProbe = 0;
      return jsonResult({ lemma, mastery: next });
    },
  });

  pi.registerTool({
    name: "queue_due",
    label: "queue.due",
    description: "List SM-2 due items for the given language, up to `limit` (default 5).",
    parameters: Type.Object({
      lang: Type.String(),
      limit: Type.Optional(Type.Number()),
    }),
    async execute(_id, { lang, limit }) {
      const all = await regenerateDueQueue(requireState().vault, lang);
      return jsonResult(all.slice(0, limit ?? 5));
    },
  });
}
