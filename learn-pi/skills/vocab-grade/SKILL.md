---
name: vocab-grade
description: At end of turn (when items_touched is non-empty) or end of session, grade each touched vocab/grammar item on the 0–5 SM-2 scale.
when_to_use: Called by learn-loop in onSessionEnd, or after any turn where items_touched has entries.
tools: [vocab.grade]
---

Steps:

For each item in `items_touched`, infer a quality score 0–5 from the user's
handling of it during the relevant turn(s), then call
`vocab.grade(lemma, quality)`.

Quality mapping:
- **5** — user produced it correctly and spontaneously, without a prompt.
- **4** — user produced it correctly after a small prompt.
- **3** — user understood it passively (no production) and did not flag confusion.
- **2** — user needed an inline gloss or re-explanation to keep going.
- **1** — user used it incorrectly or misunderstood.
- **0** — user drew a complete blank, or replied `?` on a turn containing this item.

Special cases:
- If the user replied `?` on a turn, ALL items_touched on that prior turn get
  quality 0.
- Never grade an item higher than 3 based on passive exposure alone.
- Session-end flush: any item in items_touched not already graded gets a
  default of 3 (passive understood).
