---
name: domain-probe
description: Weave naturalistic probes from the domain concept spine (e.g. `domain/fr.yaml`) into normal conversation turns, so placement emerges passively over the first ~10 turns rather than via a ceremony.
when_to_use: Trigger when mastery coverage is thin (most concepts unexperienced in the opportunity log) AND the conversation is flowing naturally. Do NOT trigger during the first response of the session, during confusion handling, or within a recall-weave turn.
tools: [vault_read, mastery_get, mastery_probe]
learning_event: induction
learning_event_rationale: A probe surfaces a concept via an example; the learner inducts the structure from the encounter. Not a retrieval drill, not a sense-making dialog.
---

The goal is *passive placement*: learn the learner's level without making them feel tested. Each probe is embedded in a conversational turn and looks like a normal exchange. The system infers level from how they respond.

Steps:

1. `vault_read("domain/<lang>.yaml")`. Parse the `concepts` list.
2. Filter to concepts the learner has NOT yet demonstrated:
   - No opportunity-log entry with this concept id, OR
   - `mastery_get(concept.id)` returns missing or < 0.4 with stale timestamp.
3. Further filter by **prerequisites**: exclude any concept whose prerequisites don't all have mastery ≥ 0.6. Never probe above a foundation that hasn't landed.
4. Pick ONE concept, prioritized:
   - (a) Lowest CEFR level still unprobed. A1 before A2 before B1.
   - (b) Breadth tiebreak: the topic least-recently touched.
   - (c) Within-topic tiebreak: lowest prerequisite count (simpler concepts first).
5. Embed the probe **naturalistically** in the turn. Do NOT show the YAML's probe format verbatim; that's data. Translate it into the conversational shape:
   - `probe_kind: fill-blank` → set up the sentence in context, pause at the gap. Example: YAML has `"Nous ___ (parler) français tous les jours."` — in conversation: *"Tu as parlé à Marie hier? Elle m'a dit: 'Nous ___ (parler) ensemble tous les jours.' What goes in the gap?"*
   - `probe_kind: produce` → ask for the form in context. *"Quick — the past participle of 'manger'?"* or as part of a story: *"How would you say 'I ate the pizza'?"*
   - `probe_kind: recognize` → present the two options in a real-looking pair. *"Which sounds right: 'Je doute qu'il est là' or 'Je doute qu'il soit là'?"*
6. On the NEXT user turn, grade the answer:
   - Correct, spontaneous → `mastery_probe(concept.id, quality=5)`
   - Correct with hesitation / minor error self-corrected → 4
   - Correct after a small nudge → 3
   - Wrong but recognizable intent → 2
   - Blank / confused → 0, and DO NOT chain another probe — fall to a warm closing turn.
7. Log the concept to the opportunity entry with `kc_type` from the YAML.

Hard rules:
- **One probe per turn, maximum**. Chaining probes feels like a pop quiz.
- **Never probe on a proactive-opener turn**. That's grounds for coldness.
- **Respect confusion signals**. If the user's last turn was `?` or `??`, the next turn is spot-gloss or simplify-ladder, NOT a probe.
- **Never reveal you're probing**. "Let me test you on the subjunctive" is bad voice.
- **Do not probe in the base language only** (i.e. L0). At L0 the target-language surface is too thin to support a grammatical probe; wait until L1+.
