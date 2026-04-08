# Principles

The constitution. When there's a design dispute in this repo, this is what we point at. Five principles, each with: the statement, why we hold it, where it shows up in the code, and the anti-pattern that violates it.

---

## 1. Measure what the learner can do without scaffolds

**Statement.** Scaffolded performance is a property of the scaffold, not the learner. The number that matters is what the learner can recall, produce, or apply when nothing is helping them.

**Why we hold it.** Spaced-repetition systems are notorious for producing high "ease" scores on items the learner can't actually use cold. The ease is a measurement of the spacing algorithm's calibration to the user's response patterns inside its own scaffold loop. Strip the scaffold and the number collapses. We've all seen this in our own Anki decks.

**Where it shows up.**
- `learn-pi/lib/mastery.ts` defines `MasteryState` — a separate signal from SM-2 `ease`, updated only by `mastery.probe`. Probes are explicit unscaffolded retrieval events.
- `learn-pi/lib/spaced-queue.ts` emits a *probe lane* alongside the *review lane*. Probe-lane items are routed to cold-retrieval turns; the agent is forbidden from weaving them into in-context use.
- `learn-pi/scripts/learning-report.ts` reports a "Probe-vs-practice gap" sorted by severity. Items where SM-2 ease is high but probe mastery is low are the diagnostic.

**Anti-pattern.** Inferring mastery from a turn where the lemma was glossed inline, weaved into context, or available on the previous line of the conversation. That's measuring the scaffold.

---

## 2. Match instructional moves to knowledge types

**Statement.** Facts, skills, and principles are different kinds of knowledge and they need different kinds of practice. Drilling a principle is a wasted turn. Explaining a fact is condescending. Asking the learner to induce a fact from examples is theatre.

**Why we hold it.** This is KLI's central empirical claim, backed by ten years of LearnLab data: instructional moves that match the Knowledge Component type produce learning curves that bend; mismatched moves produce flat curves at any difficulty. The most common failure mode of intelligent tutors is over-indexing on memory/fluency moves because they're easy to instrument.

**Where it shows up.**
- `learn-pi/extensions/learn-loop.ts` `before_agent_start` directive forces the agent to call `le.declare` with one of `memory_fluency | induction | sense_making` before composing each turn, with a rubric matching each LE to a KC type.
- `learn-pi/skills/*/SKILL.md` files declare a `learning_event` in frontmatter so the pedagogical intent of every skill is visible where it's defined.
- `learn-pi/scripts/learning-report.ts` renders learning curves bucketed by `kc_type`. A flat curve for `principle` items means you're drilling principles instead of asking for explanations.

**Anti-pattern.** Treating every item like a fact because SM-2 is easy to wire up. The merged overlay before this PR did exactly this — facts, skills, and principles all went through the same retrieval loop.

---

## 3. The vault is the source of truth, not the database

**Statement.** Everything that can be expressed as text lives as text. Markdown files with YAML frontmatter are the canonical state. Binaries (SQLite) hold only what can't reasonably live in markdown.

**Why we hold it.** A markdown vault can be diffed, edited by hand, version-controlled, read by humans, replayed by machines, and shared without a runtime. A binary state file can do none of those things. When something goes wrong — a stale `next_review`, a wrong `kc_type`, a confused `le_class` — you fix it by editing a file in Obsidian and the agent re-reads on the next turn. No migrations, no admin tool, no support ticket.

**Where it shows up.**
- The entire `LearnVault/` layout is markdown except `concepts.db`, which is SQLite only because the triple store needs indexed lookup.
- `learn-pi/lib/vault.ts` is the only filesystem boundary; everything reads/writes via `Vault.readFrontmatter` and `Vault.writeFrontmatter` so the YAML round-trips cleanly.
- `learn-pi/scripts/backfill-frontmatter.ts` is a vault-editing tool, not a database migration. It speaks the same format the user does.

**Anti-pattern.** "Let's just store this in concepts.db, it's faster." If the field is editable by a human in Obsidian, it belongs in markdown. The two-map rule (concept-graph writes require base-language confirmation) is enforced in the SQLite gate exactly *because* concepts.db is the one place where invariants can't be hand-checked.

---

## 4. Difficulty and pedagogy are orthogonal axes

**Statement.** The ZPD rung ladder controls *how hard the language presentation is*. The Learning Event class controls *what kind of cognitive work the turn is doing*. A turn at L2 (mixed base/target) can be a fact drill, a contrast pair, or a sense-making prompt. They are independent dimensions.

**Why we hold it.** Conflating difficulty and pedagogy is the bug that produces "I'll just lower the difficulty" as the answer to every problem, including problems where the difficulty is fine and the pedagogy is wrong. If a learner has a flat curve on principles, dropping them to L0 just gives you a flat curve on principles in the base language. The fix is sense-making, not simplification.

**Where it shows up.**
- `learn-pi/lib/zpd.ts` header comment explicitly states the orthogonality: "Rung controls difficulty of presentation. It is orthogonal to the KLI Learning Event class."
- `learn-loop.ts` `agent_end` logs `rung`, `subscore`, *and* `le_class` as independent fields, so the report can show LE mix at constant rung and curve shape at constant LE.
- `simplify-ladder/SKILL.md` and `zpd-calibrate/SKILL.md` are tagged `learning_event: none` with an explicit rationale: they're difficulty moves, not pedagogical moves.

**Anti-pattern.** Treating "simplify" as a pedagogical fix. It is not. It is a difficulty fix. They look similar from the outside and they are not the same operation.

---

## 5. Every measurement we add must be falsifiable

**Statement.** If a report can't show us we're wrong about a hypothesis, it can't show us we're right. We don't add metrics that always go up.

**Why we hold it.** Vanity metrics drift up regardless of whether the system is actually working. "Items reviewed", "minutes spent", "streak length" — none of these distinguish a system that's helping from a system that's just running. The numbers we track must be capable of being bad. If they're never bad, they're not measurements.

**Where it shows up.**
- The probe-vs-practice gap section can grow when we ship more items without probing them. That's the failure mode it's there to catch.
- Learning curves can be flat. A flat curve is a *bad* shape — it tells us the LE class is mismatched. This is the report's most actionable signal.
- The LE mix counts an `(undeclared)` bucket separately from declared classes. If the mix shows 100% undeclared, the agent is broken — the directive isn't landing. We can see that.
- `aggregateByTopic` excludes items without `topics:` set, surfacing in the report as "no items have topics yet — tag items to enable per-topic measurement". The absence is visible.
- `learn-pi/lib/cost.ts` computes cost-per-mastered-KC (total spend divided by items with `mastery.n_probes > 0 AND mastery.score >= 0.7`). This is the rare metric that can go *down* over time as the system gets more efficient and *up* when pedagogy regresses or scope creeps. Rising = we're paying more to learn less; falling = we're getting more efficient. Exactly the falsifiability shape this principle demands.

**Anti-pattern.** "Total lemmas introduced" as a measurement of progress. Adding more items always goes up. It says nothing about learning. If we want to count items, count items the learner has demonstrated mastery on under unscaffolded probe — that number can go *down* when items decay, which is exactly what makes it a measurement.

---

## How to use this document

When you're about to add a feature or change a behavior, ask: "which principle does this serve, and which one might it violate?" If you can't answer the first question, you don't need the feature. If the answer to the second is "none", you're either right or you haven't thought hard enough — usually the latter.

When two contributors disagree about a design choice, the resolution is whichever option better serves the principle at stake. If neither does, the principle list is incomplete and we add a sixth.

When you're reviewing a PR and something feels wrong but you can't articulate why, scan this list. The articulation is usually here.
