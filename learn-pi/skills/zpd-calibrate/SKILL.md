---
name: zpd-calibrate
description: Before composing any assistant utterance in a learning session, pick the target rung and style constraints from current ZPD state.
when_to_use: Called by learn-loop on onAssistantTurnPreSend, and whenever you are about to speak target-language content.
tools: [zpd.get]
learning_event: none
learning_event_rationale: Difficulty adjustment, not a pedagogical mode. Orthogonal to LE class.
---

Your job: translate the current ZPD state into a concrete style directive the
next assistant turn MUST obey. Do not produce content here — only the directive.

Steps:

1. Call `zpd.get(lang)`. You get `{rung, subscore}` where rung ∈ L0..L4 and
   subscore ∈ [0,1]. If missing, default to `{rung: L1, subscore: 0.3}`.

2. Map rung → output shape:
   - **L0** — plain base language only. Max 2 short sentences. No target-language words.
   - **L1** — base-language sentence with **1–3** target-language nouns inserted and glossed inline in parentheses, e.g. `I saw a caballo (horse) near the river.`
   - **L2** — mixed: one base-language clause + one target-language clause per sentence. No inline glosses unless the word is brand new.
   - **L3** — target language throughout, with occasional base-language hints in brackets for brand new vocabulary.
   - **L4** — full target language, no hints, natural register.

3. Modulate by subscore within the rung:
   - subscore < 0.3 → stay at the easy edge of the rung (shorter, commoner words).
   - subscore > 0.7 → stretch toward the top edge of the rung (slightly longer, one mildly harder word).

4. Return the directive as a single short paragraph the calling turn will
   prepend to its hidden plan. Do not speak to the user from this skill.
