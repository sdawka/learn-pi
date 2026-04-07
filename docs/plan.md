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
│       ├── caballo.md               # frontmatter: {lemma, pos, sm2:{ease,interval,next_review}, rung, last_seen, senses:[...]}
│       └── ...
├── grammar/
│   └── es/
│       └── subjunctive-present.md   # same SM-2 frontmatter, scoped to grammar items
├── sessions/
│   └── 2026-04-06T0930.md           # transcript + turn-level metadata (rung, subscore, items_touched)
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
- **on assistant turn (pre-send)**: `zpd-calibrate`; weave due items; probe concepts when coverage is thin.
- **on session end**: `vocab-grade` for touched items; append transcript; `git commit && push`.

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
| `queue.due` | due items for weaving |

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
