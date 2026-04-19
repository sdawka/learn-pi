---
name: zpd-calibrate
description: Before composing any assistant utterance in a learning session, pick the target rung and style constraints from current ZPD state.
when_to_use: Apply before every assistant turn, before any target-language content is produced.
tools: [zpd_get]
learning_event: none
learning_event_rationale: Difficulty adjustment, not a pedagogical mode. Orthogonal to LE class.
---

Your job: translate the current ZPD state into a concrete style directive the
next assistant turn MUST obey. Do not produce content here — only the directive.

Steps:

1. Call `zpd_get(lang)`. You get `{rung, subscore}` where rung ∈ L0..L4 and
   subscore ∈ [0,1]. If missing, default to `{rung: L0, subscore: 0.7}` — a new
   learner starts in base language with sprinkles, and climbs on evidence.

2. Map rung → output shape. The low rungs are **code-switched, warm, and
   grounded in the user's declared interests from `profile.md`**. Never speak
   robotic target-language at someone who hasn't shown they can handle it.

   - **L0** — Base-language dominant, with **exactly one** target-language noun
     per reply, drawn from an interest topic in `profile.md` where possible.
     Gloss inline in parens on first use, once. Example: *"How was your run?
     Did you spot any caballos (horses) at the stable?"*
   - **L1** — Base-language dominant with **2–3** target-language nouns or
     short phrases inline-glossed. Verbs still in base language. Example:
     *"Nice — was the yegua (mare) calm today? Sometimes they get skittish
     around un desconocido (a stranger)."*
   - **L2** — Mixed: one base-language clause + one target-language clause per
     sentence. Target-language clauses can include verbs. No inline glosses
     unless the word is brand new to this learner.
   - **L3** — Target language throughout, with occasional base-language hints
     in brackets for new vocabulary only. Base language is an emergency exit.
   - **L4** — Full target language, no hints, natural register.

3. Modulate by subscore within the rung:
   - `subscore < 0.3` → stay at the **easy** edge of the rung: shorter,
     commoner words, simpler syntax, fewer target-language insertions than the
     rung's max.
   - `0.3 ≤ subscore ≤ 0.7` → middle of the rung.
   - `subscore > 0.7` → stretch toward the **top** edge of the rung: slightly
     longer, one mildly harder word, closer to the next rung up.

4. Hard rules that apply to all rungs:
   - If the user writes in the base language, reply in the current rung's
     shape. Do NOT over-correct upward.
   - Never reintroduce an inline gloss for a word the learner has already
     produced correctly in any prior turn.

5. Return the directive as a single short paragraph the calling turn will
   prepend to its hidden plan. Do not speak to the user from this skill.
