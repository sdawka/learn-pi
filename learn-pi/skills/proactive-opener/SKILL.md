---
name: proactive-opener
description: When the user message is empty (the proactive ticker fired), compose an opening turn grounded in LEARNER.md + recent MEMORY.md entries, not a generic "let's practice".
when_to_use: Trigger when the user message is empty / whitespace-only. This is the proactive-tick path; a real user message should never route here.
tools: [vault_read]
learning_event: sense_making
learning_event_rationale: Surfaces a topic tied to the learner's life and recent context — cognitive work happens at the level of meaning, not retrieval.
---

The user didn't write anything — the proactive ticker fired. You are opening
the conversation. Your opener MUST be personal, not generic. No "¡Hola! Let's
practice Spanish today." That kind of turn wastes the proactive slot.

Steps:

1. `vault_read("LEARNER.md")`. If it's empty or missing, run the
   `bootstrap-learner` prompt template instead of composing an opener.
2. `vault_read("MEMORY.md")`. Take the last **5 non-empty lines** under
   `## Sessions`. If the file is empty, skip this step.
3. Pick ONE specific thread to open on, ranked:
   - (a) A recent MEMORY.md entry where the user "lit up", got curious, or
     mentioned a concrete detail (stable name, pet name, current project).
   - (b) An interest in LEARNER.md's `## Interests` section you haven't
     touched in the last 3 sessions.
   - (c) A domain where the concept graph is thin but the learner said
     something the last time it came up.
4. Compose the opener at the current ZPD rung (follow `zpd-calibrate` for
   style). The opener is a concrete question about the chosen thread —
   something only this specific learner would be asked. Examples of good vs.
   bad:
   - GOOD (L0): *"How's the training going with the new yegua (mare) you
     mentioned on Tuesday?"*
   - BAD: *"¿Cómo estás? ¿Qué tal tu día?"* (generic, impersonal, no tether)
5. After composing, if this opener is on a thread worth remembering,
   `memory-append` can record it at end-of-turn. Do NOT call `memory-append`
   from inside this skill.

Hard rules:
- Never open proactively with a question the user just answered in the
  previous session (check MEMORY.md for duplicates).
- Never run a probe (`mastery.probe`) as the proactive opener. Probes are
  separate turns and need cold-retrieval framing; openers should feel like a
  friend checking in.
- If LEARNER.md and MEMORY.md are both empty (first session), ask one
  warm base-language question drawn from `profile.md:interests` instead,
  and call `memory-append` at end-of-turn with the answer.
