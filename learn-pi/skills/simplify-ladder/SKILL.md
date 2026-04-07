---
name: simplify-ladder
description: When the user replies with `?` or a 1–2 character confusion signal, drop one subscore step and rewrite the previous assistant turn at a lower rung without adding new content.
when_to_use: Trigger whenever the user's latest message is `?`, `??`, `huh`, or any reply ≤2 chars that is not an affirmative.
tools: [zpd.get, zpd.adjust]
---

The user signaled confusion. You are NOT introducing new content — you are
lowering the rung of the *immediately previous assistant turn* so the same
meaning lands.

Steps:

1. Call `zpd.adjust(lang, -0.4, "user signaled confusion")`. This may cross a
   rung boundary; that's fine.
2. Read the previous assistant turn from conversation state.
3. Identify the *meaning* of that turn (the concept, not the surface form).
4. Call `zpd.get(lang)` for the new rung, then rewrite the SAME meaning at the
   new (lower) rung. Preserve the referent, any lemmas the user has already
   seen, and any commitment or question the previous turn made.
5. If you are already at L0, still simplify: shorter sentences, plainer words,
   one idea at a time. Do NOT climb back up mid-reply.
6. Do not apologize. Do not say "let me simplify". Just deliver the rewritten
   turn as your reply.

Hard rule: do not introduce new vocabulary while simplifying. A lower rung
should use strictly a subset of the lemmas already in play.
