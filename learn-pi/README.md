# learn-pi

A pi-mono package that turns pi into a proactive, ZPD-calibrated language tutor with spaced recall and a belief graph.

## Learning science frame

Items are typed with KLI Knowledge Components (`fact | skill | principle`) and every assistant turn declares a Learning Event class (`memory_fluency | induction | sense_making`). SM-2 spaced repetition is scoped to the memory_fluency LE only — not a universal progress measure. Unscaffolded *probe* turns update a separate `mastery` field; the gap between SM-2 ease and mastery is the primary diagnostic. The codebase is organized along GIFT's four ITS modules — Learner, Domain, Pedagogical, Sensor — noted in file headers.

File-to-module map:

- **Learner Module**: `lib/zpd.ts`, `lib/concepts-db.ts`, `lib/mastery.ts`
- **Domain Module**: vault `vocab/`, `grammar/`
- **Pedagogical Module**: `extensions/learn-loop.ts` (turn planner), `lib/sm2.ts`, `lib/spaced-queue.ts`, skills under `skills/`
- **Sensor Module**: signal detection in `extensions/learn-loop.ts` (`?` handling, fluency detection) and `lib/zpd.ts`

See [../docs/plan.md](../docs/plan.md) "Learning science frame" section for the full taxonomy.

## Install

```sh
npm install
npm run build
pi package install ./learn-pi
```

## Run

```sh
cd ~/LearnVault          # a git repo created from the scaffold in this project
pi --vault .
/start-session es
```

## Architecture

See [../docs/plan.md](../docs/plan.md) for the full design. Summary:

- `src/extensions/learn-loop.ts` — main lifecycle extension: ZPD, vocab, belief graph, git sync.
- `src/extensions/telegram-gateway.ts` — Telegram long-poll + scheduled proactive pings.
- `src/lib/` — SM-2, vault I/O, concepts DB, ZPD state, due queue.
- `skills/` — on-demand capability packages (zpd-calibrate, simplify-ladder, recall-weave, concept-probe, concept-commit, vocab-introduce, vocab-grade).
- `prompt-templates/` — `/start-session`, `/tired`, `/probe`.

The concept graph in `concepts.db` is **base-language authoritative**. Any write requires base-language confirmation; the `concept-commit` skill is the only path that calls `concepts.commit`, and `ConceptsDb.commit` throws if `baseLangConfirmed !== true`.
