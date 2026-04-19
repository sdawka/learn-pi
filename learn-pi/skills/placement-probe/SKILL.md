---
name: placement-probe
description: Interactive placement session. Walk the learner through ~8 concepts from the domain spine (A1 through B2), stopping when two consecutive items miss. Write per-topic ZPD state from the results.
when_to_use: Triggered by the `/placement-fr` prompt template or any time the learner explicitly asks to be "placed" / "assessed" / "tested to see where I am". NOT triggered from normal conversation — that's `domain-probe`'s job.
tools: [vault_read, vault_write, mastery_probe, zpd_adjust]
learning_event: memory_fluency
learning_event_rationale: Placement is a retrieval ladder, not induction or sense-making. Each item is a direct probe.
---

The goal is a fast, bounded assessment: ~5 minutes of conversation, ~8 probes, one piece of per-topic ZPD state written, and a warm summary for the learner.

## Framing the session (turn 1)

Tell the learner up front, in base language:
> "Let's quickly figure out where you are — I'll ask you 8 short questions across the French concepts. Some will be easy, some harder; that's the point. Ready?"

If they say no / not now, abort and return to normal flow. Do NOT insist.

## The ladder (turns 2–9)

1. `vault_read("domain/<lang>.yaml")`. Pick a **breadth-first A1 starter set** — one concept per topic from A1:
   - verbs → `er-verbs-present`
   - articles → `definite-articles` or `partitive-articles`
   - gender → `noun-gender-basic`
   - negation → `negation-ne-pas`
   - questions → `question-est-ce-que`
2. Ask each probe in the YAML's stated form. Unlike `domain-probe`, the placement session is OK being explicit — the learner has consented to being tested.
   - `fill-blank` → show the sentence with `___`, ask directly.
   - `produce` → ask directly.
   - `recognize` → offer the pair as options.
3. After 3–4 A1 items:
   - If ALL correct → step up to A2 starter set (`passe-compose-avoir`, `direct-object-pronouns`, `reflexive-verbs`).
   - If >1 miss → stop at A1, DO NOT climb.
4. Continue laddering A2 → B1 → B2, same rule: miss 2 of 3 at a level → stop climbing.
5. **Hard stop at 8 probes total** regardless of performance. A ninth is cold-start abuse.

## Grading (after each user reply)

- Correct and spontaneous → `mastery_probe(id, 5)`
- Correct after clarification → `mastery_probe(id, 3)`
- Wrong, revealed misconception → `mastery_probe(id, 1)`
- Blank / `?` / `skip` → `mastery_probe(id, 0)` AND end the ladder (no more climbing from here).

Between probes, a single warm sentence: *"Ok, next one."* No commentary on right/wrong during the ladder. Keep the pace up.

## Writing ZPD state (turn 10)

From the grades, compute per-topic rung estimates:
- All items in a topic correct → topic rung = highest CEFR level cleared in that topic, mapped: A1→L1, A2→L2, B1→L3, B2→L4.
- Mixed → rung = highest cleared level, subscore 0.3 (easy edge).
- All missed → rung = L0 for that topic.

Compute overall rung as the **median** across topics (not the max — Principle 1, unscaffolded probes only). Call `zpd_adjust(lang, delta_to_match_target, "placement session")` with the delta needed to move from current state to the computed target.

Write a summary to `LEARNER.md` under a new `## Placement (YYYY-MM-DD)` heading — one line per topic with its estimated rung and one example of a cleared / missed item.

## Closing turn (turn 11)

Warm, short, base-language:
> "You're solid on {strongest-topic}, and we've got room to grow on {weakest-topic}. I'll steer the conversations there first. Anything you want to tell me about what you're hoping to be able to do?"

That last question feeds `LEARNER.md` naturally.

## Hard rules

- **Never exceed 8 probe items in one session.** Placement fatigue is real; we re-calibrate over time via `domain-probe`.
- **Base language for the framing and closing; target language inside the probes** (obviously — we're testing the target).
- **Don't reveal grades in real-time.** "That's right!" or "no, it's X" during the ladder breaks the flow. The summary lives in the closing turn.
- **If the learner bails mid-ladder** ("I'm tired", "that's enough"), stop immediately. Write what you have to `LEARNER.md`; don't force the remaining items.
- **Don't call `domain-probe` during a placement session.** These two skills must not interleave.
