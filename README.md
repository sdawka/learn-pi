# learn-pi

A proactive ZPD-calibrated language tutor built on [pi-mono](https://github.com/badlogic/pi-mono). Speaks to you just above your current level in the target language, climbs when you handle it, drops a rung when you reply with `?`. Lives in a markdown vault you can hand-edit in Obsidian. Connects to Telegram for proactive pings on a schedule. Built around an explicit learning-science vocabulary (KLI Knowledge Components, Learning Events, GIFT four-module ITS architecture) so the pedagogy is measurable, not vibes.

## Table of contents

- [Current state](#current-state) — what works today
- [Future state](#future-state) — where we're headed
- [How we treat learning](#how-we-treat-learning) — working principles
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Where to read more](#where-to-read-more)

---

## Current state

What is in the codebase and works today (as of the activation PR):

- **ZPD rung ladder** — 5 named rungs (`L0` plain base → `L4` full target) with a `subscore ∈ [0,1]` inside each rung. Auto-adjusts on confusion (`?`) and fluent replies. — `learn-pi/lib/zpd.ts`
- **SM-2 spaced recall**, scoped to the `memory_fluency` Learning Event only (not a universal progress measure). — `learn-pi/lib/sm2.ts`
- **Vault** — single git-synced markdown folder. Vocab/grammar items, ZPD state, due queue, sessions, profile. Hand-editable. — `learn-pi/lib/vault.ts`
- **Concept/belief graph** — RDF-ish triples about *the user* (interests, routines, beliefs) in SQLite, with a hard base-language confirmation gate on every commit (the two-map rule). — `learn-pi/lib/concepts-db.ts`
- **KLI overlay** — every learnable item is typed `fact | skill | principle`. Every assistant turn declares a Learning Event class (`memory_fluency | induction | sense_making`). Mastery is split from SM-2 ease and updated only by unscaffolded probe turns. — `learn-pi/lib/mastery.ts`
- **Probe lane in the due queue** — items that look fluent on SM-2 but haven't been probed get queued for cold-retrieval probe turns. The agent runs them via `mastery.probe`, separate from the weave path. — `learn-pi/lib/spaced-queue.ts`
- **Per-turn opportunity logging** — `agent_end` writes a structured `TurnLogEntry` containing rung, subscore, declared LE class, and an array of opportunities (graded encounters and probes). This is the input to learning curves. — `learn-pi/extensions/learn-loop.ts`
- **Learning report** — per-KC indicators, LE mix, learning curves (avg error rate by opportunity, KLI's signature measurement), per-topic mastery, probe-vs-practice gap. — `learn-pi/scripts/learning-report.ts`
- **Backfill script** — one-shot migration that adds `kc_type` and `mastery` to legacy vault items, with `--dry-run`. — `learn-pi/scripts/backfill-frontmatter.ts`
- **GIFT four-module organization** — file headers name which module each file serves (Learner / Domain / Pedagogical / Sensor). Labeling, not a code reorg.
- **Skill tagging** — every skill under `learn-pi/skills/*/SKILL.md` declares a `learning_event` in its frontmatter, so pedagogical intent is visible at the call site.
- **Telegram bridge** — long-poll inbound, scheduled proactive pings, shared state via the git vault so laptop and VPS see the same world. — `learn-pi/extensions/telegram-gateway.ts`
- **Cost tracking** — per-turn LLM spend captured from pi-mono's pi-ai usage payload, aggregated by LE class, by day, and as cost-per-mastered-KC. pi-mono owns the pricing tables; we ingest and aggregate. — `learn-pi/lib/cost.ts`, report section in `learn-pi/scripts/learning-report.ts`
- **Unit tests** — vitest covers `mastery.ts` (gradeProbe edges, stale thresholds, topic aggregation). `npm test` runs them.

## Future state

What we want to be able to say in 12–18 months:

- **Curves drive pedagogy.** A flat learning curve for a `kc_type` automatically promotes its KCs to a different LE class until the curve bends. Today the curves are reported but not acted on.
- **Budget caps with soft-cancel.** Daily/weekly spend limits in `profile.md` that block a turn before it hits the provider. Deferred from the cost-tracking PR until we have enough usage data to calibrate reasonable defaults.
- **Bayesian Knowledge Tracing** on top of the opportunity log gives sharper, calibrated mastery estimates per KC.
- **Generative probes.** The agent invents probes from context instead of pulling fixed prompts.
- **Cross-lingual interference detection.** When you're juggling two target languages, the system flags interference patterns and interleaves practice to maximize discrimination.
- **Concept graph drives proactive curriculum.** "You said you ride horses; here's the subjunctive in the context of stable management" — pedagogy stitched to the user's actual life.
- **Authoring tool** that surfaces the gap report and learning curves as an interactive checklist instead of a static dump. The author edits the vault by clicking on the data.
- **Open data.** Anonymized opportunity logs become a public dataset for learning-science research. The vault format is already designed for this — markdown, hand-diffable, structured.

## How we treat learning

The five working principles that govern every design decision in this repo. Long-form expansion in [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md).

1. **Measure what the learner can do without scaffolds.** Scaffolded performance is a property of the scaffold, not the learner. SM-2 ease is a scaffold reading; mastery measured by an unscaffolded probe is the learner. The probe-vs-practice gap is the most important number in the report.
2. **Match instructional moves to knowledge types.** Facts need retrieval. Skills need varied examples and contrast. Principles need explanation and rationale. A drill on a principle is a wasted turn.
3. **The vault is the source of truth, not the database.** Markdown can be diffed, edited, version-controlled, read by humans, and replayed by machines. A binary that can't be inspected is a binary that can't be trusted. SQLite holds only what can't be expressed as text.
4. **Difficulty and pedagogy are orthogonal axes.** The ZPD rung controls *how hard the language is*. The Learning Event class controls *what kind of cognitive work is happening*. A turn at L2 can be a fact drill, a contrast set, or a sense-making prompt — all three are valid moves at the same difficulty.
5. **Every measurement we add must be falsifiable.** If the report can't show us we're wrong about a hypothesis, it can't show us we're right. We don't add metrics that always go up.

## Quick start

See [`learn-pi/README.md`](learn-pi/README.md) for install and run details. Short version:

```sh
cd learn-pi
npm install
npm run typecheck
npm test
pi package install .
cd ~/LearnVault   # or wherever your vault lives
pi --vault .
/start-session es
```

## Architecture

The codebase is organized along [GIFT](https://gifttutoring.org/)'s four ITS modules, with file headers naming which module each file serves:

- **Learner Module** — `lib/zpd.ts`, `lib/concepts-db.ts`, `lib/mastery.ts`
- **Domain Module** — vault `vocab/`, `grammar/`
- **Pedagogical Module** — `extensions/learn-loop.ts` (turn planner), `lib/sm2.ts`, `lib/spaced-queue.ts`, skills under `learn-pi/skills/`
- **Sensor Module** — signal detection inside `extensions/learn-loop.ts` (`?` handling, fluency detection) and `lib/zpd.ts`

The full design lives in [`docs/plan.md`](docs/plan.md). The principles in long form live in [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md).

## Where to read more

- **`docs/plan.md`** — full design doc, locked design decisions, file/folder layout, custom tools table, verification recipe.
- **`docs/PRINCIPLES.md`** — the five principles in long form, with code references and anti-patterns.
- **`learn-pi/README.md`** — package-level install and usage.
- **[KLI paper](http://pact.cs.cmu.edu/pubs/Koedinger,%20Corbett,%20Perfetti%202012-KLI.pdf)** (Koedinger, Corbett, Perfetti 2012) — the source for our KC and LE taxonomies.
- **[GIFT description](https://gifttutoring.org/attachments/download/623/GIFTDescription_0.pdf)** — the source for the four-module architecture.
