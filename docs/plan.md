# Learn — a Pi-based language & concept learning agent

## Context

You want a proactive conversational tutor that lives in your **Zone of Proximal Development**: it speaks to you just above your current level in a target language, drops a rung when you reply with `?`, and climbs when you handle it. It has to remember what you know, what you're learning, *when* you learned it (for spaced recall), and *who you are* (interests, beliefs, life domains) so that practice feels like a real conversation instead of flashcards. It also needs to reach you: Telegram in, Telegram out, on schedule or on demand.

Pi (pi-mono, badlogic) is the right host. Pi already provides the four primitives we need — TypeScript **extensions** (lifecycle hooks, custom tools, custom commands), on-demand **skills**, markdown **prompt templates**, and distributable **pi packages** — so the whole app is one pi package plus a git-synced vault and a local SQLite DB. Everything that isn't structured state is markdown-in-a-vault so you can open it in Obsidian/Logseq and hand-edit; the agent re-reads on the next turn.

- Pi overview: https://github.com/badlogic/pi-mono
- Extensions contract: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- Packages contract: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md

## Design decisions (locked)

- **Host**: pi-mono, distributed as one pi package `learn-pi` (extensions + skills + prompt templates + themes).
- **Vault**: single git-synced folder (`~/LearnVault`, repo pushed/pulled on session boundaries) so laptop + Telegram bot on a VPS share state without a server DB.
- **ZPD ladder**: hybrid — 5 named rungs (L0 plain base → L4 full target) with a `subscore ∈ [0,1]` inside each rung. `?` = drop subscore by 0.4 (cross rung if it underflows). A fluent reply = +0.15. Stored per-topic and globally.
- **Spaced recall**: SM-2 floor (per-item `next_review`, `ease`, `interval`) giving a *soft due quota* each session; the agent weaves due items into conversation on topics you like instead of quizzing.
- **Concept / belief graph**: RDF-ish triples in **SQLite** (`concepts.db`) — `(subject, predicate, object, lang, source_turn, confidence, last_confirmed_at)`. This is the fractal map of who-you-are (professional, family, soccer, horses…) that gets probed and refined over time. **Hard rule**: any write to this graph must be confirmed in the **base language** first.
- **Vocabulary map**: separate, target-language-indexed. One markdown file per lemma under `vocab/<lang>/` with SM-2 frontmatter — hand-editable in Obsidian.
- **Two-map separation**: concept/belief graph is base-language authoritative; vocab map is target-language authoritative. Neither can silently write to the other.
- **Learning science vocabulary**: items carry a `kc_type` (fact | skill | principle) from KLI; turns declare an `le_class` (memory_fluency | induction | sense_making). The pedagogical module matches instructional moves to the `le_class` appropriate for the `kc_type`.
- **Assessment vs. practice**: SM-2 ease measures scaffolded recall (memory/fluency LE). A separate `mastery` field, updated only by unscaffolded *probe* turns, measures transfer. The gap between ease and mastery is the primary diagnostic.
- **Architecture vocabulary**: the codebase is organized along GIFT's four modules — Learner, Domain, Pedagogical, Sensor. File headers name which module a file belongs to; cross-module concerns are called out explicitly.

## Learning science frame

The system adopts two pieces of learning-science scaffolding on top of the two-map architecture:

- **KLI Knowledge Components** (Koedinger, Corbett, Perfetti 2012). Every learnable item is typed `fact | skill | principle`. Facts are constant-response (e.g. `caballo = horse`). Skills are variable-response procedures (e.g. `ser` vs `estar`). Principles are variable-response with rationale available (e.g. why subjunctive follows `espero que`).
- **KLI Learning Events**. Every assistant turn declares one of three LE classes it is targeting: `memory_fluency` (retrieval practice — SM-2 weave), `induction` (pattern extraction from varied examples + correction), or `sense_making` (explanation, self-explanation, analogy). The pedagogical module must match the LE to the KC type or learning stays shallow.
- **SM-2 is scoped to the memory_fluency LE.** It is not a universal progress measure. Mastery (transfer) is measured separately via unscaffolded *probe* turns that update a distinct `mastery` field. The gap between SM-2 ease and mastery is the primary diagnostic of whether the learner is riding scaffolds.
- **Rung vs. LE are orthogonal.** The ZPD rung ladder controls *difficulty of presentation*. The LE class controls *pedagogical mode*. A turn at rung L2 can be memory_fluency, induction, or sense_making.
- **GIFT four-module architecture** (Learner / Domain / Pedagogical / Sensor). Existing files get header comments naming which module they serve; this is labeling, not a code reorg.

References: [KLI paper](http://pact.cs.cmu.edu/pubs/Koedinger,%20Corbett,%20Perfetti%202012-KLI.pdf) · [GIFT description](https://gifttutoring.org/attachments/download/623/GIFTDescription_0.pdf)

## File/folder layout (the vault)

```
LearnVault/
├── profile.md                       # base lang, target langs, interests, tone prefs
├── concepts.db                      # SQLite: RDF triples (belief/concept graph)
├── concepts/                        # human-readable mirror of concepts.db, one file per subject
│   ├── me.md                        # root subject
│   ├── work.md
│   ├── family.md
│   └── soccer.md                    # interest nodes
├── vocab/
│   └── es/
│       ├── caballo.md               # frontmatter: {lemma, pos, kc_type, sm2:{ease,interval,next_review}, mastery:{score,last_probed,n_probes}, rung, last_seen, senses:[...]}
│       └── ...
├── grammar/
│   └── es/
│       └── subjunctive-present.md   # same SM-2 frontmatter, scoped to grammar items
├── sessions/
│   └── 2026-04-06T0930.md           # transcript + turn-level metadata (rung, subscore, items_touched, le_class, probe turn markers)
├── zpd/
│   └── es.md                        # global rung+subscore per language, plus per-topic overrides
├── queue/
│   └── es-due.md                    # today's SM-2 due items (regenerated at session start)
└── settings/
    ├── telegram.yaml                # bot token (env ref), chat_id, quiet hours, cadence
    └── schedule.yaml                # "every 3h during 09-21", "min gap 45m", "on_demand: true"
```

All markdown; SQLite is the one binary, and it's still git-diffable via a pre-commit dump.

## The pi package: `learn-pi`

```
learn-pi/
├── package.json                     # keyword: "pi-package"
├── extensions/
│   ├── learn-loop.ts                # main lifecycle extension
│   └── telegram-gateway.ts          # bridge pi <-> Telegram
├── skills/
│   ├── zpd-calibrate/SKILL.md
│   ├── simplify-ladder/SKILL.md
│   ├── recall-weave/SKILL.md
│   ├── concept-probe/SKILL.md
│   ├── concept-commit/SKILL.md      # hard-gated on base-lang confirmation
│   ├── vocab-introduce/SKILL.md
│   └── vocab-grade/SKILL.md
├── prompt-templates/
│   ├── start-session.md
│   ├── tired.md
│   └── probe.md
└── themes/learn-dark.json
```

### `learn-loop.ts` — the lifecycle extension

- **on session start**: `git pull` → load profile/zpd → regenerate due queue → inject system message with rung, subscore, due-quota, top interest nodes.
- **on user turn**: detect `?` → `simplify-ladder`. Detect fluent reply → nudge subscore up. Tag `items_touched`.
- **on assistant turn (pre-send)**: `zpd-calibrate`; weave due items; probe concepts when coverage is thin. Declare `le_class` for this turn; if memory_fluency, weave due items; if induction, surface contrast examples; if sense_making, ask for explanation or rationale.
- **on session end**: `vocab-grade` for touched items; append transcript; `git commit && push`. Run probes for items flagged by `queue.due` as mastery-stale.

### Custom tools the extension registers

| Tool | Purpose |
|---|---|
| `vault.read` / `vault.write` | scoped to vault root |
| `concepts.query` | read triples from concepts.db |
| `concepts.propose` | stage a triple; requires base-lang confirm before commit |
| `concepts.commit` | write to concepts.db + mirror to concepts/<subject>.md |
| `vocab.introduce` | create vocab/<lang>/<lemma>.md with SM-2 init |
| `vocab.grade` | SM-2 update |
| `zpd.get` / `zpd.adjust` | read/mutate rung state |
| `queue.due` | due items for weaving (review lane) and probe candidates (probe lane) |
| `mastery.probe` | fire an unscaffolded retrieval/application prompt; record result to the mastery store |
| `mastery.get` | read mastery score for a KC |
| `le.declare` | record the turn's LE class into session metadata |

`vocab.grade` stays scoped to SM-2 (memory/fluency LE). It does not write to mastery.

The `concept-commit` skill is the ONLY path that calls `concepts.commit`, and it enforces base-language confirmation.

### `telegram-gateway.ts`

- Long-polls Telegram; on inbound message runs a pi turn keyed by chat_id.
- On schedule (settings/schedule.yaml), respecting quiet hours + min_gap, composes a proactive turn via zpd-calibrate + recall-weave + concept-probe.
- Runs identically on laptop and VPS; state is shared via the git vault.

## Verification

1. `pi package install ./learn-pi`
2. `git init LearnVault && cd LearnVault && pi --vault .`
3. `/start-session es` — L1-ish Spanish opener about a known interest.
4. Reply `?` — previous turn rewrites one rung lower; `zpd/es.md` subscore dropped by 0.4.
5. Fluent Spanish reply — subscore climbs; new lemmas appear under `vocab/es/`.
6. Try a Spanish-only belief commit — must refuse until confirmed in English.
7. End session — `sessions/<ts>.md` exists, touched items have advanced `next_review`, one git commit.
8. Telegram: second machine against the same git vault. `?` from Telegram simplifies the last assistant turn.
9. Scheduled ping — arrives in active window, weaves at least one due item.
10. After a few sessions, run `npx tsx learn-pi/scripts/learning-report.ts ~/LearnVault` — confirm per-KC buckets exist and are grouped by `kc_type`, and that LE mix is logged per session.
11. Force a probe on a high-ease lemma via `mastery.probe` — confirm the `mastery` field updates independently of SM-2 state and a divergence shows up in the probe-vs-practice gap section of the report.

## Status (as of activation PR)

- ✅ **KLI vocabulary** (PR #1, merged): `kc_type`, `le_class`, mastery split, GIFT module headers, skill `learning_event` tagging.
- ✅ **Pedagogy activation** (this PR): `le.declare` mandatory per turn (logged as `(undeclared)` if skipped), probe loop wired with throttle, `vocab.introduce` takes explicit `kc_type` + `topics`, new `grammar.introduce` tool defaults to `principle`, opportunities recorded per turn.
- ✅ **Measurement** (this PR): learning curves bucketed by `kc_type`, per-topic aggregation via `aggregateByTopic`, vitest unit tests for `mastery.ts`, backfill script for legacy vault items.
- ✅ **Documentation** (this PR): repo-root `README.md` (front door, current state, future state, working principles), `docs/PRINCIPLES.md` (constitution).
- 🔜 **Open follow-ups**: Bayesian Knowledge Tracing on the opportunity log, generative probes, cross-lingual interference detection, authoring tool, curves auto-promoting KCs to different LE classes when flat.
