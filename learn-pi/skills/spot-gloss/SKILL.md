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
3. Compose a ONE-line base-language gloss that explains just that token. Be
   warm, not pedantic. Pattern: `"<token> means <plain-language meaning>."`
   Optional one-sentence example if it clarifies: *"caballo means horse — it's
   what you saw at the stable."*
4. Immediately restate your previous turn's question or commitment so the
   conversation continues. Do NOT rewrite the turn — the whole turn. Just the
   gloss + a one-line continuation.
5. Do NOT call `zpd_adjust`. This is a token-level scaffold, not a rung move.
6. If you genuinely cannot identify a single likely token (the turn was all
   base language, or contained no target words), fall through to
   `simplify-ladder` — the user may be more broadly confused after all.

Hard rule: one gloss, one restatement, that's the whole reply. Do not stack
multiple explanations or ask the user which word they meant.
