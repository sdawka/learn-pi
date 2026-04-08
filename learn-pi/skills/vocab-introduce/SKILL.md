---
name: vocab-introduce
description: When about to use a target-language lemma not yet in the vocab map, register it with an initial SM-2 state.
when_to_use: Trigger right before composing an assistant turn that will use a new target-language lemma.
tools: [vocab.introduce, vault.read]
learning_event: induction
---

Steps:

1. For each target-language lemma you plan to use in the next turn, check
   whether `vocab/<lang>/<lemma>.md` already exists (the main loop may pass
   you an `already_known` set to skip this check).
2. For each truly new lemma, call
   `vocab.introduce(lemma, lang, gloss, example)` where `gloss` is a short
   base-language definition and `example` is the exact sentence you will use
   it in. This creates the vocab file with SM-2 initial state.
3. Rules:
   - Single lemmas only. No phrases, no multi-word expressions.
   - At most **3** new lemmas per turn. If your planned turn has more, either
     drop back to a lower rung or defer the extras.
   - Use the dictionary lemma (infinitive for verbs, singular masculine for
     nouns where applicable), not the inflected form.
4. **Always pass `kc_type` and `topics` explicitly.** The decision rubric:
   - Single-meaning concrete word (`caballo`, `mesa`) → `kc_type: fact`
   - Inflectable verb or pronoun set (`ser`, `tener`) → `kc_type: skill`
   - Anything written to `grammar/` (rules with rationale) → use the
     `grammar.introduce` tool instead, which defaults `kc_type: principle`
   - `topics` is an optional `string[]` enabling per-topic mastery aggregation.
     Use lowercase snake_case: `["copula"]`, `["ser_estar", "verbs"]`. Tag
     liberally — the report rolls items up to topics for cleaner diagnostics.
5. After introducing, proceed with the turn. The main loop will grade touched
   items at turn/session end.
