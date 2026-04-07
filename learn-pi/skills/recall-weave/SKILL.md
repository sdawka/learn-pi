---
name: recall-weave
description: Pull SM-2 due items and weave 1–2 of them invisibly into the next assistant turn on the current topic, without quizzing.
when_to_use: Trigger when session due-quota > 0 and the conversation is flowing naturally on a topic.
tools: [queue.due]
---

Your job: make spaced-recall practice *happen without the user noticing*.

Steps:

1. Call `queue.due(lang, 5)` to get up to five due items (lemmas or grammar
   points) sorted by urgency.
2. Score each by topic-fit against the current conversation topic. Pick **1 or
   2** items — never more — whose meaning plausibly belongs in the next turn.
3. Compose the next assistant turn at the current rung (use the directive from
   `zpd-calibrate`). Weave the chosen items in as natural, in-context use.
4. NEVER say "let's practice X", "try to remember X", "remember that X means
   Y", or any other flashcard framing. The user must not notice this is recall.
5. Report which items you wove (`items_touched`) so the main loop can grade
   them later. Do NOT grade them yourself.
6. If no due item fits naturally, weave **zero** and let the queue drain
   tomorrow. Forced weaving breaks the conversation.
