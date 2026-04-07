# learn-pi

A pi-mono package that turns pi into a proactive, ZPD-calibrated language tutor with spaced recall and a belief graph.

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
