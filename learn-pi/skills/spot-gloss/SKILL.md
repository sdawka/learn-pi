---
name: spot-gloss
description: When the user sends exactly one "?" they are confused about one specific token, not the whole turn. Gloss that token in the base language, leave the rest intact, and do NOT change the ZPD rung.
when_to_use: Trigger when the user's latest message is exactly "?" (one question mark, nothing else). For "??", "huh", or repeated confusion use `simplify-ladder` instead.
tools: [vault_read]
learning_event: none
learning_event_rationale: Micro-scaffold at the token level, not a pedagogical mode or difficulty move. Orthogonal to LE class.
---

The user is stuck on a specific word or short phrase from your last turn, not
on the whole idea. Find the likely culprit and gloss only that — leave the
rest of your previous turn's meaning and rung intact. Do NOT drop the ZPD
subscore.

Steps:

1. Read the immediately previous assistant turn from conversation state.
2. Identify the **single most likely unfamiliar token** in that turn. Heuristics:
   - A target-language word you introduced for the first time this session
     (check `vault_read("vocab/<lang>/<lemma>.md")` — missing = brand new).
   - A target-language word with a known low mastery score.
   - The rarest / most morphologically complex target-language token.
   - If in doubt, pick the one *closest to the previous "?"* in the sentence.
3. Compose the reply as **one flowing message, two short sentences max**:
   - Sentence 1 — the gloss, conversational: start with "ah" or similar, then
     drop the meaning in one breath. `"Ah — 'caballo' is just 'horse'."`
   - Sentence 2 — return to the previous turn's question or thread. Restate it
     (slightly simpler is fine), or pivot to what the learner was about to do:
     `"So, back to you — did you ride today?"`
4. Do NOT call `zpd_adjust`. This is a token-level scaffold, not a rung move.
5. If you genuinely cannot identify a single likely token (the turn was all
   base language, or contained no target words), fall through to
   `simplify-ladder` — the user may be more broadly confused after all.

## Good vs bad

BAD (dictionary-stiff, dead-end comprehension check):
> Mente es "mind" en inglés.
>
> En la frase "¿Qué tienes en mente?", significa "What is on your mind?".
>
> ¿Comprendido?

GOOD (one breath, returns to the thread):
> Ah — "mente" is just "mind". So when I asked "¿qué tienes en mente?" I meant
> "what's on your mind?" — what are you thinking about today?

Hard rules:
- Never end with "Comprendido?", "¿Entendido?", "Understand?", "Got it?", or
  any isolated yes/no comprehension check. The return-to-thread IS the check.
- Never use glossary formatting (multi-paragraph, blank lines between
  "definition" and "example"). Prose. One breath.
- Never stack multiple glosses or ask the user which word they meant. Pick
  your best guess and move.
