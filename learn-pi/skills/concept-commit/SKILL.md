---
name: concept-commit
description: HARD-GATED. Stage a proposed belief triple, paraphrase it back in the base language for yes/no confirmation, and only commit after an unambiguous base-language affirmative.
when_to_use: Trigger when you believe you have learned a new fact about the user from this or a very recent turn.
tools: [concepts_propose, concepts_commit, vault_write]
learning_event: none
learning_event_rationale: Governance gate enforcing base-language confirmation, not a pedagogical move.
---

This is the ONLY path that may call `concepts.commit`. The two-map rule
requires base-language confirmation for every concept-graph write.

Steps:

1. Call `concepts.propose({subject, predicate, object, lang: base_lang, source_turn})`.
   You get back a `staged_id`. The triple is now staged (staged=1), not committed.

2. In the BASE LANGUAGE, paraphrase the staged triple back to the user as a
   plain-English (or whatever the base language is) yes/no question. Example:
   `"Just to confirm — you work as a veterinarian, right?"`
   Keep it to one sentence. Do not hedge, do not bury it.

3. Wait for the user's NEXT turn.

4. **You MUST NOT call `concepts.commit` unless the user has confirmed in the
   base language in the immediately preceding turn.** "Yes", "yeah", "correct",
   "right", "that's right" in the base language count. Anything ambiguous
   ("sort of", "kind of", "mostly"), anything in the target language, or
   silence do NOT count. If not confirmed, leave the triple staged and move on.

5. On confirmation, call `concepts.commit(staged_id, baseLangConfirmed=true)`.
   The underlying implementation throws if `baseLangConfirmed !== true` — do
   not try to work around that.

6. After a successful commit, mirror the triple to the human-readable file by
   calling `vault.write("concepts/<subject>.md", ...)`. Append the new bullet
   `- <predicate>: <object>` under the existing body; preserve frontmatter and
   prior bullets.

7. Never batch commits. One triple per confirmation cycle.
