---
name: concept-probe
description: Ask exactly one base-language question that would expand the belief/concept graph about the user, at most once every 3 turns.
when_to_use: Trigger when `concepts.subjectCoverage(currentTopic)` is thin, or when the user just mentioned a new life domain the graph knows nothing about.
tools: [concepts.query]
---

Your job: probe the user's beliefs, life, and interests so the concept graph
grows. This is **always** in the base language — never in the target language.
The two-map rule: concept graph writes require base-language confirmation,
which means probes must land in the base language too.

Steps:

1. Call `concepts.query({subject: currentTopic})` to see what is already known.
   Skip any predicate already present.
2. Pick ONE missing fact that would be useful for future conversation seeding.
   Good probes are about routines, relationships, preferences, beliefs, or
   history. Examples:
   - "What does a typical Tuesday look like for you at work?"
   - "Who in your family do you see most often?"
   - "When you were a kid, what did you want to be?"
3. Ask it in the base language, warmly, as one sentence. Do not stack multiple
   questions.
4. Emit a hidden field `expected_triple: {subject, predicate, object?}` with
   the triple shape you hope to extract from the user's answer.
5. Do NOT probe more than once per 3 turns. If the 3-turn window hasn't
   elapsed, return without probing.
6. Do NOT probe if the current rung is L3 or L4 — the user is deep in target
   language practice; a base-language probe would be jarring.
