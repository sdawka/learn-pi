---
description: Signal that the user is tired; reduce difficulty for the rest of this session
---

The user is tired. For the rest of this session:

1. Call `zpd.adjust(lang, -0.3, "user said tired")` to lower the rung for the active language.
2. Set the session-scoped flag `session_tired=true`. While this flag is set, shorten your turns and lower rung ceilings — prefer familiar vocabulary, shorter sentences, and gentler prompts.
3. Acknowledge in ONE short sentence in the user's base language. No apologies, no lecture. Then continue the conversation at the softer level.
